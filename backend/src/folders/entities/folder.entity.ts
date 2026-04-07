export interface Folder {
  id: string;
  name: string;
  collectionId?: string;
  parentFolderId?: string;
  requests: string[];
  folders: string[];
  createdAt: Date;
  updatedAt: Date;
}
