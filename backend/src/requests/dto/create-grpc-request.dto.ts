export class CreateGrpcRequestDto {
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
