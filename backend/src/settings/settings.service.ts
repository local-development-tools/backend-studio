import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabasesService } from 'src/databases/databases.service';
import { DatabaseSettingsDto } from './dto/database-settings.dto';
import { AiSettingsDto } from './dto/ai-settings.dto';
import { PostgresConnectionDto } from './dto/postgres-connection.dto';
import { DatabaseConnectionUpsertDto } from './dto/database-connection.dto';

type EnvMap = Record<string, string>;

const DB_KEYS = ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'] as const;
const DB_CONNECTIONS_KEY = 'DB_CONNECTIONS_B64';
const DB_ACTIVE_CONNECTION_ID_KEY = 'DB_ACTIVE_CONNECTION_ID';
const AI_KEYS = [
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'AI_PROVIDER',
  'AI_MODEL',
  'LMSTUDIO_BASE_URL',
  'LMSTUDIO_MODEL',
] as const;

@Injectable()
export class SettingsService {
  private readonly envFilePath = resolve(__dirname, '../../.env');
  private readonly rootEnvFilePath = '/root.env';

  constructor(private readonly databasesService: DatabasesService) {}

  getDatabaseConnections() {
    const env = this.readEnvFile();
    const activeConnectionId = env[DB_ACTIVE_CONNECTION_ID_KEY] ?? null;
    const connections = this.readDatabaseConnections(env).map((connection) => ({
      id: connection.id,
      name: connection.name,
      host: connection.host,
      port: connection.port,
      username: connection.username,
      database: connection.database,
      passwordSet: connection.password !== undefined,
    }));

    return {
      activeConnectionId,
      connections,
    };
  }

  async upsertDatabaseConnection(connectionDto: DatabaseConnectionUpsertDto) {
    const env = this.readEnvFile();
    const connections = this.readDatabaseConnections(env);

    const normalized = this.normalizeDatabaseConnection(connectionDto, connections);
    const existingIndex = connections.findIndex((connection) => connection.id === normalized.id);
    if (existingIndex === -1) {
      connections.push(normalized);
    } else {
      connections[existingIndex] = {
        ...connections[existingIndex],
        ...normalized,
        password:
          normalized.password !== undefined
            ? normalized.password
            : connections[existingIndex].password,
      };
    }

    if (!env[DB_ACTIVE_CONNECTION_ID_KEY]) {
      env[DB_ACTIVE_CONNECTION_ID_KEY] = normalized.id;
    }

    this.writeDatabaseConnections(env, connections);
    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    return this.getDatabaseConnections();
  }

  async setActiveDatabaseConnection(connectionId: string) {
    const env = this.readEnvFile();
    const connections = this.readDatabaseConnections(env);
    const nextActive = connections.find((connection) => connection.id === connectionId);

    if (!nextActive) {
      throw new NotFoundException(`Database connection not found: ${connectionId}`);
    }

    env[DB_ACTIVE_CONNECTION_ID_KEY] = nextActive.id;
    this.applyConnectionToEnv(env, nextActive);
    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    const dbConnection = this.getDbConnectionFromEnv(env);
    if (dbConnection) {
      await this.databasesService.connect(dbConnection);
    }

    return {
      ...this.getDatabaseConnections(),
      settings: this.toPublicDatabaseSettings(env),
    };
  }

  deleteDatabaseConnection(connectionId: string) {
    const env = this.readEnvFile();
    const connections = this.readDatabaseConnections(env);
    const nextConnections = connections.filter((connection) => connection.id !== connectionId);

    this.writeDatabaseConnections(env, nextConnections);

    if (env[DB_ACTIVE_CONNECTION_ID_KEY] === connectionId) {
      if (nextConnections.length === 0) {
        delete env[DB_ACTIVE_CONNECTION_ID_KEY];
      } else {
        env[DB_ACTIVE_CONNECTION_ID_KEY] = nextConnections[0].id;
      }
    }

    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    return this.getDatabaseConnections();
  }

  getDatabaseSettings() {
    const env = this.readEnvFile();
    return this.toPublicDatabaseSettings(env);
  }

  async upsertDatabaseSettings(settingsDto: DatabaseSettingsDto) {
    const env = this.readEnvFile();
    this.applyDatabaseSettings(env, settingsDto);
    this.syncActiveConnectionFromEnv(env);
    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    const dbConnection = this.getDbConnectionFromEnv(env);
    if (dbConnection) {
      await this.databasesService.connect(dbConnection);
    }

    return this.toPublicDatabaseSettings(env);
  }

  async updateDatabaseSettings(settingsDto: DatabaseSettingsDto) {
    return this.upsertDatabaseSettings(settingsDto);
  }

  async clearDatabaseSettings() {
    const env = this.readEnvFile();

    for (const key of DB_KEYS) {
      delete env[key];
    }

    await this.databasesService.disconnect();

    this.syncActiveConnectionFromEnv(env, true);
    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    return this.toPublicDatabaseSettings(env);
  }

