import { API_BASE_URL } from './config';

export interface EnvironmentDto {
  name: string;
  vars: Record<string, string>;
}

function base(collectionId: string) {
  return `${API_BASE_URL}/collections/${collectionId}/environments`;
}

export function listEnvironments(collectionId: string): Promise<EnvironmentDto[]> {
  return fetch(base(collectionId)).then((r) => {
    if (!r.ok) throw new Error('Failed to list environments');
    return r.json() as Promise<EnvironmentDto[]>;
  });
}

export function getEnvironment(collectionId: string, name: string): Promise<EnvironmentDto> {
  return fetch(`${base(collectionId)}/${encodeURIComponent(name)}`).then((r) => {
    if (!r.ok) throw new Error(`Failed to get environment ${name}`);
    return r.json() as Promise<EnvironmentDto>;
  });
}

export function createEnvironment(
  collectionId: string,
  name: string,
  vars: Record<string, string> = {},
): Promise<EnvironmentDto> {
  return fetch(base(collectionId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, vars }),
  }).then((r) => {
    if (!r.ok) throw new Error('Failed to create environment');
    return r.json() as Promise<EnvironmentDto>;
  });
}

export function updateEnvironment(
  collectionId: string,
  name: string,
  vars: Record<string, string>,
  newName?: string,
): Promise<EnvironmentDto> {
  return fetch(`${base(collectionId)}/${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ vars, newName }),
  }).then((r) => {
    if (!r.ok) throw new Error('Failed to update environment');
    return r.json() as Promise<EnvironmentDto>;
  });
}

export function deleteEnvironment(collectionId: string, name: string): Promise<void> {
  return fetch(`${base(collectionId)}/${encodeURIComponent(name)}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error('Failed to delete environment');
  });
}

export function setActiveEnvironment(
  collectionId: string,
  name: string | null,
): Promise<void> {
  return fetch(`${API_BASE_URL}/collections/${collectionId}/active-environment`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  }).then((r) => {
    if (!r.ok) throw new Error('Failed to set active environment');
  });
}
