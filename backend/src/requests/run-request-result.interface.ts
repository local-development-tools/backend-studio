export interface RunRequestResult {
  requestId: string;
  ok: boolean;
  status?: number;
  statusText?: string;
  headers?: Record<string, string>;
  durationMs: number;
  bodyText?: string;
  bodyJson?: unknown;
  error?: string;
}
