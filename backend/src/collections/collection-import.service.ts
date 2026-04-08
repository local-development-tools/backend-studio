import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import AdmZip from 'adm-zip';
import { ImportedCollectionTree, ImportedFolderSummary, ImportedRequestSummary } from './entities/import-result.entity';
import { Collection } from './entities/collection.entity';

type ImportEntry = {
  relativePath: string;
  content: Buffer;
};

@Injectable()
export class CollectionImportService {
  private readonly collectionsDir = path.join(process.cwd(), 'data', 'collections');

  async importCollection(input: {
    files: Express.Multer.File[];
    paths?: string | string[];
    collectionName?: string;
  }): Promise<ImportedCollectionTree> {
    if (!input.files.length) {
      throw new BadRequestException('At least one file or archive is required');
    }

    const archiveFile = this.pickArchiveFile(input.files);
    const regularFiles = archiveFile ? input.files.filter((file) => file !== archiveFile) : input.files;

    if (archiveFile && regularFiles.length > 0) {
      throw new BadRequestException('Send either a zip archive or regular files, not both');
    }

    let entries: ImportEntry[] = [];
    let rootFolderName: string | null = null;

    if (archiveFile) {
      const extracted = this.extractEntriesFromArchive(archiveFile.buffer);
      entries = extracted.entries;
      rootFolderName = extracted.rootFolderName;
    } else {
      const extracted = this.extractEntriesFromMultipartFiles(regularFiles, input.paths);
      entries = extracted.entries;
      rootFolderName = extracted.rootFolderName;
    }

    if (!entries.length) {
      throw new BadRequestException('No importable files were found in payload');
    }

    const importedNameFromBru = this.extractCollectionNameFromEntries(entries);

    const id = randomUUID();
    const now = new Date();
    const collectionName =
      input.collectionName?.trim() || importedNameFromBru || rootFolderName || `imported-${id.slice(0, 8)}`;

    const collectionPath = path.join(this.collectionsDir, id);
    const sourcePath = path.join(collectionPath, 'source');

    await fs.mkdir(sourcePath, { recursive: true });
    await this.writeImportEntries(sourcePath, entries);
    await this.ensureBrunoCollectionConfig(sourcePath, collectionName);

    const tree = await this.buildImportedTree(sourcePath);

    const materialized = await this.materializeImportedTree({
      collectionId: id,
      sourcePath,
      tree,
      now,
    });

    try {
      await fs.rm(sourcePath, { recursive: true, force: true });
    } catch {
      // ignore
    }

    const collection: Collection = {
      id,
      name: collectionName,
      folders: materialized.folders
        .filter((folder) => !folder.parentId)
        .map((folder) => folder.id!)
        .filter(Boolean),
      requests: materialized.collectionRequestIds,
      createdAt: now,
      updatedAt: now,
    };

    const metaPath = path.join(collectionPath, 'meta.json');
    await fs.writeFile(metaPath, JSON.stringify(collection, null, 2), 'utf-8');

    return {
      collection: {
        id,
        name: collectionName,
        sourcePath: null,
        createdAt: now,
        updatedAt: now,
      },
      folders: materialized.folders,
      requests: materialized.requests,
    };
  }

