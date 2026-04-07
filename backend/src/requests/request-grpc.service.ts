import { BadRequestException, Injectable } from '@nestjs/common';
import type * as GrpcType from '@grpc/grpc-js';
import type * as ProtoLoaderType from '@grpc/proto-loader';
import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { GrpcReflectionService } from './grpc-reflection.service';
import { CreateGrpcRequestDto } from './dto/create-grpc-request.dto';
import { Request } from './entities/request.entity';
import { RequestBruService } from './request-bru.service';
import { DEFAULT_POST_SCRIPT } from './constants';
import type { RunRequestResult } from './run-request-result.interface';
import { RequestsService } from './requests.service';

@Injectable()
export class RequestGrpcService {
  constructor(
    private readonly grpcReflectionService: GrpcReflectionService,
    private readonly requestBruService: RequestBruService,
    private readonly requestsService: RequestsService,
  ) {}

  async createGrpcRequest(createGrpcRequestDto: CreateGrpcRequestDto): Promise<Request> {
    if (!createGrpcRequestDto) {
      throw new BadRequestException('Request body is required');
    }

    if (!createGrpcRequestDto.name) {
      throw new BadRequestException('Field "name" is required');
    }

    if (!createGrpcRequestDto.serverAddress) {
      throw new BadRequestException('Field "serverAddress" is required');
    }

    if (!createGrpcRequestDto.service) {
      throw new BadRequestException('Field "service" is required');
    }

    if (!createGrpcRequestDto.method) {
      throw new BadRequestException('Field "method" is required');
    }

    const id = randomUUID();
    const now = new Date();

    const request: Request = {
      id,
      type: 'grpc',
      name: createGrpcRequestDto.name,
      method: createGrpcRequestDto.method,
      url: createGrpcRequestDto.serverAddress,
      serverAddress: createGrpcRequestDto.serverAddress,
      service: createGrpcRequestDto.service,
      protoContent: createGrpcRequestDto.protoContent,
      message: createGrpcRequestDto.message,
      metadata: createGrpcRequestDto.metadata,
      postScript: DEFAULT_POST_SCRIPT,
      collectionId: createGrpcRequestDto.collectionId,
      folderId: createGrpcRequestDto.folderId,
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
    serverAddress: string;
    service: string;
    method: string;
    protoContent?: string;
    message?: unknown;
    metadata?: Record<string, string>;
  }): Promise<RunRequestResult> {
    const started = Date.now();
    let tempDir: string | undefined;

    try {
      if (!input.serverAddress?.trim() || !input.service?.trim() || !input.method?.trim()) {
        return {
          requestId: input.requestId,
          ok: false,
          durationMs: Date.now() - started,
          error: 'gRPC run requires serverAddress, service, and method.',
        };
      }

      let grpc: typeof GrpcType;
      let protoLoader: typeof ProtoLoaderType;
      try {
        grpc = await import('@grpc/grpc-js');
        protoLoader = await import('@grpc/proto-loader');
      } catch {
        return {
          requestId: input.requestId,
          ok: false,
          durationMs: Date.now() - started,
          error: 'gRPC dependencies are missing. Install @grpc/grpc-js and @grpc/proto-loader.',
        };
      }

      let packageDefinition: ProtoLoaderType.PackageDefinition;

      if (input.protoContent?.trim()) {
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'grpc-request-run-'));
        const protoPath = path.join(tempDir, 'request.proto');
        await fs.writeFile(protoPath, input.protoContent, 'utf-8');
        try {
          packageDefinition = protoLoader.loadSync(protoPath, {
            keepCase: true,
            longs: String,
            enums: String,
            defaults: true,
            oneofs: true,
          });
        } catch (error) {
          return {
            requestId: input.requestId,
            ok: false,
            durationMs: Date.now() - started,
            error: `Invalid protoContent: ${(error as Error).message}`,
          };
        }
      } else {
        try {
          packageDefinition = await this.grpcReflectionService.loadPackageDefinition(
            input.serverAddress,
            input.service,
          );
        } catch (error) {
          return {
            requestId: input.requestId,
            ok: false,
            durationMs: Date.now() - started,
            error: `No protoContent provided and reflection failed: ${(error as Error).message}`,
          };
        }
      }