  getAiSettings() {
    const env = this.readEnvFile();
    return this.toPublicAiSettings(env);
  }

  upsertAiSettings(settingsDto: AiSettingsDto) {
    const env = this.readEnvFile();
    this.applyAiSettings(env, settingsDto);
    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    return this.toPublicAiSettings(env);
  }

  updateAiSettings(settingsDto: AiSettingsDto) {
    return this.upsertAiSettings(settingsDto);
  }

  clearAiSettings() {
    const env = this.readEnvFile();

    delete env.OPENAI_API_KEY;
    delete env.ANTHROPIC_API_KEY;
    delete env.AI_PROVIDER;
    delete env.AI_MODEL;
    delete env.LMSTUDIO_BASE_URL;
    delete env.LMSTUDIO_MODEL;

    this.writeEnvFile(env);
    this.applyToProcessEnv(env);

    return this.toPublicAiSettings(env);
  }

  getMicroservicesRoot(): { path: string | null } {
    const env = this.readEnvFileAt(this.rootEnvFilePath);
    return { path: env['MICROSERVICES_ROOT'] ?? null };
  }

  setMicroservicesRoot(path: string): { path: string } {
    const env = this.readEnvFileAt(this.rootEnvFilePath);
    env['MICROSERVICES_ROOT'] = path;
    this.writeEnvFileAt(this.rootEnvFilePath, env);
    return { path };
  }

  private readEnvFile(): EnvMap {
    return this.readEnvFileAt(this.envFilePath);
  }

  private writeEnvFile(env: EnvMap): void {
    this.writeEnvFileAt(this.envFilePath, env);
  }

  private readEnvFileAt(filePath: string): EnvMap {
    const normalizedPath = this.normalizeEnvFilePath(filePath);

    if (!existsSync(normalizedPath)) {
      return {};
    }

    const contents = readFileSync(normalizedPath, 'utf8');
    const env: EnvMap = {};

    for (const rawLine of contents.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      const firstEq = line.indexOf('=');
      if (firstEq === -1) continue;

      env[line.slice(0, firstEq).trim()] = line.slice(firstEq + 1).trim();
    }

    return env;
  }

  private writeEnvFileAt(filePath: string, env: EnvMap): void {
    const normalizedPath = this.normalizeEnvFilePath(filePath);
    const sortedEntries = Object.entries(env).sort(([a], [b]) => a.localeCompare(b));
    const contents = sortedEntries.map(([key, value]) => `${key}=${value}`).join('\n');
    writeFileSync(normalizedPath, contents ? `${contents}\n` : '', 'utf8');
  }

  private normalizeEnvFilePath(filePath: string): string {
    if (!existsSync(filePath)) {
      return filePath;
    }

    try {
      if (statSync(filePath).isDirectory()) {
        // Docker can create a directory for bind-mounted files that don't exist on the host.
        // Persist values to a deterministic file within that directory instead of crashing.
        return resolve(filePath, '.env');
      }
    } catch {
      return filePath;
    }

    return filePath;
  }

