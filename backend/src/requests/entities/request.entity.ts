export interface Request {
  id: string;
  type: 'http' | 'grpc';
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  serverAddress?: string;
  service?: string;
  protoContent?: string;
  message?: unknown;
  metadata?: Record<string, string>;
  postScript: string;
  collectionId?: string; // Parent collection (if directly in collection)
  folderId?: string; // Parent folder (if in a folder)
  createdAt: Date;
  updatedAt: Date;
}
