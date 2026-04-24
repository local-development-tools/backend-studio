import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { resolve4, resolve6 } from 'node:dns/promises';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Pool } from 'pg';
import { PostgresConnectionDto } from 'src/settings/dto/postgres-connection.dto';
import { CreateBackupDto } from './dto/create-backup.dto';
import { EditRecordDto } from './dto/edit-record.dto';

const execFileAsync = promisify(execFile);

@Injectable()
export class DatabasesService implements OnModuleInit {
  private pool: Pool | null = null;
  private currentConnection: PostgresConnectionDto | null = null;
  private readonly logger = new Logger(DatabasesService.name);
  private readonly envFilePath = resolve(__dirname, '../../.env');

  constructor() {}

  async onModuleInit(): Promise<void> {
    const host = process.env.DB_HOST;
    const port = Number(process.env.DB_PORT);
    const username = process.env.DB_USER;
    const password = process.env.DB_PASSWORD;
    const database = process.env.DB_NAME;

    if (!host || !port || !username || !database || password === undefined) {
      return;
    }

    try {
      await this.connect({ host, port, username, password, database });
      this.logger.log('Database connection restored from environment settings.');
    } catch (error) {
      this.logger.error(`Failed to restore database connection from environment settings: ${error.message}`);
    }
  }

  isConnected(): boolean {
    return this.pool !== null;
  }

  private ensureConnected(): Pool {
    if (!this.pool) {
      throw new ServiceUnavailableException(
        'Database not connected. Call POST /settings/db first to establish a PostgreSQL connection.',
      );
    }

    return this.pool;
  }

  async connect(connectionDto: PostgresConnectionDto): Promise<void> {
    try {
      if (this.pool) {
        await this.disconnect();
      }

      this.currentConnection = { ...connectionDto };

      this.pool = new Pool({
        host: connectionDto.host,
        port: connectionDto.port,
        user: connectionDto.username,
        password: connectionDto.password,
        database: connectionDto.database,
      });

      const client = await this.pool.connect();
      client.release();
    } catch (error) {
      throw new ServiceUnavailableException(`Failed to connect to PostgreSQL database: ${(error as Error).message}`);
    }
  }

  async query(text: string, params?: any[], schema?: string): Promise<any> {
    if (!text || !text.trim()) {
      throw new BadRequestException('Field "query" is required');
    }

    const pool = this.ensureConnected();

    try {
      if (schema && /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(schema)) {
        const client = await pool.connect();
        try {
          await client.query(`SET search_path TO "${schema}", public`);
          return await client.query(text, params);
        } finally {
          client.release();
        }
      }

      return await pool.query(text, params);
    } catch (error) {
      throw this._mapDbError(error, 'Query failed');
    }
  }

  async executeQuery(query: string, params?: any[]): Promise<any> {
    try {
      const result = await this.query(query, params);
      return {
        rowCount: result.rowCount,
        rows: result.rows,
      };
    } catch (error) {
      throw this._mapDbError(error, 'Query failed');
    }
  }

  async editRecord(editRecordDto: EditRecordDto): Promise<any> {
    const table = editRecordDto?.table?.trim();
    if (!table) {
      throw new BadRequestException('Field "table" is required');
    }
    this.ensureSafeIdentifier(table, 'table');

    const values = this.assertRecordMap(editRecordDto?.values, 'values');
    const where = this.assertRecordMap(editRecordDto?.where, 'where');
    const returning = this.normalizeReturningColumns(editRecordDto?.returning);

    const params: unknown[] = [];
    let paramIndex = 1;

    const setClause = Object.entries(values)
      .map(([column, value]) => {
        this.ensureSafeIdentifier(column, 'values key');
        if (value === undefined) {
          throw new BadRequestException(`Field "values.${column}" cannot be undefined`);
        }

        const placeholder = `$${paramIndex++}`;
        params.push(value);
        return `${this.quoteIdentifier(column)} = ${placeholder}`;
      })
      .join(', ');

    const whereClause = Object.entries(where)
      .map(([column, value]) => {
        this.ensureSafeIdentifier(column, 'where key');
        if (value === undefined) {
          throw new BadRequestException(`Field "where.${column}" cannot be undefined`);
        }

        if (value === null) {
          return `${this.quoteIdentifier(column)} IS NULL`;
        }

        const placeholder = `$${paramIndex++}`;
        params.push(value);
        return `${this.quoteIdentifier(column)} = ${placeholder}`;
      })
      .join(' AND ');

    const returningClause = returning.length
      ? ` RETURNING ${returning.map((column) => this.quoteIdentifier(column)).join(', ')}`
      : '';

    const sql = `UPDATE ${this.quoteIdentifier(table)} SET ${setClause} WHERE ${whereClause}${returningClause};`;

    try {
      const result = await this.query(sql, params as any[]);
      return {
        rowCount: result.rowCount ?? 0,
        rows: result.rows ?? [],
      };
    } catch (error) {
      throw this._mapDbError(error, 'Record update failed');
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
    }

    this.currentConnection = null;
  }

