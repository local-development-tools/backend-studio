import { API_BASE_URL } from '~/lib/api/config';

export interface CreateGrpcRequestPayload {
  name: string;
  serverAddress: string;
  service: string;
  method: string;
  protoContent?: string;
  message?: unknown;
  metadata?: Record<string, string>;
  collectionId?: string;
  folderId?: string;
}

export interface ApiRequest {
  id: string;
  type: 'http' | 'grpc';
  name: string;
  method: string;
  url: string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  serverAddress?: string;
  service?: string;
  protoContent?: string;
  message?: unknown;
  metadata?: Record<string, string>;
  collectionId?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

export async function createRootGrpcRequest(payload: CreateGrpcRequestPayload): Promise<ApiRequest> {
  const response = await fetch(`${API_BASE_URL}/grpc/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP error status: ${response.status}`);
  }

  return (await response.json()) as ApiRequest;
}
