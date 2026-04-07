import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import AdmZip from 'adm-zip';
import { Collection } from './entities/collection.entity';

@Injectable()
export class CollectionExportService {
  private readonly collectionsDir = path.join(process.cwd(), 'data', 'collections');

  async exportCollectionZip(collection: Collection): Promise<{ fileName: string; buffer: Buffer }> {
    const zip = new AdmZip();

    const safeCollectionName = this.sanitizeZipSegment(collection.name) || `collection-${collection.id.slice(0, 8)}`;
    const fileName = `${safeCollectionName}.zip`;

    const brunoConfig = {
      version: '1',
      name: collection.name,
      type: 'collection',
      ignore: ['node_modules', '.git'],
    };
    zip.addFile('bruno.json', Buffer.from(JSON.stringify(brunoConfig, null, 2), 'utf-8'));

    const folderIds = await this.listFolderIds(collection.id);
    const exportFolderPathById = await this.buildExportFolderPaths({
      collectionId: collection.id,
      folderIds,
    });

    const rootRequestsDir = path.join(this.collectionsDir, collection.id, 'requests');
    await this.addRequestsDirToZip(zip, rootRequestsDir, '', new Set());

    for (const folderId of folderIds) {
      const folderMetaPath = path.join(this.collectionsDir, collection.id, 'folders', folderId, 'meta.json');
      const folderMeta = await this.readJsonIfExists(folderMetaPath);
      const folderName = String(folderMeta?.name ?? folderId);

      const relativeFolderPath = exportFolderPathById.get(folderId) ?? this.sanitizeZipSegment(folderName) ?? folderId;
      const folderBru = `meta {\n  name: ${folderName}\n  type: folder\n  seq: 1\n}\n`;
      zip.addFile(`${relativeFolderPath}/folder.bru`, Buffer.from(folderBru, 'utf-8'));

      if (folderMeta) {
        zip.addFile(`${relativeFolderPath}/meta.json`, Buffer.from(JSON.stringify(folderMeta, null, 2), 'utf-8'));
      }

      const folderRequestsDir = path.join(this.collectionsDir, collection.id, 'folders', folderId, 'requests');
      await this.addRequestsDirToZip(zip, folderRequestsDir, relativeFolderPath, new Set());
    }

    return { fileName, buffer: zip.toBuffer() };
  }

  private async listFolderIds(collectionId: string): Promise<string[]> {
    const foldersDir = path.join(this.collectionsDir, collectionId, 'folders');
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

  private async buildExportFolderPaths(input: {
    collectionId: string;
    folderIds: string[];
  }): Promise<Map<string, string>> {
    const byId = new Map<string, { name: string; relativePath?: string; parentId?: string | null }>();

    for (const folderId of input.folderIds) {
      const metaPath = path.join(this.collectionsDir, input.collectionId, 'folders', folderId, 'meta.json');
      const meta = await this.readJsonIfExists(metaPath);
      byId.set(folderId, {
        name: String(meta?.name ?? folderId),
        relativePath: typeof meta?.relativePath === 'string' ? meta.relativePath : undefined,
        parentId: typeof meta?.parentId === 'string' ? meta.parentId : meta?.parentId === null ? null : undefined,
      });
    }

    const resolved = new Map<string, string>();
    const resolving = new Set<string>();

    const resolveOne = (folderId: string): string => {
      if (resolved.has(folderId)) {
        return resolved.get(folderId)!;
      }

      const info = byId.get(folderId);
      if (!info) {
        resolved.set(folderId, folderId);
        return folderId;
      }

      if (resolving.has(folderId)) {
        const value = this.sanitizeZipSegment(info.name) || folderId;
        resolved.set(folderId, value);
        return value;
      }

      resolving.add(folderId);
      const parentId = info.parentId;
      const segment = this.sanitizeZipSegment(info.name) || folderId;
      let value: string;

      if (typeof parentId === 'string' && parentId.trim()) {
        value = `${resolveOne(parentId)}/${segment}`;
      } else if (info.relativePath) {
        const clean = info.relativePath
          .split('/')
          .map((seg: string) => this.sanitizeZipSegment(seg))
          .filter(Boolean)
          .join('/');
        value = clean || segment;
      } else {
        value = segment;
      }

      resolving.delete(folderId);
      resolved.set(folderId, value);
      return value;
    };

    for (const folderId of input.folderIds) {
      resolveOne(folderId);
    }

    const used = new Map<string, number>();
    for (const folderId of input.folderIds) {
      const p = resolved.get(folderId)!;
      const count = used.get(p) ?? 0;
      if (count === 0) {
        used.set(p, 1);
        continue;
      }
      used.set(p, count + 1);
      resolved.set(folderId, `${p}-${folderId.slice(0, 6)}`);
    }

    return resolved;
  }

  private async addRequestsDirToZip(
    zip: AdmZip,
    requestsDir: string,
    prefix: string,
    usedNames: Set<string>,
  ): Promise<void> {
    try {
      const entries = await fs.readdir(requestsDir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.bru')) {
          continue;
        }

        const filePath = path.join(requestsDir, entry.name);
        const contents = await fs.readFile(filePath, 'utf-8');
        const parsed = this.parseBru(contents);
        const displayName = (parsed.name ?? '').trim() || entry.name.replace(/\.bru$/i, '');
        const safe = this.sanitizeZipSegment(displayName) || entry.name.replace(/\.bru$/i, '');

        let outName = `${safe}.bru`;
        if (usedNames.has(outName)) {
          outName = `${safe}-${entry.name.replace(/\.bru$/i, '').slice(0, 6)}.bru`;
        }
        usedNames.add(outName);

        const outPath = prefix ? `${prefix}/${outName}` : outName;
        zip.addFile(outPath, Buffer.from(contents, 'utf-8'));
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return;
      }
      throw error;
    }
  }

