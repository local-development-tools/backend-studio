import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { assertFileExists, assertValidEnvName } from './fs.utils';
import { EnvironmentDto } from './entities/environment.entity';

@Injectable()
export class EnvironmentsService {
  private readonly collectionsDir = path.join(process.cwd(), 'data', 'collections');

  private envsDir(collectionId: string): string {
    return path.join(this.collectionsDir, collectionId, 'environments');
  }

  private envFilePath(collectionId: string, name: string): string {
    return path.join(this.envsDir(collectionId), `${name}.bru`);
  }

  async listEnvironments(collectionId: string): Promise<EnvironmentDto[]> {
    const dir = this.envsDir(collectionId);
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const results: EnvironmentDto[] = [];

      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.bru')) continue;
        const name = entry.name.replace(/\.bru$/, '');
        const contents = await fs.readFile(path.join(dir, entry.name), 'utf-8');
        results.push({ name, vars: this.parseVars(contents) });
      }

      return results;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw err;
    }
  }

  async getEnvironment(collectionId: string, name: string): Promise<EnvironmentDto> {
    assertValidEnvName(name);
    const filePath = this.envFilePath(collectionId, name);
    try {
      const contents = await fs.readFile(filePath, 'utf-8');
      return { name, vars: this.parseVars(contents) };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Environment "${name}" not found`);
      }
      throw err;
    }
  }

  async createEnvironment(
    collectionId: string,
    name: string,
    vars: Record<string, string> = {},
  ): Promise<EnvironmentDto> {
    assertValidEnvName(name);

    const dir = this.envsDir(collectionId);
    await fs.mkdir(dir, { recursive: true });

    const filePath = this.envFilePath(collectionId, name);
    try {
      await fs.access(filePath);
      throw new BadRequestException(`Environment "${name}" already exists`);
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      const code = (err as NodeJS.ErrnoException).code;
      if (code && code !== 'ENOENT') throw err;
    }

    await fs.writeFile(filePath, this.serializeVars(vars), 'utf-8');
    return { name, vars };
  }

  async updateEnvironment(
    collectionId: string,
    name: string,
    vars: Record<string, string>,
    newName?: string,
  ): Promise<EnvironmentDto> {
    const filePath = this.envFilePath(collectionId, name);
    await assertFileExists(filePath, `Environment "${name}"`);

    if (newName && newName !== name) {
      assertValidEnvName(newName);
      const newFilePath = this.envFilePath(collectionId, newName);
      try {
        await fs.access(newFilePath);
        throw new BadRequestException(`Environment "${newName}" already exists`);
      } catch (err) {
        if (err instanceof BadRequestException) throw err;
        const code = (err as NodeJS.ErrnoException).code;
        if (code && code !== 'ENOENT') throw err;
      }

      const moved = await fs
        .rename(filePath, newFilePath)
        .then(() => true)
        .catch((err) => {
          if ((err as NodeJS.ErrnoException).code === 'EXDEV') return false;
          throw err;
        });
      await fs.writeFile(newFilePath, this.serializeVars(vars), 'utf-8');
      if (!moved) {
        await fs.rm(filePath, { force: true });
      }

      const metaPath = path.join(this.collectionsDir, collectionId, 'meta.json');
      try {
        const raw = await fs.readFile(metaPath, 'utf-8');
        const meta = JSON.parse(raw) as Record<string, unknown>;
        if (meta['activeEnvironment'] === name) {
          meta['activeEnvironment'] = newName;
          meta['updatedAt'] = new Date();
          await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
        }
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw err;
        }
      }
      return { name: newName, vars };
    }

    await fs.writeFile(filePath, this.serializeVars(vars), 'utf-8');
    return { name, vars };
  }

  async deleteEnvironment(collectionId: string, name: string): Promise<void> {
    assertValidEnvName(name);
    const filePath = this.envFilePath(collectionId, name);
    await assertFileExists(filePath, `Environment "${name}"`);
    await fs.rm(filePath, { force: true });

    const metaPath = path.join(this.collectionsDir, collectionId, 'meta.json');
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(raw) as Record<string, unknown>;
      if (meta['activeEnvironment'] === name) {
        delete meta['activeEnvironment'];
        meta['updatedAt'] = new Date();
        await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  }

  async setActiveEnvironment(collectionId: string, environmentName: string | null): Promise<void> {
    const metaPath = path.join(this.collectionsDir, collectionId, 'meta.json');
    if (environmentName !== null) {
      assertValidEnvName(environmentName);
      const envPath = this.envFilePath(collectionId, environmentName);
      await assertFileExists(envPath, `Environment "${environmentName}"`);
    }
    try {
      const raw = await fs.readFile(metaPath, 'utf-8');
      const meta = JSON.parse(raw) as Record<string, unknown>;
      if (environmentName === null) {
        delete meta['activeEnvironment'];
      } else {
        meta['activeEnvironment'] = environmentName;
      }
      meta['updatedAt'] = new Date();
      await fs.writeFile(metaPath, JSON.stringify(meta, null, 2), 'utf-8');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new NotFoundException(`Collection "${collectionId}" not found`);
      }
      throw err;
    }
  }

  private parseVars(contents: string): Record<string, string> {
    const vars: Record<string, string> = {};
    const blockMatch = contents.match(/vars\s*\{([^}]*)\}/s);
    if (!blockMatch) return vars;

    const lines = blockMatch[1].split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf(':');
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed.slice(idx + 1).trim();
      if (key) vars[key] = value;
    }
    return vars;
  }

  private serializeVars(vars: Record<string, string>): string {
    const lines = Object.entries(vars).map(([k, v]) => `  ${k}: ${v}`);
    return `vars {\n${lines.join('\n')}\n}\n`;
  }
}
