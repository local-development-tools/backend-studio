import { API_BASE_URL } from '~/lib/api/config';

export type AiProvider = 'openai' | 'anthropic' | 'lmstudio';

export interface DatabaseSettingsResponse {
  host: string | null;
  port: number | null;
  username: string | null;
  passwordSet: boolean;
  database: string | null;
  connected: boolean;
}

export interface DatabaseSettingsPatch {
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
}

export interface AiSettingsResponse {
  openAIApiKeySet: boolean;
  anthropicApiKeySet: boolean;
  lmStudio: {
    baseUrl: string | null;
    model: string | null;
  };
  provider: AiProvider;
  model: string | null;
}

export interface AiSettingsPatch {
  openAIApiKey?: string;
  anthropicApiKey?: string;
  lmStudio?: {
    baseUrl?: string;
    model?: string;
  };
  aiProvider?: AiProvider;
  aiModel?: string;
}

export async function getDatabaseSettings(): Promise<DatabaseSettingsResponse> {
  const res = await fetch(`${API_BASE_URL}/settings/db`);
  if (!res.ok) throw new Error(`Failed to load database settings: ${res.status}`);
  return res.json() as Promise<DatabaseSettingsResponse>;
}

export async function patchDatabaseSettings(
  payload: DatabaseSettingsPatch,
): Promise<DatabaseSettingsResponse> {
  const res = await fetch(`${API_BASE_URL}/settings/db`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to save database settings: ${res.status}`);
  return res.json() as Promise<DatabaseSettingsResponse>;
}

export async function getAiSettings(): Promise<AiSettingsResponse> {
  const res = await fetch(`${API_BASE_URL}/settings/ai`);
  if (!res.ok) throw new Error(`Failed to load AI settings: ${res.status}`);
  return res.json() as Promise<AiSettingsResponse>;
}

export async function patchAiSettings(payload: AiSettingsPatch): Promise<AiSettingsResponse> {
  const res = await fetch(`${API_BASE_URL}/settings/ai`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Failed to save AI settings: ${res.status}`);
  return res.json() as Promise<AiSettingsResponse>;
}

export async function getMicroservicesRoot(): Promise<{ path: string | null }> {
  const res = await fetch(`${API_BASE_URL}/settings/microservices-root`);
  if (!res.ok) throw new Error(`Failed to get microservices root: ${res.status}`);
  return res.json() as Promise<{ path: string | null }>;
}

export async function patchMicroservicesRoot(path: string): Promise<{ path: string }> {
  const res = await fetch(`${API_BASE_URL}/settings/microservices-root`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) throw new Error(`Failed to save microservices root: ${res.status}`);
  return res.json() as Promise<{ path: string }>;
}
