import { API_BASE_URL } from '~/lib/api/config';

// --- Types ---
export interface ApiRequest {
  id: string;
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  collectionId?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function getRequestsByCollection(collectionId: string): Promise<ApiRequest[]> {
  const response = await fetch(`${API_BASE_URL}/collections/${collectionId}/requests`);

  if (!response.ok) {
    throw new Error(`Failed to fetch requests for collection ${collectionId}: ${response.status}`);
  }

  return (await response.json()) as ApiRequest[];
}