
export interface ContainerLog {
  type: "simple" | "complex" | "group";
  message: string | Record<string, any> | string[];
  level: "error" | "warn" | "info" | "debug" | "trace" | "fatal" | "unknown";
  std: "stdout" | "stderr";
  timestamp: number;
  raw: string;
}

export function parseSSELog(rawJson: string): ContainerLog {
  try {
    const raw = JSON.parse(rawJson);

    return {
      type: raw.t,
      message: raw.m,
      level: raw.l,
      std: raw.s,
      timestamp: raw.ts,
      raw: raw.rm,
    };
  } catch (err) {
    console.error("Failed to parse SSE log:", err, rawJson);
    throw err; // optionally rethrow or return a fallback
  }
}