  private async readJsonIfExists(filePath: string): Promise<any | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  private sanitizeZipSegment(value: string): string {
    const trimmed = (value ?? '').toString().trim();
    if (!trimmed) {
      return '';
    }

    const cleaned = trimmed
      .replace(/[\\/]/g, '-')
      .replace(/[<>:"|?*]/g, '')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned === '.' || cleaned === '..') {
      return '';
    }

    return cleaned;
  }

  private parseBru(contents: string): {
    type: 'http' | 'grpc';
    name: string;
    method: string;
    url: string;
  } {
    const meta = this.parseKeyValueBlock(this.extractBruBlock(contents, 'meta'));
    const name = (meta.name ?? '').trim();
    const type = (meta.type ?? 'http').toLowerCase() === 'grpc' ? 'grpc' : 'http';

    if (type === 'grpc') {
      const grpc = this.parseKeyValueBlock(this.extractBruBlock(contents, 'grpc'));
      return {
        type,
        name,
        method: (grpc.method ?? '').trim(),
        url: (grpc.serverAddress ?? '').trim(),
      };
    }

    const methodMatch = contents.match(/^\s*(get|post|put|patch|delete|head|options)\s*\{/im);
    const method = (methodMatch?.[1] ?? 'get').toUpperCase();
    const urlMatch = contents.match(/\burl:\s*([^\n\r]+)/i);

    return {
      type,
      name,
      method,
      url: (urlMatch?.[1] ?? '').trim(),
    };
  }

  private parseKeyValueBlock(raw: string | null): Record<string, string> {
    if (!raw) {
      return {};
    }

    const result: Record<string, string> = {};
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      const index = line.indexOf(':');
      if (index === -1) {
        continue;
      }

      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) {
        result[key] = value;
      }
    }

    return result;
  }

  private extractBruBlock(contents: string, blockName: string): string | null {
    const idx = contents.toLowerCase().indexOf(blockName.toLowerCase());
    if (idx === -1) {
      return null;
    }

    const openIdx = contents.indexOf('{', idx);
    if (openIdx === -1) {
      return null;
    }

    let depth = 0;
    for (let i = openIdx; i < contents.length; i++) {
      const ch = contents[i];
      if (ch === '{') {
        depth++;
        continue;
      }
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return contents.slice(openIdx + 1, i);
        }
      }
    }

    return null;
  }
}
