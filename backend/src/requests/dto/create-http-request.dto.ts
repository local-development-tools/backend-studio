import type { BodyMode } from '../entities/request.entity';

export class CreateHttpRequestDto {
  name: string;
  method: string;
  url: string;
  pathParams?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
  bodyMode?: BodyMode;
  collectionId?: string;
  folderId?: string;
}