  private async materializeImportedTree(input: {
    collectionId: string;
    sourcePath: string;
    tree: {
      folders: ImportedFolderSummary[];
      requests: ImportedRequestSummary[];
    };
    now: Date;
  }): Promise<{
    folders: ImportedFolderSummary[];
    requests: ImportedRequestSummary[];
    collectionRequestIds: string[];
  }> {
    const foldersDir = path.join(this.collectionsDir, input.collectionId, 'folders');
    const collectionRequestsDir = path.join(this.collectionsDir, input.collectionId, 'requests');
    await fs.mkdir(foldersDir, { recursive: true });
    await fs.mkdir(collectionRequestsDir, { recursive: true });

    const folderIdByRelativePath = new Map<string, string>();
    for (const folder of input.tree.folders) {
      const folderId = randomUUID();
      folderIdByRelativePath.set(folder.relativePath, folderId);
      folder.id = folderId;
    }

    const sourceMetadataByFolder = new Map<string, unknown>();
    const relativePathByOldFolderId = new Map<string, string>();
    for (const folder of input.tree.folders) {
      const sourceMetaPath = path.join(input.sourcePath, ...folder.relativePath.split('/'), 'meta.json');
      try {
        const metaContent = await fs.readFile(sourceMetaPath, 'utf-8');
        const parsedMeta = JSON.parse(metaContent);
        sourceMetadataByFolder.set(folder.relativePath, parsedMeta);
        if (typeof parsedMeta?.id === 'string' && parsedMeta.id.trim()) {
          relativePathByOldFolderId.set(parsedMeta.id, folder.relativePath);
        }
      } catch {
        // ignore
      }
    }

    const oldParentIdByOldChildId = new Map<string, string>();
    for (const metadata of sourceMetadataByFolder.values()) {
      if (!Array.isArray(metadata?.folders) || typeof metadata?.id !== 'string') {
        continue;
      }

      const oldParentId = metadata.id;
      for (const oldChildId of metadata.folders) {
        if (typeof oldChildId === 'string' && oldChildId.trim()) {
          oldParentIdByOldChildId.set(oldChildId, oldParentId);
        }
      }
    }

    const getNewParentId = (oldParentId: string | null | undefined): string | null => {
      if (!oldParentId) {
        return null;
      }

      const parentRelativePath = relativePathByOldFolderId.get(oldParentId);
      if (!parentRelativePath) {
        return null;
      }

      return folderIdByRelativePath.get(parentRelativePath) ?? null;
    };

    const getOldFolderId = (metadata: unknown): string | null => {
      if (!metadata || typeof metadata !== 'object') {
        return null;
      }

      const id = (metadata as { id?: unknown }).id;
      if (typeof id === 'string' && id.trim()) {
        return id;
      }

      return null;
    };

    const childFoldersByParentId = new Map<string, string[]>();
    for (const folder of input.tree.folders) {
      const sourceMetadata = sourceMetadataByFolder.get(folder.relativePath);
      const oldFolderId = getOldFolderId(sourceMetadata);

      if (typeof sourceMetadata?.parentId === 'string' && sourceMetadata.parentId.trim()) {
        folder.parentId = getNewParentId(sourceMetadata.parentId);
      } else if (oldFolderId && oldParentIdByOldChildId.has(oldFolderId)) {
        folder.parentId = getNewParentId(oldParentIdByOldChildId.get(oldFolderId));
      } else {
        folder.parentId = folder.parentRelativePath
          ? (folderIdByRelativePath.get(folder.parentRelativePath) ?? null)
          : null;
      }

      if (folder.parentId) {
        const children = childFoldersByParentId.get(folder.parentId) ?? [];
        children.push(folder.id!);
        childFoldersByParentId.set(folder.parentId, children);
      }
    }

    for (const folder of input.tree.folders) {
      const folderPath = path.join(foldersDir, folder.id!);
      await fs.mkdir(path.join(folderPath, 'requests'), { recursive: true });

      const folderMetaPath = path.join(folderPath, 'meta.json');
      const meta = {
        id: folder.id,
        name: folder.name,
        collectionId: input.collectionId,
        requests: [],
        folders: childFoldersByParentId.get(folder.id!) ?? [],
        relativePath: folder.relativePath,
        parentRelativePath: folder.parentRelativePath,
        parentId: folder.parentId,
        createdAt: input.now,
        updatedAt: input.now,
      };
      await fs.writeFile(folderMetaPath, JSON.stringify(meta, null, 2), 'utf-8');
    }

    const requestIdsInCollection: string[] = [];
    const requestIdsByFolderId = new Map<string, string[]>();

    for (const request of input.tree.requests) {
      const requestId = randomUUID();
      const sourceFile = path.join(input.sourcePath, ...request.relativePath.split('/'));
      const contents = await fs.readFile(sourceFile, 'utf-8');

      const folderId = request.folderRelativePath
        ? (folderIdByRelativePath.get(request.folderRelativePath) ?? null)
        : null;
      request.folderId = folderId;
      request.id = requestId;

      if (folderId) {
        const arr = requestIdsByFolderId.get(folderId) ?? [];
        arr.push(requestId);
        requestIdsByFolderId.set(folderId, arr);

        const dest = path.join(foldersDir, folderId, 'requests', `${requestId}.bru`);
        await fs.writeFile(dest, contents, 'utf-8');
      } else {
        requestIdsInCollection.push(requestId);
        const dest = path.join(collectionRequestsDir, `${requestId}.bru`);
        await fs.writeFile(dest, contents, 'utf-8');
      }
    }

    for (const [folderId, requestIds] of requestIdsByFolderId.entries()) {
      const folderMetaPath = path.join(foldersDir, folderId, 'meta.json');
      try {
        const meta = JSON.parse(await fs.readFile(folderMetaPath, 'utf-8'));
        meta.requests = requestIds;
        meta.updatedAt = new Date();
        await fs.writeFile(folderMetaPath, JSON.stringify(meta, null, 2), 'utf-8');
      } catch {
        // ignore
      }
    }

    return {
      folders: input.tree.folders,
      requests: input.tree.requests,
      collectionRequestIds: requestIdsInCollection,
    };
  }

