export interface Collection {
  id: string;
  name: string;
  folders: string[];
  requests: string[];
  activeEnvironment?: string;
  createdAt: Date;
  updatedAt: Date;
}
