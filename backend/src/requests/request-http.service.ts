import { BadRequestException, Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { CreateHttpRequestDto } from './dto/create-http-request.dto';
import { Request } from './entities/request.entity';
import { RequestBruService } from './request-bru.service';
import { DEFAULT_POST_SCRIPT } from './constants';
import type { RunRequestResult } from './run-request-result.interface';
import { RequestsService } from './requests.service';

@Injectable()
export class RequestHttpService {
  constructor(
    private readonly requestBruService: RequestBruService,
    private readonly requestsService: RequestsService,
  ) {}

  async createHttpRequest(createRequestDto: CreateHttpRequestDto): Promise<Request> {
    if (!createRequestDto) {
      throw new BadRequestException('Request body is required');
    }

    if (!createRequestDto.name) {
      throw new BadRequestException('Field "name" is required');
    }

    if (!createRequestDto.method) {
      throw new BadRequestException('Field "method" is required');
    }

    if (!createRequestDto.url) {
      throw new BadRequestException('Field "url" is required');
    }

    const id = randomUUID();
    const now = new Date();

    const request: Request = {
      id,
      type: 'http',
      name: createRequestDto.name,
      method: createRequestDto.method,
      url: createRequestDto.url,
      headers: createRequestDto.headers,
      body: createRequestDto.body,
      postScript: DEFAULT_POST_SCRIPT,
      collectionId: createRequestDto.collectionId,
      folderId: createRequestDto.folderId,
      createdAt: now,
      updatedAt: now,
    };

    const { filePath, collectionId, folderId } = await this.requestsService.resolveRequestFilePath({
      requestId: id,
      collectionId: request.collectionId,
      folderId: request.folderId,
    });

    request.collectionId = collectionId;
    request.folderId = folderId;

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, this.requestBruService.toBru(request), 'utf-8');

    await this.requestsService.addRequestReference({
      requestId: id,
      collectionId,
      folderId,
    });
    return request;
  }

  async run(input: {
    requestId: string;
    method: string;
    url: string;
    headers?: Record<string, string>;
    body?: unknown;
  }): Promise<RunRequestResult> {
    const started = Date.now();
    try {
      const headers: Record<string, string> = { ...(input.headers ?? {}) };

      const methodUpper = input.method.toUpperCase();
      const methodAllowsBody = methodUpper !== 'GET' && methodUpper !== 'HEAD';

      let body: string | undefined = undefined;
      if (methodAllowsBody && input.body !== undefined) {
        if (typeof input.body === 'string') {
          body = input.body;
        } else {
          body = JSON.stringify(input.body);
          const existingContentTypeKey = Object.keys(headers).find((k) => k.toLowerCase() === 'content-type');
          if (!existingContentTypeKey) {
            headers['Content-Type'] = 'application/json';
          }
        }
      }

      const response = await fetch(input.url, {
        method: input.method,
        headers,
        body,
      });

      const durationMs = Date.now() - started;
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const bodyText = await response.text();
      let bodyJson: unknown = undefined;
      try {
        bodyJson = bodyText ? (JSON.parse(bodyText) as unknown) : undefined;
      } catch {
        bodyJson = undefined;
      }

      return {
        requestId: input.requestId,
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        headers: responseHeaders,
        durationMs,
        bodyText,
        bodyJson,
      };
    } catch (error) {
      const durationMs = Date.now() - started;
      return {
        requestId: input.requestId,
        ok: false,
        durationMs,
        error: (error as Error).message,
      };
    }
  }
}
