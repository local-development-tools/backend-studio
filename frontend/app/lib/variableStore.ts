const GLOBAL_KEY = 'bru_global_vars';

function collectionKey(collectionId: string): string {
  return `bru_collection_vars_${collectionId}`;
}

function readStore(key: string): Record<string, unknown> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function writeStore(key: string, store: Record<string, unknown>): void {
  localStorage.setItem(key, JSON.stringify(store));
}

export function getVar(name: string): unknown {
  return readStore(GLOBAL_KEY)[name];
}

export function setVar(name: string, value: unknown): void {
  const store = readStore(GLOBAL_KEY);
  store[name] = value;
  writeStore(GLOBAL_KEY, store);
}

export function getCollectionVar(collectionId: string, name: string): unknown {
  return readStore(collectionKey(collectionId))[name];
}

export function setCollectionVar(collectionId: string, name: string, value: unknown): void {
  const store = readStore(collectionKey(collectionId));
  store[name] = value;
  writeStore(collectionKey(collectionId), store);
}

export function resolveVariable(
  name: string,
  collectionId?: string,
  envVars?: Record<string, string>,
): unknown {
  if (collectionId) {
    const collVal = getCollectionVar(collectionId, name);
    if (collVal !== undefined) return collVal;
  }
  if (envVars && name in envVars) return envVars[name];
  return getVar(name);
}

export function interpolateVariables(
  text: string,
  collectionId?: string,
  envVars?: Record<string, string>,
): string {
  return text.replace(/\{\{([^}]+)\}\}/g, (_, name: string) => {
    const val = resolveVariable(name.trim(), collectionId, envVars);
    return val !== undefined ? String(val) : `{{${name}}}`;
  });
}
