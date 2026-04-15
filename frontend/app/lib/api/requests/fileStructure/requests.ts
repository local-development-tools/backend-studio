import type { HttpMethod } from '~/components/requests/types';
import { API_BASE_URL } from '~/lib/api/config';

// --- Types ---
interface BaseRequestDto {
  id: string;
  name: string;
  collectionId: string | null;
  folderId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HttpRequestDto extends BaseRequestDto {
  type: 'http';
  url: string;
  method: HttpMethod | string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, string>;
  postScript?: string;
}

export interface GrpcRequestDto extends BaseRequestDto {
  type: 'grpc';
  url: string;
  serverAddress?: string;
  service?: string;
  method: string;
  protoContent?: string;
  message?: unknown;
  metadata?: Record<string, string>;
}

export type RequestDto = HttpRequestDto | GrpcRequestDto;

export interface CreateRequestDto {
  url?: string;
  method?: HttpMethod | string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, string>;
}

export interface UpdateRequestDto {
  name?: string;
  url?: string;
  method?: HttpMethod | string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: Record<string, string>;
  postScript?: string;
}

// --- API functions ---

// List root-level requests
export function getRootRequests(): Promise<RequestDto[]> {
  return fetch(`${API_BASE_URL}/requests`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch root requests`);
    return res.json() as Promise<RequestDto[]>;
  });
}

// Create root-level HTTP request
export function createRootHttpRequest(name: string, data: CreateRequestDto): Promise<HttpRequestDto> {
  return fetch(`${API_BASE_URL}/http/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...data }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create root HTTP request`);
    return res.json() as Promise<HttpRequestDto>;
  });
}

// Create root-level gRPC request
export function createRootGrpcRequest(name: string, data: CreateRequestDto): Promise<GrpcRequestDto> {
  return fetch(`${API_BASE_URL}/grpc/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...data }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create root gRPC request`);
    return res.json() as Promise<GrpcRequestDto>;
  });
}

// List requests in collection
export function getRequestsByCollection(collectionId: string): Promise<RequestDto[]> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/requests`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch requests for collection ${collectionId}`);
    return res.json() as Promise<RequestDto[]>;
  });
}

// List folders inside a folder
export function getFoldersByFolder(folderId: string): Promise<any[]> {
  return fetch(`${API_BASE_URL}/folders/${folderId}/folders`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch folders for folder ${folderId}`);
    return res.json() as Promise<any[]>;
  });
}

// Create HTTP request in collection
export function createHttpRequestInCollection(
  collectionId: string,
  name: string,
  data: CreateRequestDto
): Promise<HttpRequestDto> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/http/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...data }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create HTTP request in collection ${collectionId}`);
    return res.json() as Promise<HttpRequestDto>;
  });
}

// Create gRPC request in collection
export function createGrpcRequestInCollection(
  collectionId: string,
  name: string,
  data: CreateRequestDto
): Promise<GrpcRequestDto> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/grpc/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...data }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create gRPC request in collection ${collectionId}`);
    return res.json() as Promise<GrpcRequestDto>;
  });
}

// List requests in folder
export function getRequestsByFolder(folderId: string): Promise<RequestDto[]> {
  return fetch(`${API_BASE_URL}/folders/${folderId}/requests`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch requests for folder ${folderId}`);
    return res.json() as Promise<RequestDto[]>;
  });
}

// Create HTTP request in folder
export function createHttpRequestInFolder(
  folderId: string,
  name: string,
  data: CreateRequestDto
): Promise<HttpRequestDto> {
  return fetch(`${API_BASE_URL}/folders/${folderId}/http/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...data }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create HTTP request in folder ${folderId}`);
    return res.json() as Promise<HttpRequestDto>;
  });
}

// Create gRPC request in folder
export function createGrpcRequestInFolder(
  folderId: string,
  name: string,
  data: CreateRequestDto
): Promise<GrpcRequestDto> {
  return fetch(`${API_BASE_URL}/folders/${folderId}/grpc/requests`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ...data }),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to create gRPC request in folder ${folderId}`);
    return res.json() as Promise<GrpcRequestDto>;
  });
}

// Get request by ID
export function getRequestById(id: string): Promise<RequestDto> {
  return fetch(`${API_BASE_URL}/requests/${id}`).then((res) => {
    if (!res.ok) throw new Error(`Failed to fetch request ${id}`);
    return res.json() as Promise<RequestDto>;
  });
}

// Update request
export function updateRequest(id: string, data: UpdateRequestDto): Promise<RequestDto> {
  return fetch(`${API_BASE_URL}/requests/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then((res) => {
    if (!res.ok) throw new Error(`Failed to update request ${id}`);
    return res.json() as Promise<RequestDto>;
  });
}

// Delete request
export function deleteRequest(id: string): Promise<void> {
  return fetch(`${API_BASE_URL}/requests/${id}`, { method: 'DELETE' }).then((res) => {
    if (!res.ok) throw new Error(`Failed to delete request ${id}`);
  });
}

// Run a single request
export function runRequest(id: string): Promise<any> {
  return fetch(`${API_BASE_URL}/requests/${id}/run`, { method: 'POST' }).then((res) => {
    if (!res.ok) throw new Error(`Failed to run request ${id}`);
    return res.json();
  });
}

// Run all requests in folder
export function runFolder(folderId: string): Promise<any> {
  return fetch(`${API_BASE_URL}/folders/${folderId}/run`, { method: 'POST' }).then((res) => {
    if (!res.ok) throw new Error(`Failed to run folder ${folderId}`);
    return res.json();
  });
}

// Run all requests in collection
export function runCollection(collectionId: string): Promise<any> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/run`, { method: 'POST' }).then((res) => {
    if (!res.ok) throw new Error(`Failed to run collection ${collectionId}`);
    return res.json();
  });
}