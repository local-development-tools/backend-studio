import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Request } from './entities/request.entity';
import { UpdateRequestDto } from './dto/update-request.dto';
import { RequestBruService } from './request-bru.service';

@Injectable()
export class RequestsService {
  private readonly dataDir = path.join(process.cwd(), 'data');
  private readonly rootRequestsDir = path.join(this.dataDir, 'requests');

  constructor(private readonly requestBruService: RequestBruService) {}

  async listRootRequests(): Promise<Request[]> {
    return this._listRequestsInDir(this.rootRequestsDir);
  }

  async listRequestsByCollection(collectionId: string): Promise<Request[]> {
    await this.ensureCollectionExists(collectionId);
    const dir = path.join(this.dataDir, 'collections', collectionId, 'requests');
    return this._listRequestsInDir(dir);
  }

  async listRequestsByFolder(folderId: string): Promise<Request[]> {
    const folder = await this.findFolderById(folderId);
    if (!folder) {
      throw new NotFoundException(`Folder with id ${folderId} not found`);
    }
    if (!folder.collectionId) {
      throw new NotFoundException(`Folder with id ${folderId} is not inside a collection`);
    }

    const dir = path.join(this.dataDir, 'collections', folder.collectionId, 'folders', folderId, 'requests');
    return this._listRequestsInDir(dir);
  }

  async getRequestById(id: string): Promise<Request> {
    const filePath = await this.findRequestFilePathById(id);
    if (!filePath) {
      throw new NotFoundException(`Request with id ${id} not found`);
    }

    const contents = await fs.readFile(filePath, 'utf-8');
    const parsed = this.requestBruService.fromBru(contents);

    const location = this._inferLocationFromPath(filePath);
    return {
      id,
      type: parsed.type,
      name: parsed.name,
      method: parsed.method,
      url: parsed.url,
      headers: parsed.headers,
      body: parsed.body,
      serverAddress: parsed.serverAddress,
      service: parsed.service,
      protoContent: parsed.protoContent,
      message: parsed.message,
      metadata: parsed.metadata,
      postScript: parsed.postScript,
      collectionId: location.collectionId,
      folderId: location.folderId,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    };
  }

  async updateRequest(id: string, updateRequestDto: UpdateRequestDto): Promise<Request> {
    const existingPath = await this.findRequestFilePathById(id);
    if (!existingPath) {
      throw new NotFoundException(`Request with id ${id} not found`);
    }

    if (updateRequestDto.url !== undefined && updateRequestDto.url.trim() === '') {
      throw new BadRequestException('Field "url" cannot be empty');
    }

    const existingContents = await fs.readFile(existingPath, 'utf-8');
    const existingParsed = this.requestBruService.fromBru(existingContents);
    const existingLocation = this._inferLocationFromPath(existingPath);

    const updated: Request = {
      id,
      type: updateRequestDto.type ?? existingParsed.type,
      name: updateRequestDto.name ?? existingParsed.name,
      method: updateRequestDto.method ?? existingParsed.method,
      url: updateRequestDto.url ?? existingParsed.url,
      headers: updateRequestDto.headers ?? existingParsed.headers,
      body: updateRequestDto.body ?? existingParsed.body,
      serverAddress: updateRequestDto.serverAddress ?? existingParsed.serverAddress,
      service: updateRequestDto.service ?? existingParsed.service,
      protoContent: updateRequestDto.protoContent ?? existingParsed.protoContent,
      message: updateRequestDto.message ?? existingParsed.message,
      metadata: updateRequestDto.metadata ?? existingParsed.metadata,
      postScript: updateRequestDto.postScript ?? existingParsed.postScript,
      collectionId: updateRequestDto.collectionId ?? existingLocation.collectionId,
      folderId: updateRequestDto.folderId ?? existingLocation.folderId,
      createdAt: new Date(0),
      updatedAt: new Date(),
    };

    const {
      filePath: newPath,
      collectionId,
      folderId,
    } = await this.resolveRequestFilePath({
      requestId: id,
      collectionId: updated.collectionId,
      folderId: updated.folderId,
    });

    await fs.mkdir(path.dirname(newPath), { recursive: true });
    await fs.writeFile(newPath, this.requestBruService.toBru(updated), 'utf-8');

    if (newPath !== existingPath) {
      await fs.rm(existingPath, { force: true });
      await this.removeRequestReference({
        requestId: id,
        collectionId: existingLocation.collectionId,
        folderId: existingLocation.folderId,
      });
      await this.addRequestReference({ requestId: id, collectionId, folderId });
    }

    updated.collectionId = collectionId;
    updated.folderId = folderId;
    return updated;
  }

