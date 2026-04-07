import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { Collection } from './entities/collection.entity';
import { ImportedCollectionTree } from './entities/import-result.entity';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { CollectionImportService } from './collection-import.service';
import { CollectionExportService } from './collection-export.service';
import { EnvironmentsService } from './environments.service';
import { assertFileExists } from './fs.utils';

@Injectable()
export class CollectionsService {
  private readonly collectionsDir = path.join(process.cwd(), 'data', 'collections');

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
    files: Express.Multer.File[];
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
}