  private pickArchiveFile(files: Express.Multer.File[]): Express.Multer.File | null {
    const archives = files.filter(
      (file) => file.fieldname === 'archive' || file.originalname.toLowerCase().endsWith('.zip'),
    );

    if (!archives.length) {
      return null;
    }

    if (archives.length > 1) {
      throw new BadRequestException('Only one zip archive is allowed');
    }

    return archives[0];
  }

  private extractEntriesFromArchive(buffer: Buffer): {
    entries: ImportEntry[];
    rootFolderName: string | null;
  } {
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries().filter((entry) => !entry.isDirectory);
    const entries: ImportEntry[] = [];

    for (const entry of zipEntries) {
      const rawPath = entry.entryName;
      if (rawPath.startsWith('__MACOSX/')) {
        continue;
      }

      const normalizedPath = this.normalizeRelativePath(rawPath);
      if (normalizedPath.toLowerCase().endsWith('/.ds_store') || normalizedPath.toLowerCase() === '.ds_store') {
        continue;
      }

      entries.push({
        relativePath: normalizedPath,
        content: entry.getData(),
      });
    }

    return this.stripCommonRootFolder(entries);
  }

  private extractEntriesFromMultipartFiles(
    files: Express.Multer.File[],
    pathsInput?: string | string[],
  ): { entries: ImportEntry[]; rootFolderName: string | null } {
    const providedPaths = this.normalizePathsInput(pathsInput);
    if (providedPaths.length > 0 && providedPaths.length !== files.length) {
      throw new BadRequestException('Field "paths" must match files count when provided');
    }

    const entries: ImportEntry[] = files.map((file, index) => {
      const rawPath = providedPaths[index] ?? file.originalname;
      const relativePath = this.normalizeRelativePath(rawPath);
      return {
        relativePath,
        content: file.buffer,
      };
    });

    return this.stripCommonRootFolder(entries);
  }