  private applyToProcessEnv(env: EnvMap): void {
    for (const key of [...DB_KEYS, DB_CONNECTIONS_KEY, DB_ACTIVE_CONNECTION_ID_KEY, ...AI_KEYS]) {
      const value = env[key];
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  private applyDatabaseSettings(env: EnvMap, settingsDto: DatabaseSettingsDto): void {
    if (settingsDto.host !== undefined) {
      env.DB_HOST = settingsDto.host;
    }
    if (settingsDto.port !== undefined) {
      env.DB_PORT = String(settingsDto.port);
    }
    if (settingsDto.username !== undefined) {
      env.DB_USER = settingsDto.username;
    }
    if (settingsDto.password !== undefined) {
      env.DB_PASSWORD = settingsDto.password;
    }
    if (settingsDto.database !== undefined) {
      env.DB_NAME = settingsDto.database;
    }
  }

  private applyAiSettings(env: EnvMap, settingsDto: AiSettingsDto): void {
    if (settingsDto.openAIApiKey !== undefined) {
      env.OPENAI_API_KEY = settingsDto.openAIApiKey;
    }
    if (settingsDto.anthropicApiKey !== undefined) {
      env.ANTHROPIC_API_KEY = settingsDto.anthropicApiKey;
    }
    if (settingsDto.lmStudio?.baseUrl !== undefined) {
      env.LMSTUDIO_BASE_URL = settingsDto.lmStudio.baseUrl;
    }
    if (settingsDto.lmStudio?.model !== undefined) {
      env.LMSTUDIO_MODEL = settingsDto.lmStudio.model;
    }
    if (settingsDto.aiProvider !== undefined) {
      env.AI_PROVIDER = settingsDto.aiProvider;
    }
    if (settingsDto.aiModel !== undefined) {
      env.AI_MODEL = settingsDto.aiModel;
    }
  }

  private getDbConnectionFromEnv(env: EnvMap): PostgresConnectionDto | null {
    const host = env.DB_HOST;
    const port = Number(env.DB_PORT);
    const username = env.DB_USER;
    const password = env.DB_PASSWORD;
    const database = env.DB_NAME;

    if (!host || !port || !username || !database || password === undefined) {
      return null;
    }

    return {
      host,
      port,
      username,
      password,
      database,
    };
  }

  private applyConnectionToEnv(env: EnvMap, connection: {
    host: string;
    port: number;
    username: string;
    password?: string;
    database: string;
  }) {
    env.DB_HOST = connection.host;
    env.DB_PORT = String(connection.port);
    env.DB_USER = connection.username;
    env.DB_NAME = connection.database;
    if (connection.password !== undefined) {
      env.DB_PASSWORD = connection.password;
    }
  }

  private readDatabaseConnections(env: EnvMap): Array<{
    id: string;
    name: string;
    host: string;
    port: number;
    username: string;
    password?: string;
    database: string;
  }> {
    const encoded = env[DB_CONNECTIONS_KEY];
    if (!encoded) {
      return [];
    }

    try {
      const raw = Buffer.from(encoded, 'base64').toString('utf8');
      const parsed = JSON.parse(raw) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        return [];
      }

      return parsed
        .map((item) => {
          const id = typeof item.id === 'string' ? item.id : '';
          const name = typeof item.name === 'string' ? item.name : '';
          const host = typeof item.host === 'string' ? item.host : '';
          const port = Number(item.port);
          const username = typeof item.username === 'string' ? item.username : '';
          const database = typeof item.database === 'string' ? item.database : '';
          const password = typeof item.password === 'string' ? item.password : undefined;

          if (!id || !host || !database || !username || !Number.isFinite(port) || port <= 0) {
            return null;
          }

          return {
            id,
            name,
            host,
            port,
            username,
            password,
            database,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    } catch {
      return [];
    }
  }

  private writeDatabaseConnections(
    env: EnvMap,
    connections: Array<{
      id: string;
      name: string;
      host: string;
      port: number;
      username: string;
      password?: string;
      database: string;
    }>,
  ) {
    if (connections.length === 0) {
      delete env[DB_CONNECTIONS_KEY];
      return;
    }

    const json = JSON.stringify(connections);
    env[DB_CONNECTIONS_KEY] = Buffer.from(json, 'utf8').toString('base64');
  }

  private normalizeDatabaseConnection(
    dto: DatabaseConnectionUpsertDto,
    existingConnections: Array<{ id: string; password?: string }>,
  ) {
    const id = dto.id?.trim();
    const host = dto.host?.trim();
    const database = dto.database?.trim();
    const username = dto.username?.trim();
    const name = dto.name?.trim() || `${host || 'localhost'} / ${database || 'postgres'}`;
    const port = Number(dto.port);

    if (!id || !host || !database || !username || !Number.isFinite(port) || port <= 0) {
      throw new BadRequestException('Invalid database connection payload');
    }

    const existing = existingConnections.find((connection) => connection.id === id);

    return {
      id,
      name,
      host,
      port,
      username,
      database,
      password: dto.password !== undefined ? dto.password : existing?.password,
    };
  }

  private syncActiveConnectionFromEnv(env: EnvMap, clearActivePassword = false) {
    const activeId = env[DB_ACTIVE_CONNECTION_ID_KEY];
    if (!activeId) {
      return;
    }

    const connections = this.readDatabaseConnections(env);
    const activeConnection = connections.find((connection) => connection.id === activeId);
    if (!activeConnection) {
      return;
    }

    activeConnection.host = env.DB_HOST ?? activeConnection.host;
    activeConnection.port = env.DB_PORT ? Number(env.DB_PORT) : activeConnection.port;
    activeConnection.username = env.DB_USER ?? activeConnection.username;
    activeConnection.database = env.DB_NAME ?? activeConnection.database;
    if (clearActivePassword) {
      delete activeConnection.password;
    } else if (env.DB_PASSWORD !== undefined) {
      activeConnection.password = env.DB_PASSWORD;
    }

    this.writeDatabaseConnections(env, connections);
  }

  private toPublicDatabaseSettings(env: EnvMap) {
    return {
      host: env.DB_HOST ?? null,
      port: env.DB_PORT ? Number(env.DB_PORT) : null,
      username: env.DB_USER ?? null,
      passwordSet: env.DB_PASSWORD !== undefined,
      database: env.DB_NAME ?? null,
      connected: this.databasesService.isConnected(),
    };
  }

  private toPublicAiSettings(env: EnvMap) {
    return {
      openAIApiKeySet: !!env.OPENAI_API_KEY,
      anthropicApiKeySet: !!env.ANTHROPIC_API_KEY,
      lmStudio: {
        baseUrl: env.LMSTUDIO_BASE_URL ?? null,
        model: env.LMSTUDIO_MODEL ?? null,
      },
      provider: env.AI_PROVIDER ?? 'openai',
      model: env.AI_MODEL ?? null,
    };
  }
}
