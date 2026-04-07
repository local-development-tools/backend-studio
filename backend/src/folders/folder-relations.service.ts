import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { FolderStorageService } from './folder-storage.service';

@Injectable()
export class FolderRelationsService {
  private readonly rootDataDir = path.join(process.cwd(), 'data');
  private readonly collectionsDataDir = path.join(this.rootDataDir, 'collections');

  constructor(private readonly folderStorageService: FolderStorageService) {}

  async addFolderToCollection(collectionId: string, folderId: string): Promise<void> {
    const collectionMetaPath = path.join(this.collectionsDataDir, collectionId, 'meta.json');

    try {
      const metaData = await fs.readFile(collectionMetaPath, 'utf-8');
      const collection = JSON.parse(metaData);

      if (!collection.folders.includes(folderId)) {
        collection.folders.push(folderId);
        collection.updatedAt = new Date();
        await fs.writeFile(collectionMetaPath, JSON.stringify(collection, null, 2), 'utf-8');
      }
    } catch {
      throw new NotFoundException(`Collection with id ${collectionId} not found`);
    }
  }

  async removeFolderFromCollection(collectionId: string, folderId: string): Promise<void> {
    const collectionMetaPath = path.join(this.collectionsDataDir, collectionId, 'meta.json');

    try {
      const metaData = await fs.readFile(collectionMetaPath, 'utf-8');
      const collection = JSON.parse(metaData);

      collection.folders = collection.folders.filter((id: string) => id !== folderId);
      collection.updatedAt = new Date();
      await fs.writeFile(collectionMetaPath, JSON.stringify(collection, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  async addChildFolderToParent(parentFolderId: string, childFolderId: string): Promise<void> {
    const parentFolder = await this.folderStorageService.findFolderById(parentFolderId);

    if (!parentFolder) {
      throw new NotFoundException(`Folder with id ${parentFolderId} not found`);
    }

    const parentFolderPath = this.folderStorageService.resolveFolderPath(parentFolder);
    const parentMetaPath = path.join(parentFolderPath, 'meta.json');

    try {
      const metaData = await fs.readFile(parentMetaPath, 'utf-8');
      const parentMeta = JSON.parse(metaData);

      if (!parentMeta.folders.includes(childFolderId)) {
        parentMeta.folders.push(childFolderId);
        parentMeta.updatedAt = new Date();
        await fs.writeFile(parentMetaPath, JSON.stringify(parentMeta, null, 2), 'utf-8');
      }
    } catch {
      // ignore
    }
  }

  async removeChildFolderFromParent(parentFolderId: string, childFolderId: string): Promise<void> {
    const parentFolder = await this.folderStorageService.findFolderById(parentFolderId);

    if (!parentFolder) {
      return;
    }

    const parentFolderPath = this.folderStorageService.resolveFolderPath(parentFolder);
    const parentMetaPath = path.join(parentFolderPath, 'meta.json');

    try {
      const metaData = await fs.readFile(parentMetaPath, 'utf-8');
      const parentMeta = JSON.parse(metaData);

      parentMeta.folders = (parentMeta.folders ?? []).filter((id: string) => id !== childFolderId);
      parentMeta.updatedAt = new Date();
      await fs.writeFile(parentMetaPath, JSON.stringify(parentMeta, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }
}
