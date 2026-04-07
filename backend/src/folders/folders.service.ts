import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { Folder } from './entities/folder.entity';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { FolderStorageService } from './folder-storage.service';
import { FolderRelationsService } from './folder-relations.service';

@Injectable()
export class FoldersService {
  private readonly collectionsDataDir = path.join(process.cwd(), 'data', 'collections');
  private readonly rootFoldersDir = path.join(process.cwd(), 'data', 'folders');

  constructor(
    private readonly folderStorageService: FolderStorageService,
    private readonly folderRelationsService: FolderRelationsService,
  ) {}

  getFolderById(id: string): Promise<Folder> {
    return this.folderStorageService.findFolderById(id).then((folder) => {
      if (!folder) {
        throw new NotFoundException(`Folder with id ${id} not found`);
      }
      return folder;
    });
  }

  getFoldersByFolder(parentFolderId: string): Promise<Folder[]> {
    return this._getFoldersByFolder(parentFolderId);
  }

  getFoldersByCollection(collectionId: string): Promise<Folder[]> {
    return this.folderStorageService.getFoldersByCollection(collectionId);
  }

  private async _getFoldersByFolder(parentFolderId: string): Promise<Folder[]> {
    const parentFolder = await this.folderStorageService.findFolderById(parentFolderId);
    if (!parentFolder) {
      throw new NotFoundException(`Folder with id ${parentFolderId} not found`);
    }

    // Get child folder IDs from the parent folder's folders array
    const childFolderIds = parentFolder.folders ?? [];
    const childFolders: Folder[] = [];

    for (const childId of childFolderIds) {
      const childFolder = await this.folderStorageService.findFolderById(childId);
      if (childFolder) {
        childFolders.push(childFolder);
      }
    }

    return childFolders;
  }

  createRootFolder(createFolderDto: CreateFolderDto): Promise<Folder> {
    return this._createFolderInRoot(createFolderDto);
  }

  createFolderInCollection(collectionId: string, createFolderDto: CreateFolderDto): Promise<Folder> {
    return this._createFolderInCollection(collectionId, createFolderDto);
  }

  createFolderInFolder(folderId: string, createFolderDto: CreateFolderDto): Promise<Folder> {
    return this._createFolderInFolder(folderId, createFolderDto);
  }

  private async _createFolderInRoot(createFolderDto: CreateFolderDto): Promise<Folder> {
    const id = randomUUID();
    const now = new Date();

    const folder: Folder = {
      id,
      name: createFolderDto.name,
      requests: [],
      folders: [],
      createdAt: now,
      updatedAt: now,
    };

    const folderPath = path.join(this.rootFoldersDir, id);
    await fs.mkdir(folderPath, { recursive: true });

    const metaPath = path.join(folderPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(folder, null, 2), 'utf-8');

    return folder;
  }

  private async _createFolderInCollection(collectionId: string, createFolderDto: CreateFolderDto): Promise<Folder> {
    await this.folderStorageService.ensureCollectionExists(collectionId);
    const id = randomUUID();
    const now = new Date();

    const folder: Folder = {
      id,
      name: createFolderDto.name,
      collectionId,
      requests: [],
      folders: [],
      createdAt: now,
      updatedAt: now,
    };

    const folderPath = path.join(this.collectionsDataDir, collectionId, 'folders', id);
    await fs.mkdir(folderPath, { recursive: true });

    const metaPath = path.join(folderPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(folder, null, 2), 'utf-8');

    await this.folderRelationsService.addFolderToCollection(collectionId, id);

    return folder;
  }

  private async _createFolderInFolder(parentFolderId: string, createFolderDto: CreateFolderDto): Promise<Folder> {
    const parentFolder = await this.folderStorageService.findFolderById(parentFolderId);

    if (!parentFolder) {
      throw new NotFoundException(`Folder with id ${parentFolderId} not found`);
    }

    const id = randomUUID();
    const now = new Date();

    const folder: Folder = {
      id,
      name: createFolderDto.name,
      collectionId: parentFolder.collectionId,
      parentFolderId,
      requests: [],
      folders: [],
      createdAt: now,
      updatedAt: now,
    };

    const baseDir = parentFolder.collectionId
      ? path.join(this.collectionsDataDir, parentFolder.collectionId, 'folders')
      : this.rootFoldersDir;

    const folderPath = path.join(baseDir, id);
    await fs.mkdir(folderPath, { recursive: true });

    const metaPath = path.join(folderPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(folder, null, 2), 'utf-8');

    // Add child folder reference to parent
    await this.folderRelationsService.addChildFolderToParent(parentFolderId, id);

    if (parentFolder.collectionId) {
      await this.folderRelationsService.addFolderToCollection(parentFolder.collectionId, id);
    }

    return folder;
  }

  updateFolder(id: string, updateFolderDto: UpdateFolderDto): Promise<Folder> {
    return this._updateFolder(id, updateFolderDto);
  }

  private async _updateFolder(id: string, updateFolderDto: UpdateFolderDto): Promise<Folder> {
    const folder = await this.folderStorageService.findFolderById(id);

    if (!folder) {
      throw new NotFoundException(`Folder with id ${id} not found`);
    }

    const updatedFolder: Folder = {
      ...folder,
      ...updateFolderDto,
      updatedAt: new Date(),
    };

    const folderPath = this.folderStorageService.resolveFolderPath(folder);
    const metaPath = path.join(folderPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(updatedFolder, null, 2), 'utf-8');

    return updatedFolder;
  }

  deleteFolder(id: string): Promise<void> {
    return this._deleteFolder(id);
  }

  private async _deleteFolder(id: string): Promise<void> {
    const folder = await this.folderStorageService.findFolderById(id);

    if (!folder) {
      throw new NotFoundException(`Folder with id ${id} not found`);
    }

    const folderPath = this.folderStorageService.resolveFolderPath(folder);
    await fs.rm(folderPath, { recursive: true, force: true });

    if (folder.collectionId) {
      await this.folderRelationsService.removeFolderFromCollection(folder.collectionId, id);
    }

    if (folder.parentFolderId) {
      await this.folderRelationsService.removeChildFolderFromParent(folder.parentFolderId, id);
    }
  }
}
