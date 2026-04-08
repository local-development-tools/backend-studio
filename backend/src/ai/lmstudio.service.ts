import { BadRequestException, Injectable } from '@nestjs/common';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { LMStudioClient } from '@lmstudio/sdk';

type AvailableModel = {
  id: string;
  label: string;
};

type ProviderModelList = {
  available: boolean;
  models: AvailableModel[];
  error: string | null;
};

type LmStudioCliExecutionResult = {
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type LmStudioCliCommandResponse = {
  ok: true;
  command: string;
  args: string[];
  exitCode: number;
  stdout: string;
  stderr: string;
};

export type LmStudioStatusResponse = {
  running: boolean | null;
  result: LmStudioCliCommandResponse;
};

export type LmStudioLoadedModelsResponse = {
  models: string[];
  source: 'ps' | 'status' | 'sdk';
  result: LmStudioCliCommandResponse;
};

@Injectable()
export class LmStudioService {
  private readonly fallbackDefaultModel = 'llama-3.2-3b-instruct';
  private readonly cliDefaultCommand = process.platform === 'win32' ? 'lms.cmd' : 'lms';
  private readonly cliDefaultTimeoutMs = 60_000;
  private readonly dockerLmStudioHint =
    'If backend runs in Docker, set LMSTUDIO_BASE_URL=ws://host.docker.internal:1234 and ensure LM Studio local server is enabled.';

  async generateText(prompt: string, model?: string): Promise<string> {
    if (!prompt?.trim()) {
      throw new BadRequestException('Prompt is required');
    }

    const client = this.createClient();
    const selectedModel = this.resolveModel(model);
    let llm: { complete: (input: string) => Promise<unknown> };

    try {
      llm = (await client.llm.model(selectedModel)) as { complete: (input: string) => Promise<unknown> };
    } catch (error) {
      if (model?.trim()) {
        throw new BadRequestException(
          `Failed to select LM Studio model "${selectedModel}". ${this.getProviderErrorMessage(error)} ${this.dockerLmStudioHint}`,
        );
      }

      try {
        llm = (await client.llm.model()) as { complete: (input: string) => Promise<unknown> };
      } catch (fallbackError) {
        throw new BadRequestException(
          `LM Studio is not reachable or no model is loaded. ${this.getProviderErrorMessage(fallbackError)} ${this.dockerLmStudioHint}`,
        );
      }
    }

    const response = await llm.complete(prompt);

    return this.extractCompletionContent(response);
  }

  async listModels(): Promise<ProviderModelList> {
    try {
      const client = this.createClient();
      const models = await client.system.listDownloadedModels('llm');

      return {
        available: true,
        models: models
          .map((model) => ({
            id: model.modelKey,
            label: model.displayName || model.modelKey,
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        error: null,
      };
    } catch (error) {
      return {
        available: false,
        models: [],
        error: this.getProviderErrorMessage(error),
      };
    }
  }

  async getServerStatus(): Promise<LmStudioStatusResponse> {
    try {
      const result = await this.runLmsCommand(['status']);

      return {
        running: this.parseRunningState(result.stdout, result.stderr),
        result: this.toCliResponse(result),
      };
    } catch (error) {
      if (!this.isCliNotFoundError(error)) {
        throw error;
      }

      return this.getServerStatusFromSdkFallback();
    }
  }

  async listLoadedModels(): Promise<LmStudioLoadedModelsResponse> {
    try {
      const result = await this.runLmsCommand(['ps']);
      return {
        models: this.parseLoadedModels(result.stdout),
        source: 'ps',
        result: this.toCliResponse(result),
      };
    } catch (error) {
      if (this.isCliNotFoundError(error)) {
        const sdkModels = await this.listLoadedModelsFromSdk();
        return {
          models: sdkModels,
          source: 'sdk',
          result: this.makeSdkFallbackResult('llm.listLoaded', sdkModels.join('\n')),
        };
      }

      const result = await this.runLmsCommand(['status']);
      return {
        models: this.parseLoadedModels(result.stdout),
        source: 'status',
        result: this.toCliResponse(result),
      };
    }
  }

  private createClient(): LMStudioClient {
    const baseUrl = process.env.LMSTUDIO_BASE_URL?.trim();

    if (baseUrl) {
      return new LMStudioClient({ baseUrl });
    }

    return new LMStudioClient();
  }

  private resolveModel(model?: string): string {
    return model?.trim() || process.env.LMSTUDIO_MODEL?.trim() || this.fallbackDefaultModel;
  }

  private toCliResponse(result: LmStudioCliExecutionResult): LmStudioCliCommandResponse {
    return {
      ok: true,
      command: result.command,
      args: result.args,
      exitCode: result.exitCode,
      stdout: result.stdout,
      stderr: result.stderr,
    };
  }

  private parseRunningState(stdout: string, stderr: string): boolean | null {
    const text = `${stdout}\n${stderr}`.toLowerCase();

    if (!text.trim()) {
      return null;
    }

    if (/(not running|stopped|offline)/.test(text)) {
      return false;
    }

    if (/(running|started|online)/.test(text)) {
      return true;
    }

    return null;
  }

  private parseLoadedModels(output: string): string[] {
    const trimmed = output.trim();
    if (!trimmed) {
      return [];
    }

    const fromJson = this.tryParseModelsFromJson(trimmed);
    if (fromJson.length > 0) {
      return fromJson;
    }

    const candidates = trimmed
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .filter((line) => !/^(loaded\s+models?|models?|name|id|status)\b/i.test(line))
      .filter((line) => !/^[-=]+$/.test(line))
      .filter((line) => !/^no\s+loaded\s+models?/i.test(line))
      .map((line) => {
        const tokens = line.split(/\s+/);
        if (tokens.length === 0) {
          return '';
        }

        if (/^\d+$/.test(tokens[0]) && tokens.length > 1) {
          return tokens[1];
        }

        return tokens[0];
      })
      .filter((value) => value.length > 0);

    return Array.from(new Set(candidates));
  }

  private async getServerStatusFromSdkFallback(): Promise<LmStudioStatusResponse> {
    try {
      const models = await this.listLoadedModelsFromSdk();
      return {
        running: true,
        result: this.makeSdkFallbackResult('llm.listLoaded', models.join('\n')),
      };
    } catch (error) {
      return {
        running: false,
        result: this.makeSdkFallbackResult('llm.listLoaded', '', this.getProviderErrorMessage(error)),
      };
    }
  }

  private async listLoadedModelsFromSdk(): Promise<string[]> {
    const client = this.createClient();
    const loaded = await client.llm.listLoaded();

    const models = loaded
      .map((model) => model.modelKey?.trim() || model.identifier?.trim() || '')
      .filter((value) => value.length > 0);

    return Array.from(new Set(models));
  }

  private makeSdkFallbackResult(action: string, stdout = '', stderr = ''): LmStudioCliCommandResponse {
    return {
      ok: true,
      command: 'sdk',
      args: [action],
      exitCode: 0,
      stdout,
      stderr,
    };
  }

  private tryParseModelsFromJson(rawOutput: string): string[] {
    if (!rawOutput.startsWith('{') && !rawOutput.startsWith('[')) {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(rawOutput);

      if (Array.isArray(parsed)) {
        return this.extractModelsFromArray(parsed);
      }

      if (parsed && typeof parsed === 'object') {
        const modelsCandidate = (parsed as { models?: unknown }).models;
        if (Array.isArray(modelsCandidate)) {
          return this.extractModelsFromArray(modelsCandidate);
        }
      }

      return [];
    } catch {
      return [];
    }
  }

  private extractModelsFromArray(values: unknown[]): string[] {
    const models = values
      .map((value) => {
        if (typeof value === 'string') {
          return value;
        }

        if (value && typeof value === 'object') {
          const model = value as {
            model?: string;
            modelKey?: string;
            id?: string;
            name?: string;
          };
          return model.model || model.modelKey || model.id || model.name || '';
        }

        return '';
      })
      .map((value) => value.trim())
      .filter((value) => value.length > 0);

    return Array.from(new Set(models));
  }

  private runLmsCommand(args: string[]): Promise<LmStudioCliExecutionResult> {
    const command = this.resolveLmsCliCommand();
    const timeoutMs = this.resolveLmsCliTimeoutMs();

    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: process.env,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (chunk: Buffer | string) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        stderr += chunk.toString();
      });

      const timeout = setTimeout(() => {
        child.kill();
        reject(
          new BadRequestException(`LM Studio command timed out after ${timeoutMs}ms: ${command} ${args.join(' ')}`),
        );
      }, timeoutMs);

      child.on('error', (error) => {
        clearTimeout(timeout);
        reject(new BadRequestException(this.getCliSpawnErrorMessage(error, command)));
      });

      child.on('close', (code) => {
        clearTimeout(timeout);

        const exitCode = typeof code === 'number' ? code : -1;
        const result: LmStudioCliExecutionResult = {
          command,
          args,
          exitCode,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
        };

        if (exitCode !== 0) {
          const errorOutput = result.stderr || result.stdout || 'No output';
          reject(
            new BadRequestException(
              `LM Studio command failed with exit code ${exitCode}: ${command} ${args.join(' ')}. ${errorOutput}`,
            ),
          );
          return;
        }

        resolve(result);
      });
    });
  }

  private resolveLmsCliCommand(): string {
    return process.env.LMSTUDIO_CLI_COMMAND?.trim() || this.cliDefaultCommand;
  }

  private resolveLmsCliTimeoutMs(): number {
    const fromEnv = Number(process.env.LMSTUDIO_CLI_TIMEOUT_MS);

    if (Number.isFinite(fromEnv) && fromEnv > 0) {
      return Math.floor(fromEnv);
    }

    return this.cliDefaultTimeoutMs;
  }

  private getCliSpawnErrorMessage(error: unknown, command: string): string {
    if (error && typeof error === 'object') {
      const maybeErrno = error as NodeJS.ErrnoException;
      if (maybeErrno.code === 'ENOENT') {
        const dockerRuntimeHint = this.isRunningInDocker()
          ? 'Backend appears to run in Docker. LM Studio desktop CLI on host is not available inside the container. Run backend locally for /ai/lmstudio/server/* and /ai/lmstudio/models/* control endpoints, or install/configure LM Studio CLI inside the container runtime.'
          : '';

        return [
          `LM Studio CLI command not found: "${command}".`,
          `Install LM Studio CLI and ensure it is available in PATH, or set LMSTUDIO_CLI_COMMAND.`,
          dockerRuntimeHint,
          this.dockerLmStudioHint,
        ].join(' ');
      }
    }

    if (error instanceof Error && error.message) {
      return `Failed to execute LM Studio CLI command "${command}": ${error.message}`;
    }

    return `Failed to execute LM Studio CLI command "${command}".`;
  }

  private isCliNotFoundError(error: unknown): boolean {
    if (error instanceof BadRequestException) {
      const response = error.getResponse();
      const rawMessage: unknown =
        typeof response === 'string'
          ? response
          : typeof response === 'object' && response !== null
            ? (response as { message?: unknown }).message
            : '';

      const message = typeof rawMessage === 'string' ? rawMessage : this.serializeUnknown(rawMessage);

      return /LM Studio CLI command not found/i.test(message);
    }

    return false;
  }

  private isRunningInDocker(): boolean {
    return process.platform === 'linux' && (process.env.DOCKER_CONTAINER === 'true' || this.fileExists('/.dockerenv'));
  }

  private fileExists(path: string): boolean {
    try {
      return existsSync(path);
    } catch {
      return false;
    }
  }

  private getProviderErrorMessage(error: unknown): string {
    if (error instanceof Error && error.message) {
      return `LM Studio request failed: ${error.message}`;
    }

    return 'LM Studio request failed. Ensure LM Studio is running with local server enabled.';
  }

  private extractCompletionContent(response: unknown): string {
    if (!response || typeof response !== 'object') {
      return '';
    }

    const content = (response as { content?: unknown }).content;

    if (typeof content === 'string') {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((item) => this.serializeUnknown(item))
        .join('\n')
        .trim();
    }

    return this.serializeUnknown(content);
  }

  private serializeUnknown(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }

    if (typeof value === 'string') {
      return value;
    }

    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return `${value}`;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return '[unserializable-value]';
    }
  }
}
