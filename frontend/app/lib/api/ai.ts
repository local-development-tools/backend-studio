import { API_BASE_URL } from "~/lib/api/config";

export type AiProvider = "openai" | "anthropic" | "lmstudio";

export interface GenerateSqlRequest {
  question: string;
  schema?: string;
  provider?: AiProvider;
  model?: string;
}

export interface GenerateSqlResponse {
  sql: string;
  explanation?: string;
}

export interface AnalyzeLogsRequest {
  logs: string | Array<string | Record<string, unknown>>;
  provider?: AiProvider;
  model?: string;
}

export interface AnalyzeLogsResponse {
  summary: string;
  severity: "low" | "medium" | "high" | "critical";
  probableCause: string;
  affectedComponent?: string;
  immediateActions: string[];
  preventionActions: string[];
}

export interface AiPromptListItem {
  fileName: string;
  timestamp: string | null;
  provider: string | null;
  model: string | null;
  question: string | null;
  sql: string;
  explanation?: string;
}

export interface AiPromptDetail extends AiPromptListItem {
  content: string;
}

async function parseErrorMessage(response: Response, fallback: string): Promise<string> {
  try {
    const payload = (await response.json()) as { message?: string | string[] };
    if (Array.isArray(payload.message)) {
      return payload.message.join("\n");
    }

    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Ignore body parse failures and return fallback.
  }

  return fallback;
}

export async function generateSqlWithAi(
  request: GenerateSqlRequest,
): Promise<GenerateSqlResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to generate SQL"));
  }

  return (await response.json()) as GenerateSqlResponse;
}

export async function analyzeLogsWithAi(
  request: AnalyzeLogsRequest,
): Promise<AnalyzeLogsResponse> {
  const response = await fetch(`${API_BASE_URL}/ai/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to analyze logs"));
  }

  return (await response.json()) as AnalyzeLogsResponse;
}

export async function listAiPrompts(): Promise<AiPromptListItem[]> {
  const response = await fetch(`${API_BASE_URL}/ai/prompts`);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to list AI prompts"));
  }

  return (await response.json()) as AiPromptListItem[];
}

export async function getAiPromptByFileName(fileName: string): Promise<AiPromptDetail> {
  const response = await fetch(`${API_BASE_URL}/ai/prompts/${encodeURIComponent(fileName)}`);

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to load AI prompt"));
  }

  return (await response.json()) as AiPromptDetail;
}

export async function saveSqlPrompt(request: {
  sql: string;
  title?: string;
  question?: string;
}): Promise<{ fileName: string }> {
  const response = await fetch(`${API_BASE_URL}/ai/prompts/sql`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to save SQL prompt"));
  }

  return (await response.json()) as { fileName: string };
}

export async function updateAiPromptQuestion(fileName: string, question: string): Promise<AiPromptDetail> {
  const response = await fetch(`${API_BASE_URL}/ai/prompts/${encodeURIComponent(fileName)}/question`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to update prompt question"));
  }

  return (await response.json()) as AiPromptDetail;
}

export async function deleteAiPrompt(fileName: string): Promise<{ deleted: true }> {
  const response = await fetch(`${API_BASE_URL}/ai/prompts/${encodeURIComponent(fileName)}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    throw new Error(await parseErrorMessage(response, "Failed to delete prompt file"));
  }

  return (await response.json()) as { deleted: true };
}
