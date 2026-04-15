export class UpdateRequestDto {
  type?: 'http' | 'grpc';
  name?: string;
  method?: string;
  url?: string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  serverAddress?: string;
  service?: string;
  protoContent?: string;
  message?: unknown;
  metadata?: Record<string, string>;
  postScript?: string;
  collectionId?: string;
  folderId?: string;
}
