import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { Collection } from './entities/collection.entity';
import { ImportedCollectionTree } from './entities/import-result.entity';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { CollectionImportService } from './collection-import.service';
import { CollectionExportService } from './collection-export.service';
import AdmZip from 'adm-zip';
import { EnvironmentsService } from './environments.service';
import { assertFileExists } from './fs.utils';
import Docker from 'dockerode';
import { StoreCollectionDto } from './dto/store-collection.dto';
import tar from 'tar-fs';

const docker = new Docker();

@Injectable()
export class CollectionsService {
  private readonly collectionsDir = path.join(process.cwd(), 'data', 'collections');
  private readonly containersDir = path.join(process.cwd(), 'data', 'containers');
  private readonly hostExportRoot = '/host-exports';
  private readonly logger = new Logger(CollectionsService.name);

  constructor(
    private readonly collectionImportService: CollectionImportService,
    private readonly collectionExportService: CollectionExportService,
    private readonly environmentsService: EnvironmentsService,
  ) {}

  async getCollections(): Promise<Collection[]> {
    try {
      const entries = await fs.readdir(this.collectionsDir, {
        withFileTypes: true,
      });
      const collections: Collection[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const collectionPath = path.join(this.collectionsDir, entry.name);
          const metaPath = path.join(collectionPath, 'meta.json');

          try {
            const metaData = await fs.readFile(metaPath, 'utf-8');
            const collection = JSON.parse(metaData) as Collection;
            collections.push(collection);
          } catch {
            const stats = await fs.stat(collectionPath);
            collections.push({
              id: entry.name,
              name: entry.name,
              folders: [],
              requests: [],
              createdAt: stats.birthtime,
              updatedAt: stats.mtime,
            });
          }
        }
      }

      return collections;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async createCollection(createCollectionDto: CreateCollectionDto): Promise<Collection> {
    const id = randomUUID();
    const now = new Date();

    const collection: Collection = {
      id,
      name: createCollectionDto.name,
      folders: [],
      requests: [],
      activeEnvironment: 'local',
      createdAt: now,
      updatedAt: now,
    };

    const collectionPath = path.join(this.collectionsDir, id);
    await fs.mkdir(collectionPath, { recursive: true });

    const metaPath = path.join(collectionPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(collection, null, 2), 'utf-8');

    const hostKey = this._slugifyCollectionName(createCollectionDto.name) + '_host';
    await this.environmentsService.createEnvironment(id, 'local', {
      [hostKey]: 'http://localhost',
    });

    return collection;
  }

  private _slugifyCollectionName(name: string): string {
    return (
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '') || 'collection'
    );
  }

  importCollection(input: {
    files: Array<{ fieldname: string; originalname: string; buffer: Buffer }>;
    paths?: string | string[];
    collectionName?: string;
  }): Promise<ImportedCollectionTree> {
    return this.collectionImportService.importCollection(input);
  }

  getCollectionById(id: string): Promise<Collection> {
    return this._getCollectionById(id);
  }

  async exportCollectionZip(id: string): Promise<{ fileName: string; buffer: Buffer }> {
    const collection = await this._getCollectionById(id);
    return this.collectionExportService.exportCollectionZip(collection);
  }

  async storeCollection(
    id: string,
    storeCollectionDto: StoreCollectionDto,
  ): Promise<{ hostPath?: string; containerPath?: string }> {
    const collection = await this._getCollectionById(id);
    const sourcePath = await this.prepareCollectionSourceMirror(collection);
    const destination: { hostPath?: string; containerPath?: string } = {};
    const operations: Promise<void>[] = [];

    if (storeCollectionDto.containerId?.trim()) {
      const containerId = storeCollectionDto.containerId.trim();
      const containerTarget = storeCollectionDto.containerPath?.trim() || '/app/data/collections';
      operations.push(this.copyDirectoryToContainer(sourcePath, containerId, containerTarget));
      destination.containerPath = `${containerId}:${path.posix.join(containerTarget, collection.id)}`;
    }

    if (!operations.length) {
      throw new BadRequestException('Provide a container target');
    }

    await Promise.all(operations);
    this.logger.log(
      `Stored collection "${collection.id}" to ${destination.containerPath ? `container:${destination.containerPath}` : 'container:unknown'}`,
    );

    return destination;
  }

  async updateCollection(id: string, updateCollectionDto: UpdateCollectionDto): Promise<Collection> {
    const collection = await this._getCollectionById(id);

    if (updateCollectionDto.activeEnvironment !== undefined && updateCollectionDto.activeEnvironment !== null) {
      const envPath = path.join(
        this.collectionsDir,
        id,
        'environments',
        `${updateCollectionDto.activeEnvironment}.bru`,
      );
      await assertFileExists(envPath, `Environment "${updateCollectionDto.activeEnvironment}"`);
    }

    const updatedCollection: Collection = {
      ...collection,
      ...updateCollectionDto,
      activeEnvironment:
        updateCollectionDto.activeEnvironment === null
          ? undefined
          : (updateCollectionDto.activeEnvironment ?? collection.activeEnvironment),
      updatedAt: new Date(),
    };

    const collectionPath = path.join(this.collectionsDir, id);
    const metaPath = path.join(collectionPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(updatedCollection, null, 2), 'utf-8');

    return updatedCollection;
  }

  async deleteCollection(id: string): Promise<void> {
    const collectionPath = path.join(this.collectionsDir, id);

    try {
      await fs.access(collectionPath);
    } catch {
      throw new NotFoundException(`Collection with id ${id} not found`);
    }

    await fs.rm(collectionPath, { recursive: true, force: true });
  }

  private async _getCollectionById(id: string): Promise<Collection> {
    const collectionPath = path.join(this.collectionsDir, id);
    const metaPath = path.join(collectionPath, 'meta.json');

    try {
      const metaData = await fs.readFile(metaPath, 'utf-8');
      return JSON.parse(metaData) as Collection;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Collection with id ${id} not found`);
      }
      throw error;
    }
  }

  private async copyDirectory(sourcePath: string, destinationPath: string): Promise<void> {
    await fs.rm(destinationPath, { recursive: true, force: true });
    await fs.mkdir(path.dirname(destinationPath), { recursive: true });
    await fs.cp(sourcePath, destinationPath, { recursive: true });
  }

  private async prepareCollectionSourceMirror(collection: Collection): Promise<string> {
    const mirrorPath = path.join(this.containersDir, collection.id);

    await fs.rm(mirrorPath, { recursive: true, force: true });
    await fs.mkdir(mirrorPath, { recursive: true });

    const zipResult = await this.collectionExportService.exportCollectionZip(collection);
    const zip = new AdmZip(zipResult.buffer);
    zip.extractAllTo(mirrorPath, true);

    return mirrorPath;
  }

  private async copyDirectoryToContainer(
    sourcePath: string,
    containerId: string,
    containerTargetDir: string,
  ): Promise<void> {
    try {
      const container = docker.getContainer(containerId);
      await container.putArchive(tar.pack(sourcePath), { path: containerTargetDir });
    } catch (error) {
      throw new BadRequestException(
        `Failed to copy collection to container "${containerId}": ${(error as Error).message}`,
      );
    }
  }

  private normalizeHostSubpath(hostDirectory: string): string {
    return hostDirectory.trim().replace(/^[\\/]+/, '');
  }
}