  async getDatabases(): Promise<any> {
    try {
      return await this.query('SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;');
    } catch (error) {
      const fallback = await this.queryDatabaseNamesFromMaintenanceDb();
      if (fallback) {
        return fallback;
      }

      throw error;
    }
  }

  async getSchemas(database: string): Promise<any> {
    if (!database || !database.trim()) {
      throw new BadRequestException('Path param "database" is required');
    }

    return this.query(
      `SELECT schema_name FROM information_schema.schemata
       WHERE catalog_name = $1
         AND schema_name NOT IN ('information_schema', 'pg_catalog', 'pg_toast')
         AND schema_name NOT LIKE 'pg_%'
       ORDER BY schema_name;`,
      [database],
    );
  }

  async getTables(database: string, schema = 'public'): Promise<any> {
    if (!database || !database.trim()) {
      throw new BadRequestException('Path param "database" is required');
    }

    return this.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $2 AND table_catalog = $1;`,
      [database, schema],
    );
  }

  async getTableEnumColumns(database: string, table: string, schema = 'public'): Promise<any> {
    if (!database || !database.trim()) {
      throw new BadRequestException('Path param "database" is required');
    }
    if (!table || !table.trim()) {
      throw new BadRequestException('Path param "table" is required');
    }

    return this.query(
      `SELECT c.column_name,
              array_agg(e.enumlabel ORDER BY e.enumsortorder) AS enum_values
       FROM information_schema.columns c
       JOIN pg_catalog.pg_type t ON t.typname = c.udt_name
       JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace AND n.nspname = c.udt_schema
       JOIN pg_catalog.pg_enum e ON e.enumtypid = t.oid
       WHERE c.table_name = $1
         AND c.table_catalog = $2
         AND c.table_schema = $3
       GROUP BY c.column_name;`,
      [table, database, schema],
    );
  }

  async getTableSchema(database: string, table: string): Promise<any> {
    if (!database || !database.trim()) {
      throw new BadRequestException('Path param "database" is required');
    }
    if (!table || !table.trim()) {
      throw new BadRequestException('Path param "table" is required');
    }

    return this.query(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1 AND table_catalog = $2;`,
      [table, database],
    );
  }

  private normalizePgSchema(schema?: string): string {
    if (schema && /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(schema)) {
      return schema;
    }

    return 'public';
  }

  async getSchemaSummary(schemaName?: string): Promise<{ summary: string; schema: string }> {
    const schema = this.normalizePgSchema(schemaName);
    const result = await this.ensureConnected().query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = $1
       ORDER BY table_name, ordinal_position;`,
      [schema],
    );

    if (!result.rows.length) {
      return {
        summary: `No tables found in schema "${schema}".`,
        schema,
      };
    }

    const tableMap = new Map<string, string[]>();
    for (const row of result.rows) {
      const tableName = row.table_name as string;
      const columnName = row.column_name as string;
      const dataType = row.data_type as string;

      const columns = tableMap.get(tableName) ?? [];
      columns.push(`${columnName} (${dataType})`);
      tableMap.set(tableName, columns);
    }

    const summary = [...tableMap.entries()]
      .map(([tableName, columns]) => `table ${tableName}: ${columns.join(', ')}`)
      .join('\n');

    return { summary, schema };
  }

  private _mapDbError(error: unknown, defaultMessage: string): Error {
    if (
      error instanceof BadRequestException ||
      error instanceof ServiceUnavailableException ||
      error instanceof InternalServerErrorException
    ) {
      return error;
    }

    const dbError = error as { code?: string; message?: string };
    const code = dbError?.code;

    if (code === 'ECONNREFUSED' || code === '57P01' || code === '08006' || code === '08001') {
      return new ServiceUnavailableException(dbError?.message ?? 'Database connection failed');
    }

    if (code === '42601' || code === '42P01' || code === '42703' || code === '22P02') {
      return new BadRequestException(dbError?.message ?? 'Invalid SQL query');
    }

    return new InternalServerErrorException(dbError?.message ?? defaultMessage);
  }

  async createBackup(createBackupDto: CreateBackupDto): Promise<any> {
    const sourceHost = createBackupDto.host?.trim();
    const sourcePort = createBackupDto.port ?? 5432;
    const sourceUser = createBackupDto.user?.trim();
    const sourcePassword = createBackupDto.password;
    const sourceDatabase = createBackupDto.dbname?.trim();
    const sourceSslMode = this.resolveSourceSslMode(createBackupDto.sslmode);

    if (!sourceHost || !sourceUser || !sourceDatabase || sourcePassword === undefined) {
      throw new BadRequestException('Fields "host", "user", "password", and "dbname" are required');
    }

    this.ensureSafeIdentifier(sourceDatabase, 'dbname');
    await this.ensureSourceHostResolvable(sourceHost);

    const localHost = process.env.DB_HOST?.trim() || 'localhost';
    const localPort = Number(process.env.DB_PORT) || 5432;
    const localUser = process.env.DB_USER?.trim() || sourceUser;
    const localPassword = process.env.DB_PASSWORD ?? sourcePassword;
    const targetDatabase = `${sourceDatabase}_clone_${Date.now()}`;

    this.ensureSafeIdentifier(targetDatabase, 'target database name');

    const envVars = {
      SOURCE_HOST: sourceHost,
      SOURCE_PORT: String(sourcePort),
      SOURCE_USER: sourceUser,
      SOURCE_PASSWORD: sourcePassword,
      SOURCE_DB: sourceDatabase,
      SOURCE_SSLMODE: sourceSslMode,
      LOCAL_HOST: localHost,
      LOCAL_PORT: String(localPort),
      LOCAL_USER: localUser,
      LOCAL_PASSWORD: localPassword,
      TARGET_DB: targetDatabase,
    };

    const command = [
      'set -euo pipefail',
      'PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS \\\"$TARGET_DB\\\";" -c "CREATE DATABASE \\\"$TARGET_DB\\\";"',
      'PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c "DROP SCHEMA IF EXISTS public CASCADE;"',
      'PGSSLMODE="$SOURCE_SSLMODE" PGPASSWORD="$SOURCE_PASSWORD" pg_dump -h "$SOURCE_HOST" -p "$SOURCE_PORT" -U "$SOURCE_USER" -d "$SOURCE_DB" --no-owner --no-acl --schema=public | PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1',
    ].join('\n');

    try {
      await this.runBash(command, envVars);

      await this.connect({
        host: localHost,
        port: localPort,
        username: localUser,
        password: localPassword,
        database: targetDatabase,
      });

      this.persistDatabaseSettings({
        host: localHost,
        port: localPort,
        username: localUser,
        password: localPassword,
        database: targetDatabase,
      });
    } catch (error) {
      await this.cleanupFailedClone(targetDatabase, envVars);
      throw error;
    }

    return {
      sourceDatabase,
      localDatabase: targetDatabase,
      connected: this.isConnected(),
      localConnection: {
        host: localHost,
        port: localPort,
        username: localUser,
        database: targetDatabase,
      },
    };
  }

  private ensureSafeIdentifier(value: string, field: string): void {
    if (!/^[a-zA-Z0-9_]+$/.test(value)) {
      throw new BadRequestException(`Invalid ${field}. Use only letters, numbers, and underscore.`);
    }
  }

  private assertRecordMap(value: unknown, field: 'values' | 'where'): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new BadRequestException(`Field "${field}" must be an object`);
    }

    const typedValue = value as Record<string, unknown>;
    const entries = Object.entries(typedValue);

    if (!entries.length) {
      throw new BadRequestException(`Field "${field}" must include at least one key`);
    }

    for (const [key] of entries) {
      if (!key || !key.trim()) {
        throw new BadRequestException(`Field "${field}" contains an empty key`);
      }
    }

    return typedValue;
  }

  private normalizeReturningColumns(columns?: string[]): string[] {
    if (columns === undefined) {
      return [];
    }

    if (!Array.isArray(columns)) {
      throw new BadRequestException('Field "returning" must be an array of column names');
    }

    return columns.map((column, index) => {
      if (typeof column !== 'string' || !column.trim()) {
        throw new BadRequestException(`Field "returning[${index}]" must be a non-empty string`);
      }

      const trimmed = column.trim();
      this.ensureSafeIdentifier(trimmed, 'returning column');
      return trimmed;
    });
  }

  private quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
  }

  private resolveSourceSslMode(value?: string): NonNullable<CreateBackupDto['sslmode']> {
    const normalized = value?.trim() as NonNullable<CreateBackupDto['sslmode']> | undefined;
    const allowed = new Set<NonNullable<CreateBackupDto['sslmode']>>([
      'disable',
      'allow',
      'prefer',
      'require',
      'verify-ca',
      'verify-full',
    ]);

    if (!normalized) {
      return 'prefer';
    }

    if (!allowed.has(normalized)) {
      throw new BadRequestException(
        'Invalid sslmode. Allowed values: disable, allow, prefer, require, verify-ca, verify-full.',
      );
    }

    return normalized;
  }

  private async ensureSourceHostResolvable(host: string): Promise<void> {
    const hasIpv4 = await this.hasDnsRecord(resolve4, host);
    const hasIpv6 = await this.hasDnsRecord(resolve6, host);

    if (!hasIpv4 && hasIpv6) {
      throw new BadRequestException(
        `Source host "${host}" resolves only to IPv6. This backend container has no IPv6 route. Use an IPv4-capable endpoint (for Supabase, use session pooler host) or enable IPv6 for Docker.`,
      );
    }

    if (!hasIpv4 && !hasIpv6) {
      throw new ServiceUnavailableException(`Unable to resolve source host "${host}".`);
    }
  }

  private async hasDnsRecord(
    resolver: (hostname: string) => Promise<string[] | { address: string; ttl: number }[]>,
    host: string,
  ): Promise<boolean> {
    try {
      const records = await resolver(host);
      return Array.isArray(records) && records.length > 0;
    } catch {
      return false;
    }
  }

  private async runBash(command: string, envVars: Record<string, string>): Promise<void> {
    try {
      await execFileAsync('bash', ['-lc', command], {
        env: {
          ...process.env,
          ...envVars,
        },
        maxBuffer: 10 * 1024 * 1024,
      });
    } catch (error) {
      const typedError = error as NodeJS.ErrnoException & { stderr?: string };

      if (typedError.code === 'ENOENT') {
        throw new ServiceUnavailableException(
          'bash is not available in backend runtime. Install bash and PostgreSQL client tools (psql, pg_dump).',
        );
      }

      const details = typedError.stderr?.trim();
      throw new ServiceUnavailableException(
        details ? `Database clone command failed: ${details}` : 'Database clone command failed',
      );
    }
  }

  private async cleanupFailedClone(targetDatabase: string, envVars: Record<string, string>): Promise<void> {
    try {
      const cleanupCommand = [
        'set -euo pipefail',
        'PGPASSWORD="$LOCAL_PASSWORD" psql -h "$LOCAL_HOST" -p "$LOCAL_PORT" -U "$LOCAL_USER" -d postgres -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = \'$TARGET_DB\' AND pid <> pg_backend_pid();" -c "DROP DATABASE IF EXISTS \\\"$TARGET_DB\\\";"',
      ].join('\n');

      await this.runBash(cleanupCommand, envVars);
      this.logger.warn(`Clone operation failed. Cleaned up partially created database "${targetDatabase}".`);
    } catch (cleanupError) {
      this.logger.error(
        `Clone operation failed and cleanup could not drop "${targetDatabase}": ${(cleanupError as Error).message}`,
      );
    }
  }

  private persistDatabaseSettings(connection: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  }): void {
    const env = this.readEnvFile();
    env.DB_HOST = connection.host;
    env.DB_PORT = String(connection.port);
    env.DB_USER = connection.username;
    env.DB_PASSWORD = connection.password;
    env.DB_NAME = connection.database;

    this.writeEnvFile(env);

    process.env.DB_HOST = connection.host;
    process.env.DB_PORT = String(connection.port);
    process.env.DB_USER = connection.username;
    process.env.DB_PASSWORD = connection.password;
    process.env.DB_NAME = connection.database;
  }

  private async queryDatabaseNamesFromMaintenanceDb(): Promise<any | null> {
    const connection = this.currentConnection;
    if (!connection) {
      return null;
    }

    const maintenanceDatabases = ['postgres', 'template1'];
    for (const database of maintenanceDatabases) {
      if (database === connection.database) {
        continue;
      }

      const tempPool = new Pool({
        host: connection.host,
        port: connection.port,
        user: connection.username,
        password: connection.password,
        database,
      });

      try {
        const result = await tempPool.query(
          'SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname;',
        );
        await tempPool.end();
        return result;
      } catch (error) {
        await tempPool.end().catch(() => undefined);
        this.logger.warn(
          `Failed to list databases from maintenance database "${database}". Falling back to current database if needed: ${(error as Error).message}`,
        );
      }
    }

    if (connection.database) {
      return {
        rows: [{ datname: connection.database }],
        rowCount: 1,
      };
    }

    return null;
  }

  private readEnvFile(): Record<string, string> {
    if (!existsSync(this.envFilePath)) {
      return {};
    }

    const contents = readFileSync(this.envFilePath, 'utf8');
    const lines = contents.split(/\r?\n/);
    const env: Record<string, string> = {};

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) {
        continue;
      }

      const firstEq = line.indexOf('=');
      if (firstEq === -1) {
        continue;
      }

      const key = line.slice(0, firstEq).trim();
      const value = line.slice(firstEq + 1).trim();
      env[key] = value;
    }

    return env;
  }

  private writeEnvFile(env: Record<string, string>): void {
    const sortedEntries = Object.entries(env).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
    const contents = sortedEntries.map(([key, value]) => `${key}=${value}`).join('\n');
    writeFileSync(this.envFilePath, contents ? `${contents}\n` : '', 'utf8');
  }
}
