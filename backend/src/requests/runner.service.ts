import { Injectable, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import { RequestBruService } from './request-bru.service';
import { RequestGrpcService } from './request-grpc.service';
import { RequestHttpService } from './request-http.service';
import { RunRequestResult } from './run-request-result.interface';
import { RequestsService } from './requests.service';

const resolveRequestUrl = (url: string, pathParams?: Record<string, string>): string => {
  if (!pathParams || Object.keys(pathParams).length === 0) {
    return url;
  }

  const replacePathParams = (input: string) =>
    input.replace(/:([A-Za-z0-9_]+)/g, (match, key: string) => {
      if (!(key in pathParams)) {
        return match;
      }
      return encodeURIComponent(pathParams[key] ?? '');
    });

  try {
    const parsed = new URL(url);
    parsed.pathname = replacePathParams(parsed.pathname);
    return parsed.toString();
  } catch {
    return replacePathParams(url);
  }
};

@Injectable()
export class RunnerService {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly requestBruService: RequestBruService,
    private readonly requestHttpService: RequestHttpService,
    private readonly requestGrpcService: RequestGrpcService,
  ) {}

  async runRequest(id: string): Promise<RunRequestResult> {
    const filePath = await this.requestsService.findRequestFilePathById(id);
    if (!filePath) {
      throw new NotFoundException(`Request with id ${id} not found`);
    }

    const contents = await fs.readFile(filePath, 'utf-8');
    const parsed = this.requestBruService.fromBru(contents);

    if (parsed.type === 'grpc') {
      return this.requestGrpcService.run({
        requestId: id,
        serverAddress: parsed.serverAddress ?? parsed.url,
        service: parsed.service ?? '',
        method: parsed.method,
        protoContent: parsed.protoContent,
        message: parsed.message,
        metadata: parsed.metadata,
      });
    }

    return this.requestHttpService.run({
      requestId: id,
      method: parsed.method,
      url: resolveRequestUrl(parsed.url, parsed.pathParams),
      headers: parsed.headers,
      body: parsed.body,
    });
  }

  async runFolder(folderId: string): Promise<RunRequestResult[]> {
    const requests = await this.requestsService.listRequestsByFolder(folderId);
    return this.runMany(requests.map((request) => request.id));
  }

  async runCollection(collectionId: string): Promise<RunRequestResult[]> {
    await this.requestsService.ensureCollectionExists(collectionId);
    const results: RunRequestResult[] = [];

    const collectionRequests = await this.requestsService.listRequestsByCollection(collectionId);
    for (const request of collectionRequests) {
      const result = await this.runRequest(request.id);
      results.push(result);
      if (!result.ok) {
        return results;
      }
    }

    const folderIds = await this.requestsService.listFolderIdsInCollection(collectionId);
    for (const folderId of folderIds) {
      const folderResults = await this.runFolder(folderId);
      results.push(...folderResults);

      const last = folderResults[folderResults.length - 1];
      if (last && !last.ok) {
        return results;
      }
    }

    return results;
  }

  private async runMany(requestIds: string[]): Promise<RunRequestResult[]> {
    const results: RunRequestResult[] = [];
    for (const id of requestIds) {
      const result = await this.runRequest(id);
      results.push(result);
      if (!result.ok) {
        break;
      }
    }

    return results;
  }
}