      const grpcObject = grpc.loadPackageDefinition(packageDefinition);
      const serviceConstructor = this.resolveGrpcServiceConstructor(grpcObject, input.service);

      if (!serviceConstructor) {
        return {
          requestId: input.requestId,
          ok: false,
          durationMs: Date.now() - started,
          error: `gRPC service not found in proto: ${input.service}`,
        };
      }

      const { address: grpcAddress, useTls } = this.grpcReflectionService.parseGrpcAddress(input.serverAddress);
      const credentials = useTls ? grpc.credentials.createSsl() : grpc.credentials.createInsecure();
      const client = new serviceConstructor(grpcAddress, credentials);
      const metadata = new grpc.Metadata();
      Object.entries(input.metadata ?? {}).forEach(([key, value]) => {
        if (key.trim()) {
          metadata.set(key, String(value));
        }
      });

      const requestMessage = (input.message ?? {}) as Record<string, unknown>;
      const response = await new Promise<unknown>((resolve, reject) => {
        const callback = (error: Error | null, result: unknown) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(result);
        };

        const methodFn = (client as Record<string, unknown>)[input.method];
        if (typeof methodFn !== 'function') {
          reject(new Error(`gRPC method not found on service '${input.service}': ${input.method}`));
          return;
        }

        const fn = methodFn as (...args: unknown[]) => void;
        if (Object.keys(input.metadata ?? {}).length > 0) {
          fn.call(client, requestMessage, metadata, callback);
          return;
        }

        fn.call(client, requestMessage, callback);
      });

      client.close();

      const durationMs = Date.now() - started;
      const bodyText = JSON.stringify(response ?? {}, null, 2);

      return {
        requestId: input.requestId,
        ok: true,
        status: 0,
        statusText: 'OK',
        durationMs,
        bodyText,
        bodyJson: response,
      };
    } catch (error) {
      const grpcError = error as {
        code?: number;
        details?: string;
        message?: string;
        metadata?: { getMap?: () => Record<string, unknown> };
      };

      const durationMs = Date.now() - started;
      const metadataMap = grpcError.metadata?.getMap ? grpcError.metadata.getMap() : undefined;

      return {
        requestId: input.requestId,
        ok: false,
        status: grpcError.code,
        statusText: this.grpcStatusName(grpcError.code),
        headers: metadataMap
          ? Object.fromEntries(Object.entries(metadataMap).map(([key, value]) => [key, String(value)]))
          : undefined,
        durationMs,
        error: grpcError.details || grpcError.message || 'gRPC request failed.',
      };
    } finally {
      if (tempDir) {
        await fs.rm(tempDir, { recursive: true, force: true });
      }
    }
  }

  private resolveGrpcServiceConstructor(
    grpcObject: GrpcType.GrpcObject,
    servicePath: string,
  ): GrpcType.ServiceClientConstructor | null {
    const parts = servicePath.split('.').filter((part) => part.trim());
    let current: GrpcType.GrpcObject[string] = grpcObject;

    for (const part of parts) {
      if (!current || typeof current !== 'object') return null;
      current = (current as GrpcType.GrpcObject)[part];
      if (!current) return null;
    }

    if (typeof current !== 'function') return null;
    return current;
  }

  private grpcStatusName(code?: number): string | undefined {
    if (code === undefined) {
      return undefined;
    }

    const names: Record<number, string> = {
      0: 'OK',
      1: 'CANCELLED',
      2: 'UNKNOWN',
      3: 'INVALID_ARGUMENT',
      4: 'DEADLINE_EXCEEDED',
      5: 'NOT_FOUND',
      6: 'ALREADY_EXISTS',
      7: 'PERMISSION_DENIED',
      8: 'RESOURCE_EXHAUSTED',
      9: 'FAILED_PRECONDITION',
      10: 'ABORTED',
      11: 'OUT_OF_RANGE',
      12: 'UNIMPLEMENTED',
      13: 'INTERNAL',
      14: 'UNAVAILABLE',
      15: 'DATA_LOSS',
      16: 'UNAUTHENTICATED',
    };

    return names[code] ?? String(code);
  }
}
