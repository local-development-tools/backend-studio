import { NotFoundException, BadRequestException } from '@nestjs/common';
import * as fs from 'fs/promises';

const ENV_NAME_REGEX = /^[a-zA-Z0-9_-]+$/;

export function assertValidEnvName(name: string): void {
  if (!ENV_NAME_REGEX.test(name)) {
    throw new BadRequestException('Environment name must only contain letters, numbers, hyphens, or underscores');
  }
}

export async function assertFileExists(filePath: string, label: string): Promise<void> {
  try {
    await fs.access(filePath);
  } catch {
    throw new NotFoundException(`${label} not found`);
  }
}
