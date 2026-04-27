import { Injectable } from '@nestjs/common';
import { Request } from './entities/request.entity';
import { DEFAULT_POST_SCRIPT } from './constants';

export type ParsedBruRequest = {
  type: 'http' | 'grpc';
  name: string;
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  serverAddress?: string;
  service?: string;
  protoContent?: string;
  message?: unknown;
  metadata?: Record<string, string>;
  postScript: string;
};

@Injectable()
export class RequestBruService {
  toBru(request: Request): string {
    if (request.type === 'grpc') {
      const metaBlock = `meta {\n  name: ${request.name}\n  type: grpc\n  seq: 1\n}`;
      const grpcBlock = `grpc {\n  serverAddress: ${request.serverAddress ?? request.url}\n  service: ${request.service ?? ''}\n  method: ${request.method}\n  auth: inherit\n}`;

      const metadataBlock =
        request.metadata && Object.keys(request.metadata).length > 0
          ? this.headersToBruBlock('metadata', request.metadata)
          : '';
      const messageBlock =
        request.message !== undefined ? `\n\nmessage:json {\n${this.formatBruJsonBody(request.message)}\n}` : '';

      const protoBlock = request.protoContent ? `\n\nproto:text {\n${request.protoContent}\n}` : '';
      const settingsBlock = `\n\nsettings {\n  encodeUrl: true\n  timeout: 0\n}`;

      return `${metaBlock}\n\n${grpcBlock}${metadataBlock}${messageBlock}${protoBlock}${settingsBlock}\n`;
    }

    const method = request.method.toLowerCase();
    const metaBlock = `meta {\n  name: ${request.name}\n  type: http\n  seq: 1\n}`;
    const methodBlock = `${method} {\n  url: ${request.url}\n  body: json\n  auth: inherit\n}`;

    const headersBlock =
      request.headers && Object.keys(request.headers).length > 0
        ? this.headersToBruBlock('headers', request.headers)
        : '';

    const bodyBlock = request.body !== undefined ? `\n\nbody:json {\n${this.formatBruJsonBody(request.body)}\n}` : '';

    const settingsBlock = `\n\nsettings {\n  encodeUrl: true\n  timeout: 0\n}`;
    const postScriptBlock = `\n\nscript:post-response {\n${request.postScript
      .split(/\r?\n/)
      .map((l) => `  ${l}`)
      .join('\n')}\n}`;

    return `${metaBlock}\n\n${methodBlock}${headersBlock}${bodyBlock}${settingsBlock}${postScriptBlock}\n`;
  }

  fromBru(contents: string): ParsedBruRequest {
    const meta = this.parseKeyValueBlock(this.extractBruBlock(contents, 'meta'));
    const name = (meta.name ?? '').trim();
    const type = (meta.type ?? 'http').toLowerCase() === 'grpc' ? 'grpc' : 'http';

    if (type === 'grpc') {
      const grpc = this.parseKeyValueBlock(this.extractBruBlock(contents, 'grpc'));
      const messageRaw = this.extractBruBlock(contents, 'message:json')?.trim();

      let message: unknown = undefined;
      if (messageRaw && messageRaw.length > 0) {
        try {
          message = JSON.parse(messageRaw) as unknown;
        } catch {
          message = messageRaw;
        }
      }

      return {
        type,
        name,
        method: (grpc.method ?? '').trim(),
        url: (grpc.serverAddress ?? '').trim(),
        serverAddress: (grpc.serverAddress ?? '').trim(),
        service: (grpc.service ?? '').trim(),
        metadata: this.parseHeadersBlock(contents, 'metadata'),
        message,
        protoContent: this.extractBruBlock(contents, 'proto:text')?.trim(),
        postScript: DEFAULT_POST_SCRIPT,
      };
    }

    const methodMatch = contents.match(/^\s*(get|post|put|patch|delete|head|options)\s*\{/im);
    const method = (methodMatch?.[1] ?? 'get').toUpperCase();

    const urlMatch = contents.match(/\burl:\s*([^\n\r]+)/i);
    const url = (urlMatch?.[1] ?? '').trim();

    const headers = this.parseHeadersBlock(contents, 'headers');

    const bodyRaw = this.extractBruBlock(contents, 'body:json')?.trim();
    let body: unknown = undefined;
    if (bodyRaw && bodyRaw.length > 0) {
      try {
        body = JSON.parse(bodyRaw) as unknown;
      } catch {
        body = bodyRaw;
      }
    }

    const postScriptRaw = this.extractBruBlock(contents, 'script:post-response');
    const postScript = postScriptRaw
      ? postScriptRaw
          .split(/\r?\n/)
          .map((l) => l.replace(/^ {2}/, ''))
          .join('\n')
          .trim() || DEFAULT_POST_SCRIPT
      : DEFAULT_POST_SCRIPT;

    return { type, name, method, url, headers, body, postScript };
  }

  private headersToBruBlock(blockName: string, headers: Record<string, string>): string {
    const lines = Object.entries(headers).map(([k, v]) => `  ${k}: ${v}`);
    return `\n\n${blockName} {\n${lines.join('\n')}\n}`;
  }

  private formatBruJsonBody(body: unknown): string {
    if (typeof body === 'string') {
      return `  ${body}`;
    }

    try {
      const pretty = JSON.stringify(body, null, 2);
      return pretty
        .split(/\r?\n/)
        .map((line) => `  ${line}`)
        .join('\n');
    } catch {
      return `  ${String(body)}`;
    }
  }

  private parseHeadersBlock(contents: string, blockName: string): Record<string, string> | undefined {
    const raw = this.extractBruBlock(contents, blockName);
    if (!raw) {
      return undefined;
    }

    const headers: Record<string, string> = {};
    const lines = raw
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx === -1) {
        continue;
      }
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      if (key) {
        headers[key] = value;
      }
    }

    return Object.keys(headers).length > 0 ? headers : undefined;
  }

  private parseKeyValueBlock(raw: string | null): Record<string, string> {
    if (!raw) {
      return {};
    }

    const result: Record<string, string> = {};
    const lines = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    for (const line of lines) {
      const index = line.indexOf(':');
      if (index === -1) {
        continue;
      }

      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (key) {
        result[key] = value;
      }
    }

    return result;
  }

  private extractBruBlock(contents: string, blockName: string): string | null {
    const idx = contents.toLowerCase().indexOf(blockName.toLowerCase());
    if (idx === -1) {
      return null;
    }

    const openIdx = contents.indexOf('{', idx);
    if (openIdx === -1) {
      return null;
    }

    let depth = 0;
    for (let i = openIdx; i < contents.length; i++) {
      const ch = contents[i];
      if (ch === '{') {
        depth++;
        continue;
      }
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          return contents.slice(openIdx + 1, i);
        }
      }
    }

    return null;
  }
}
