export class CreateHttpRequestDto {
  name: string;
  method: string;
  url: string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  collectionId?: string;
  folderId?: string;
}