  private normalizePathsInput(pathsInput?: string | string[]): string[] {
    if (!pathsInput) {
      return [];
    }

    if (Array.isArray(pathsInput)) {
      return pathsInput.map((item) => String(item));
    }

    const trimmed = pathsInput.trim();
    if (!trimmed) {
      return [];
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item));
      }
    } catch {
      // treat as single path
    }

    return [trimmed];
  }

  private normalizeRelativePath(rawPath: string): string {
    const normalized = rawPath.replace(/\\/g, '/').trim().replace(/^\/+/, '').replace(/^\.\//, '');
    if (!normalized) {
      throw new BadRequestException('Import file path cannot be empty');
    }

    if (/^[A-Za-z]:\//.test(normalized)) {
      throw new BadRequestException(`Windows absolute path is not allowed: ${rawPath}`);
    }

    const parts = normalized.split('/').filter((part) => part.length > 0 && part !== '.');
    if (!parts.length) {
      throw new BadRequestException(`Invalid import file path: ${rawPath}`);
    }

    if (parts.some((part) => part === '..')) {
      throw new BadRequestException(`Path traversal is not allowed: ${rawPath}`);
    }

    return parts.join('/');
  }

  private stripCommonRootFolder(entries: ImportEntry[]): {
    entries: ImportEntry[];
    rootFolderName: string | null;
  } {
    if (!entries.length) {
      return { entries, rootFolderName: null };
    }

    const firstSegments = entries.map((entry) => entry.relativePath.split('/')[0]);
    const first = firstSegments[0];
    const hasCommonRoot = firstSegments.every((segment) => segment === first);
    const everyPathNested = entries.every((entry) => entry.relativePath.includes('/'));

    if (!hasCommonRoot || !everyPathNested) {
      return { entries, rootFolderName: null };
    }

    const strippedEntries = entries.map((entry) => ({
      ...entry,
      relativePath: entry.relativePath.slice(first.length + 1),
    }));

    return { entries: strippedEntries, rootFolderName: first };
  }

  private extractCollectionNameFromEntries(entries: ImportEntry[]): string | null {
    const rootMeta = entries.find((entry) => entry.relativePath.toLowerCase() === 'meta.json');
    if (rootMeta) {
      try {
        const parsed = JSON.parse(rootMeta.content.toString('utf-8')) as {
          name?: string;
        };
        if (typeof parsed.name === 'string' && parsed.name.trim()) {
          return parsed.name.trim();
        }
      } catch {
        // ignore malformed meta.json
      }
    }

    const brunoConfig = entries.find((entry) => entry.relativePath.toLowerCase() === 'bruno.json');
    if (!brunoConfig) {
      return null;
    }

    try {
      const parsed = JSON.parse(brunoConfig.content.toString('utf-8')) as {
        name?: string;
      };
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        return parsed.name.trim();
      }
    } catch {
      // ignore malformed bruno.json
    }

    return null;
  }

  private async writeImportEntries(targetRoot: string, entries: ImportEntry[]): Promise<void> {
    for (const entry of entries) {
      const destination = path.join(targetRoot, ...entry.relativePath.split('/'));
      await fs.mkdir(path.dirname(destination), { recursive: true });
      await fs.writeFile(destination, entry.content);
    }
  }

  private async ensureBrunoCollectionConfig(collectionRoot: string, collectionName: string): Promise<void> {
    const brunoConfigPath = path.join(collectionRoot, 'bruno.json');
    try {
      await fs.access(brunoConfigPath);
      return;
    } catch {
      // create config if missing
    }

    const config = {
      version: '1',
      name: collectionName,
      type: 'collection',
      ignore: ['node_modules', '.git'],
    };

    await fs.writeFile(brunoConfigPath, JSON.stringify(config, null, 2), 'utf-8');
  }

  private async buildImportedTree(collectionRoot: string): Promise<{
    folders: ImportedFolderSummary[];
    requests: ImportedRequestSummary[];
  }> {
    const metadataTree = await this.buildImportedTreeFromMetadata(collectionRoot);
    if (metadataTree) {
      return metadataTree;
    }

    const folders: ImportedFolderSummary[] = [];
    const requests: ImportedRequestSummary[] = [];

    await this.scanImportDirectory(collectionRoot, collectionRoot, folders, requests);

    folders.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    requests.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { folders, requests };
  }

  private async buildImportedTreeFromMetadata(collectionRoot: string): Promise<{
    folders: ImportedFolderSummary[];
    requests: ImportedRequestSummary[];
  } | null> {
    const metaJsonFiles = await this.findMetaJsonFiles(collectionRoot);
    if (!metaJsonFiles.length) {
      return null;
    }

    type SourceFolderMeta = {
      oldId: string | null;
      name: string;
      relativeDirectory: string;
      parentOldId: string | null;
      childOldIds: string[];
      metaRelativePath: string | null;
      metaParentRelativePath: string | null;
    };

    const sourceFolders: SourceFolderMeta[] = [];
    const sourceFolderByOldId = new Map<string, SourceFolderMeta>();
    const parentByChildId = new Map<string, string>();

    for (const metaJsonFile of metaJsonFiles) {
      const folderDirectory = path.dirname(metaJsonFile);
      const relativeDirectory = this.toPosixRelativePath(collectionRoot, folderDirectory);
      if (relativeDirectory === '.') {
        continue;
      }

      const meta = await this.readJsonIfExists(metaJsonFile);
      if (!meta || typeof meta !== 'object') {
        continue;
      }

      const oldId = typeof meta?.id === 'string' && meta.id.trim() ? meta.id.trim() : null;
      const name =
        typeof meta?.name === 'string' && meta.name.trim() ? meta.name.trim() : path.basename(relativeDirectory);
      const parentOldId = typeof meta?.parentId === 'string' && meta.parentId.trim() ? meta.parentId.trim() : null;
      const childOldIds = Array.isArray(meta?.folders)
        ? meta.folders.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
        : [];
      const metaRelativePath = this.normalizeOptionalMetaPath(meta?.relativePath);
      const metaParentRelativePath = this.normalizeOptionalMetaPath(meta?.parentRelativePath);

      const sourceFolder: SourceFolderMeta = {
        oldId,
        name,
        relativeDirectory,
        parentOldId,
        childOldIds,
        metaRelativePath,
        metaParentRelativePath,
      };

      sourceFolders.push(sourceFolder);
      if (oldId) {
        sourceFolderByOldId.set(oldId, sourceFolder);
      }
      for (const childOldId of childOldIds) {
        if (!parentByChildId.has(childOldId) && oldId) {
          parentByChildId.set(childOldId, oldId);
        }
      }
    }

    if (!sourceFolders.length) {
      return null;
    }

    const collectionMeta = await this.readJsonIfExists(path.join(collectionRoot, 'meta.json'));
    const collectionRootIds = Array.isArray(collectionMeta?.folders)
      ? collectionMeta.folders.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
      : [];

    let selectedFolders = sourceFolders;
    if (collectionRootIds.length > 0 && sourceFolderByOldId.size > 0) {
      const includedIds = new Set<string>();
      const queue = [...collectionRootIds];

      while (queue.length > 0) {
        const currentId = queue.shift()!;
        if (includedIds.has(currentId)) {
          continue;
        }

        includedIds.add(currentId);
        const currentFolder = sourceFolderByOldId.get(currentId);
        if (!currentFolder) {
          continue;
        }

        for (const childId of currentFolder.childOldIds) {
          if (!includedIds.has(childId)) {
            queue.push(childId);
          }
        }
      }

      if (includedIds.size > 0) {
        selectedFolders = sourceFolders.filter((folder) => folder.oldId && includedIds.has(folder.oldId));
      }
    }

    if (!selectedFolders.length) {
      return null;
    }

    const selectedFolderByOldId = new Map<string, SourceFolderMeta>();
    for (const folder of selectedFolders) {
      if (folder.oldId) {
        selectedFolderByOldId.set(folder.oldId, folder);
      }
    }

    const basePathByOldId = new Map<string, string>();
    const resolvingOldIds = new Set<string>();

    const resolveBasePath = (folder: SourceFolderMeta): string => {
      if (!folder.oldId) {
        return this.normalizeRelativePath(folder.relativeDirectory);
      }

      const cached = basePathByOldId.get(folder.oldId);
      if (cached) {
        return cached;
      }

      if (resolvingOldIds.has(folder.oldId)) {
        const cycleSegment = this.sanitizeFolderPathSegment(folder.name) || folder.oldId;
        basePathByOldId.set(folder.oldId, cycleSegment);
        return cycleSegment;
      }

      resolvingOldIds.add(folder.oldId);
      const parentOldId = folder.parentOldId ?? parentByChildId.get(folder.oldId) ?? null;
      const segment = this.sanitizeFolderPathSegment(folder.name) || folder.oldId;

      let resolved: string;
      if (parentOldId && parentOldId !== folder.oldId && selectedFolderByOldId.has(parentOldId)) {
        resolved = `${resolveBasePath(selectedFolderByOldId.get(parentOldId)!)}/${segment}`;
      } else {
        resolved = segment;
      }

      resolvingOldIds.delete(folder.oldId);
      basePathByOldId.set(folder.oldId, resolved);
      return resolved;
    };

    const usedRelativePaths = new Map<string, number>();
    const relativePathByOldId = new Map<string, string>();
    const relativePathByDirectory = new Map<string, string>();

    for (const folder of selectedFolders) {
      let relativePath =
        folder.metaRelativePath ||
        (folder.oldId ? resolveBasePath(folder) : this.normalizeRelativePath(folder.relativeDirectory));

      const existingCount = usedRelativePaths.get(relativePath) ?? 0;
      if (existingCount > 0) {
        const suffix = folder.oldId ? folder.oldId.slice(0, 6) : String(existingCount + 1);
        relativePath = `${relativePath}-${suffix}`;
      }
      usedRelativePaths.set(relativePath, existingCount + 1);

      relativePathByDirectory.set(folder.relativeDirectory, relativePath);
      if (folder.oldId) {
        relativePathByOldId.set(folder.oldId, relativePath);
      }
    }

    const folders: ImportedFolderSummary[] = [];
    const validRelativePaths = new Set(relativePathByDirectory.values());

    for (const folder of selectedFolders) {
      const relativePath = relativePathByDirectory.get(folder.relativeDirectory)!;

      let parentRelativePath: string | null = null;
      if (folder.metaParentRelativePath && validRelativePaths.has(folder.metaParentRelativePath)) {
        parentRelativePath = folder.metaParentRelativePath;
      } else if (folder.oldId) {
        const parentOldId = folder.parentOldId ?? parentByChildId.get(folder.oldId) ?? null;
        if (parentOldId) {
          parentRelativePath = relativePathByOldId.get(parentOldId) ?? null;
        }
      }

      if (!parentRelativePath) {
        const derivedParent = path.dirname(relativePath).split(path.sep).join('/');
        parentRelativePath = derivedParent === '.' ? null : derivedParent;
      }

      folders.push({
        name: folder.name,
        relativePath,
        parentRelativePath,
      });
    }

    const requests: ImportedRequestSummary[] = [];
    await this.scanImportDirectory(collectionRoot, collectionRoot, [], requests, false);

    const filteredRequests: ImportedRequestSummary[] = [];

    for (const request of requests) {
      const requestFolderRelativePath = this.resolveRequestFolderRelativePath(
        request.relativePath,
        relativePathByDirectory,
        false,
      );

      const requestDirectory = path.dirname(request.relativePath).split(path.sep).join('/');
      const isRootRequest = requestDirectory === '.';
      if (!requestFolderRelativePath && !isRootRequest) {
        continue;
      }

      request.folderRelativePath = requestFolderRelativePath;
      filteredRequests.push(request);
    }

    folders.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
    filteredRequests.sort((a, b) => a.relativePath.localeCompare(b.relativePath));

    return { folders, requests: filteredRequests };
  }

  private async scanImportDirectory(
    rootPath: string,
    currentPath: string,
    folders: ImportedFolderSummary[],
    requests: ImportedRequestSummary[],
    collectFolders = true,
  ): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    if (collectFolders && currentPath !== rootPath) {
      const relativePath = this.toPosixRelativePath(rootPath, currentPath);
      const parentRelativePath = path.dirname(relativePath);
      folders.push({
        name: await this.readFolderDisplayName(currentPath),
        relativePath,
        parentRelativePath: parentRelativePath === '.' ? null : parentRelativePath.split(path.sep).join('/'),
      });
    }

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__MACOSX') {
          continue;
        }

        await this.scanImportDirectory(rootPath, path.join(currentPath, entry.name), folders, requests, collectFolders);
        continue;
      }

      if (!entry.isFile() || !entry.name.toLowerCase().endsWith('.bru') || entry.name === 'folder.bru') {
        continue;
      }

      const filePath = path.join(currentPath, entry.name);
      const relativeFilePath = this.toPosixRelativePath(rootPath, filePath);
      const folderRelativePath = path.dirname(relativeFilePath);
      const parsed = this.parseBru(await fs.readFile(filePath, 'utf-8'));

      requests.push({
        id: relativeFilePath.replace(/\.bru$/i, ''),
        name: parsed.name || entry.name.replace(/\.bru$/i, ''),
        type: parsed.type,
        method: parsed.method,
        url: parsed.url,
        relativePath: relativeFilePath,
        folderRelativePath: folderRelativePath === '.' ? null : folderRelativePath.split(path.sep).join('/'),
      });
    }
  }

  private async findMetaJsonFiles(rootPath: string): Promise<string[]> {
    const metaJsonFiles: string[] = [];
    await this.collectMetaJsonFiles(rootPath, metaJsonFiles);
    return metaJsonFiles;
  }

  private async collectMetaJsonFiles(currentPath: string, metaJsonFiles: string[]): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__MACOSX') {
          continue;
        }

        await this.collectMetaJsonFiles(path.join(currentPath, entry.name), metaJsonFiles);
        continue;
      }

      if (entry.isFile() && entry.name === 'meta.json') {
        metaJsonFiles.push(path.join(currentPath, entry.name));
      }
    }
  }

  private async readFolderDisplayName(folderPath: string): Promise<string> {
    const folderBruPath = path.join(folderPath, 'folder.bru');
    try {
      const contents = await fs.readFile(folderBruPath, 'utf-8');
      const meta = this.parseKeyValueBlock(this.extractBruBlock(contents, 'meta'));
      const name = (meta.name ?? '').trim();
      if (name) {
        return name;
      }
    } catch {
      // ignore malformed or missing folder.bru
    }

    return path.basename(folderPath);
  }

  private toPosixRelativePath(rootPath: string, targetPath: string): string {
    return path.relative(rootPath, targetPath).split(path.sep).join('/');
  }

  private resolveRequestFolderRelativePath(
    requestRelativePath: string,
    folderRelativePathByDirectory: Map<string, string>,
    allowFallbackToDirectory = true,
  ): string | null {
    let current = path.dirname(requestRelativePath);
    if (current === '.') {
      return null;
    }

    while (current && current !== '.') {
      const mapped = folderRelativePathByDirectory.get(current);
      if (mapped) {
        return mapped;
      }

      current = path.dirname(current);
    }

    if (!allowFallbackToDirectory) {
      return null;
    }

    return path.dirname(requestRelativePath) === '.' ? null : path.dirname(requestRelativePath);
  }

  private normalizeOptionalMetaPath(value: unknown): string | null {
    if (typeof value !== 'string') {
      return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }

    try {
      return this.normalizeRelativePath(trimmed);
    } catch {
      return null;
    }
  }

  private sanitizeFolderPathSegment(value: string): string {
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

  private async readJsonIfExists(filePath: string): Promise<any | null> {
    try {
      const raw = await fs.readFile(filePath, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return null;
    }
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
