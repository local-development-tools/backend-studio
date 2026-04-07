// methodColors.ts
import type { HttpMethod } from "~/components/requests/types";

export const METHOD_COLOR_BASE: Record<HttpMethod, string> = {
  "GET": "blue-500",
  "POST": "green-500",
  "PUT": "yellow-500",
  "DELETE": "red-500",
  "PATCH": "teal-500",
} as const;