import {
  getVar,
  setVar,
  getCollectionVar,
  setCollectionVar,
} from './variableStore';

export interface ScriptResponse {
  status: number;
  statusText: string;
  headers: Record<string, string>;
  body: string;
}

export interface ScriptError {
  message: string;
  line?: number;
}

export function runPostScript(
  script: string,
  response: ScriptResponse,
  collectionId?: string,
  envVars?: Record<string, string>,
): ScriptError | null {
  const headersMap = response.headers;

  let parsedBody: unknown;
  try {
    parsedBody = JSON.parse(response.body);
  } catch {
    parsedBody = response.body;
  }

  const res = {
    getBody: () => parsedBody,
    getStatus: () => response.status,
    getHeaders: () => headersMap,
  };

  const bru = {
    setVar: (name: string, value: unknown) => setVar(name, value),
    getVar: (name: string) => getVar(name),
    setCollectionVar: (name: string, value: unknown) => {
      if (collectionId) {
        setCollectionVar(collectionId, name, value);
      } else {
        setVar(name, value);
      }
    },
    getCollectionVar: (name: string) => {
      if (collectionId) {
        const v = getCollectionVar(collectionId, name);
        if (v !== undefined) return v;
      }
      if (envVars && name in envVars) return envVars[name];
      return getVar(name);
    },
  };

  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('res', 'bru', script);
    fn(res, bru);
    return null;
  } catch (err) {
    return {
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
