import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Folder } from './entities/folder.entity';

@Injectable()
export class FolderStorageService {
  private readonly rootDataDir = path.join(process.cwd(), 'data');
  private readonly collectionsDataDir = path.join(this.rootDataDir, 'collections');
  private readonly rootFoldersDir = path.join(this.rootDataDir, 'folders');

  async getRootFolders(): Promise<Folder[]> {
    try {
      const entries = await fs.readdir(this.rootFoldersDir, {
        withFileTypes: true,
      });
      const folders: Folder[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderPath = path.join(this.rootFoldersDir, entry.name);
          const metaPath = path.join(folderPath, 'meta.json');

          try {
            const metaData = await fs.readFile(metaPath, 'utf-8');
            const folder = JSON.parse(metaData) as Folder;
            folders.push(folder);
          } catch {
            const stats = await fs.stat(folderPath);
            folders.push({
              id: entry.name,
              name: entry.name,
              requests: [],
              folders: [],
              createdAt: stats.birthtime,
              updatedAt: stats.mtime,
            });
          }
        }
      }

      return folders;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async getFoldersByCollection(collectionId: string): Promise<Folder[]> {
    await this.ensureCollectionExists(collectionId);
    const foldersDir = path.join(this.collectionsDataDir, collectionId, 'folders');

    try {
      const entries = await fs.readdir(foldersDir, { withFileTypes: true });
      const folders: Folder[] = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const folderPath = path.join(foldersDir, entry.name);
          const metaPath = path.join(folderPath, 'meta.json');

          try {
            const metaData = await fs.readFile(metaPath, 'utf-8');
            const folder = JSON.parse(metaData) as Folder;
            folders.push(folder);
          } catch {
            const stats = await fs.stat(folderPath);
            folders.push({
              id: entry.name,
              name: entry.name,
              collectionId,
              requests: [],
              folders: [],
              createdAt: stats.birthtime,
              updatedAt: stats.mtime,
            });
          }
        }
      }

      return folders;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async findFolderById(id: string): Promise<Folder | null> {
    try {
      const rootFolderPath = path.join(this.rootFoldersDir, id);
      const rootMetaPath = path.join(rootFolderPath, 'meta.json');

      try {
        const rootMetaData = await fs.readFile(rootMetaPath, 'utf-8');
        return JSON.parse(rootMetaData) as Folder;
      } catch {
        // continue
      }

      const collections = await fs.readdir(this.collectionsDataDir, {
        withFileTypes: true,
      });

      for (const collection of collections) {
        if (collection.isDirectory()) {
          const folderPath = path.join(this.collectionsDataDir, collection.name, 'folders', id);
          const metaPath = path.join(folderPath, 'meta.json');

          try {
            const metaData = await fs.readFile(metaPath, 'utf-8');
            return JSON.parse(metaData) as Folder;
          } catch {
            continue;
          }
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  resolveFolderPath(folder: Folder): string {
    if (folder.collectionId) {
      return path.join(this.collectionsDataDir, folder.collectionId, 'folders', folder.id);
    }

    return path.join(this.rootFoldersDir, folder.id);
  }

  async ensureCollectionExists(collectionId: string): Promise<void> {
    const collectionMetaPath = path.join(this.collectionsDataDir, collectionId, 'meta.json');

    try {
      await fs.access(collectionMetaPath);
    } catch {
      throw new NotFoundException(`Collection with id ${collectionId} not found`);
    }
  }
}
