export interface ImportedFolderSummary {
  id?: string;
  name: string;
  relativePath: string;
  parentRelativePath: string | null;
  parentId?: string | null;
}

export interface ImportedRequestSummary {
  id: string;
  name: string;
  type: 'http' | 'grpc';
  method: string;
  url: string;
  relativePath: string;
  folderRelativePath: string | null;
  folderId?: string | null;
}

export interface ImportedCollectionTree {
  collection: {
    id: string;
    name: string;
    sourcePath: string | null;
    createdAt: Date;
    updatedAt: Date;
  };
  folders: ImportedFolderSummary[];
  requests: ImportedRequestSummary[];
}
