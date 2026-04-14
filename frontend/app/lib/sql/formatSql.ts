import { format } from "sql-formatter";

export const formatSql = (sql: string): string => {
  const trimmed = sql.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    return format(trimmed, { language: "postgresql" }).trim();
  } catch {
    return trimmed;
  }
};