  async deleteRequest(id: string): Promise<void> {
    const existingPath = await this.findRequestFilePathById(id);
    if (!existingPath) {
      throw new NotFoundException(`Request with id ${id} not found`);
    }

    const existingLocation = this._inferLocationFromPath(existingPath);
    await fs.rm(existingPath, { force: true });
    await this.removeRequestReference({
      requestId: id,
      collectionId: existingLocation.collectionId,
      folderId: existingLocation.folderId,
    });
  }

  async listFolderIdsInCollection(collectionId: string): Promise<string[]> {
    const foldersDir = path.join(this.dataDir, 'collections', collectionId, 'folders');
    try {
      const entries = await fs.readdir(foldersDir, { withFileTypes: true });
      return entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async _listRequestsInDir(dir: string): Promise<Request[]> {
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const requests: Request[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.bru')) {
          continue;
        }

        const filePath = path.join(dir, entry.name);
        const contents = await fs.readFile(filePath, 'utf-8');
        const parsed = this.requestBruService.fromBru(contents);
        const id = entry.name.replace(/\.bru$/i, '');
        const location = this._inferLocationFromPath(filePath);

        requests.push({
          id,
          type: parsed.type,
          name: parsed.name,
          method: parsed.method,
          url: parsed.url,
          headers: parsed.headers,
          body: parsed.body,
          serverAddress: parsed.serverAddress,
          service: parsed.service,
          protoContent: parsed.protoContent,
          message: parsed.message,
          metadata: parsed.metadata,
          postScript: parsed.postScript,
          collectionId: location.collectionId,
          folderId: location.folderId,
          createdAt: new Date(0),
          updatedAt: new Date(0),
        });
      }

      return requests;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  async resolveRequestFilePath(input: {
    requestId: string;
    collectionId?: string;
    folderId?: string;
  }): Promise<{ filePath: string; collectionId?: string; folderId?: string }> {
    if (input.folderId) {
      const folder = await this.findFolderById(input.folderId);
      if (!folder) {
        throw new NotFoundException(`Folder with id ${input.folderId} not found`);
      }
      if (!folder.collectionId) {
        throw new NotFoundException(`Folder with id ${input.folderId} is not inside a collection`);
      }

      const filePath = path.join(
        this.dataDir,
        'collections',
        folder.collectionId,
        'folders',
        input.folderId,
        'requests',
        `${input.requestId}.bru`,
      );

      return {
        filePath,
        collectionId: folder.collectionId,
        folderId: input.folderId,
      };
    }

    if (input.collectionId) {
      await this.ensureCollectionExists(input.collectionId);
      const filePath = path.join(this.dataDir, 'collections', input.collectionId, 'requests', `${input.requestId}.bru`);
      return {
        filePath,
        collectionId: input.collectionId,
        folderId: undefined,
      };
    }

    const filePath = path.join(this.rootRequestsDir, `${input.requestId}.bru`);
    return { filePath, collectionId: undefined, folderId: undefined };
  }

  async findRequestFilePathById(id: string): Promise<string | null> {
    const candidates: string[] = [];
    candidates.push(path.join(this.rootRequestsDir, `${id}.bru`));

    const collectionsDir = path.join(this.dataDir, 'collections');
    try {
      const collections = await fs.readdir(collectionsDir, {
        withFileTypes: true,
      });
      for (const collection of collections) {
        if (!collection.isDirectory()) {
          continue;
        }

        candidates.push(path.join(collectionsDir, collection.name, 'requests', `${id}.bru`));
        candidates.push(path.join(collectionsDir, collection.name, 'folders', '**', 'requests', `${id}.bru`));
      }
    } catch {
      // ignore
    }

    for (const candidate of candidates) {
      if (candidate.includes('**')) {
        const found = await this._globFind(candidate);
        if (found) {
          return found;
        }
        continue;
      }

      try {
        await fs.access(candidate);
        return candidate;
      } catch {
        // continue
      }
    }

    return null;
  }

  private async _globFind(pattern: string): Promise<string | null> {
    const parts = pattern.split('**');
    if (parts.length !== 2) {
      return null;
    }
    const [prefix, suffix] = parts;
    const baseDir = path.dirname(prefix);
    const relativePrefix = path.basename(prefix);
    const startDir = relativePrefix ? path.join(baseDir, relativePrefix) : baseDir;

    const queue: string[] = [startDir];
    while (queue.length > 0) {
      const current = queue.shift()!;
      try {
        const entries = await fs.readdir(current, { withFileTypes: true });
        for (const entry of entries) {
          const full = path.join(current, entry.name);
          if (entry.isDirectory()) {
            queue.push(full);
            continue;
          }
        }

        const maybe = path.join(current, suffix);
        try {
          await fs.access(maybe);
          return maybe;
        } catch {
          // continue
        }
      } catch {
        // continue
      }
    }

    return null;
  }

  private _inferLocationFromPath(filePath: string): {
    collectionId?: string;
    folderId?: string;
  } {
    const normalized = filePath.split(path.sep).join('/');
    const collectionsMarker = '/data/collections/';
    const idx = normalized.lastIndexOf(collectionsMarker);
    if (idx === -1) {
      return { collectionId: undefined, folderId: undefined };
    }

    const after = normalized.slice(idx + collectionsMarker.length);
    const parts = after.split('/');
    const collectionId = parts[0];
    const folderIndex = parts.indexOf('folders');
    if (folderIndex !== -1 && parts.length > folderIndex + 1) {
      return { collectionId, folderId: parts[folderIndex + 1] };
    }
    return { collectionId, folderId: undefined };
  }

  async findFolderById(id: string): Promise<{ id: string; collectionId: string } | null> {
    const collectionsDir = path.join(this.dataDir, 'collections');
    try {
      const collections = await fs.readdir(collectionsDir, {
        withFileTypes: true,
      });
      for (const collection of collections) {
        if (!collection.isDirectory()) {
          continue;
        }

        const folderMetaPath = path.join(collectionsDir, collection.name, 'folders', id, 'meta.json');
        try {
          const meta = await fs.readFile(folderMetaPath, 'utf-8');
          const parsed = JSON.parse(meta) as {
            id: string;
            collectionId: string;
          };
          return parsed;
        } catch {
          // continue
        }
      }
    } catch {
      return null;
    }

    return null;
  }

  async ensureCollectionExists(collectionId: string): Promise<void> {
    const collectionMetaPath = path.join(this.dataDir, 'collections', collectionId, 'meta.json');
    try {
      await fs.access(collectionMetaPath);
    } catch {
      throw new NotFoundException(`Collection with id ${collectionId} not found`);
    }
  }

  async addRequestReference(input: { requestId: string; collectionId?: string; folderId?: string }): Promise<void> {
    if (input.folderId && input.collectionId) {
      const folderMetaPath = path.join(
        this.dataDir,
        'collections',
        input.collectionId,
        'folders',
        input.folderId,
        'meta.json',
      );
      await this._pushIdInMetaArray(folderMetaPath, 'requests', input.requestId);
      return;
    }

    if (input.collectionId) {
      const collectionMetaPath = path.join(this.dataDir, 'collections', input.collectionId, 'meta.json');
      await this._pushIdInMetaArray(collectionMetaPath, 'requests', input.requestId);
    }
  }

  async removeRequestReference(input: { requestId: string; collectionId?: string; folderId?: string }): Promise<void> {
    if (input.folderId && input.collectionId) {
      const folderMetaPath = path.join(
        this.dataDir,
        'collections',
        input.collectionId,
        'folders',
        input.folderId,
        'meta.json',
      );
      await this._removeIdInMetaArray(folderMetaPath, 'requests', input.requestId);
      return;
    }

    if (input.collectionId) {
      const collectionMetaPath = path.join(this.dataDir, 'collections', input.collectionId, 'meta.json');
      await this._removeIdInMetaArray(collectionMetaPath, 'requests', input.requestId);
    }
  }

  private async _pushIdInMetaArray(metaPath: string, key: string, id: string): Promise<void> {
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as Record<string, unknown>;
      const arr: string[] = Array.isArray(meta[key]) ? (meta[key] as string[]) : [];
      if (!arr.includes(id)) {
        arr.push(id);
      }
      meta[key] = arr;
      meta['updatedAt'] = new Date();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }

  private async _removeIdInMetaArray(metaPath: string, key: string, id: string): Promise<void> {
    try {
      const meta = JSON.parse(await fs.readFile(metaPath, 'utf-8')) as Record<string, unknown>;
      const arr: string[] = Array.isArray(meta[key]) ? (meta[key] as string[]) : [];
      meta[key] = arr.filter((x) => x !== id);
      meta['updatedAt'] = new Date();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch {
      // ignore
    }
  }
}
