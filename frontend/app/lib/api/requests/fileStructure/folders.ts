import { API_BASE_URL } from '~/lib/api/config';

// --- Types ---
export interface FolderDto {
  id: string;
  name: string;
  parentFolderId?: string | null; // optional for root-level folders
  parentId?: string | null; // used by imported collections
  collectionId?: string | null; // optional for root-level folders
  createdAt: string;
  updatedAt: string;
}

export interface CreateFolderDto {
  name: string;
  parentId?: string; // optional for root-level folders
}

export interface UpdateFolderDto {
  name?: string;
}

// --- API functions ---

// List folders by collection
export function getFoldersByCollection(collectionId: string): Promise<FolderDto[]> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/folders`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch folders for collection ${collectionId}`);
    return res.json() as Promise<FolderDto[]>;
  });
}

// Create folder in collection
export function createFolderInCollection(collectionId: string, data: CreateFolderDto): Promise<FolderDto> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create folder in collection ${collectionId}`);
    return res.json() as Promise<FolderDto>;
  });
}

// Create folder inside a folder
export function createFolderInFolder(folderId: string, data: CreateFolderDto): Promise<FolderDto> {
  return fetch(`${API_BASE_URL}/folders/${folderId}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create folder in folder ${folderId}`);
    return res.json() as Promise<FolderDto>;
  });
}

// Create root-level folder
export function createRootFolder(data: CreateFolderDto): Promise<FolderDto> {
  return fetch(`${API_BASE_URL}/folders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create root folder`);
    return res.json() as Promise<FolderDto>;
  });
}

// Update folder
export function updateFolder(id: string, data: UpdateFolderDto): Promise<FolderDto> {
  return fetch(`${API_BASE_URL}/folders/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to update folder ${id}`);
    return res.json() as Promise<FolderDto>;
  });
}

// Delete folder
export function deleteFolder(id: string): Promise<void> {
  return fetch(`${API_BASE_URL}/folders/${id}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok) throw new Error(`Failed to delete folder ${id}`);
  });
}

// Get single folder by ID
export function getFolderById(id: string): Promise<FolderDto> {
  return fetch(`${API_BASE_URL}/folders/${id}`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch folder ${id}`);
    return res.json() as Promise<FolderDto>;
  });
}