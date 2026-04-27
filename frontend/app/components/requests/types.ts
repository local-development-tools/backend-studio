export type RequestType = 'http' | 'grpc';
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

export interface HttpRequest {
  id: string;
  name: string;
  type: 'http';
  method: HttpMethod;
  url: string;
  headers: { key: string; value: string }[];
  queryParams: { key: string; value: string }[];
  body: string;
  postScript?: string;
  collectionId?: string;
}

export interface GrpcRequest {
  id: string;
  name: string;
  type: 'grpc';
  serverAddress: string;
  service: string;
  method: string;
  protoContent: string;
  message: string;
  metadata: { key: string; value: string }[];
  collectionId?: string;
  postScript?: string;
}

export type Request = HttpRequest | GrpcRequest;

export interface MockResponse {
  status: number;
  statusText: string;
  time: number;
  size: string;
  headers: { key: string; value: string }[];
  body: string;
}
