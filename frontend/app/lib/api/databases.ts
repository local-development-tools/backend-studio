import { API_BASE_URL } from "~/lib/api/config";

export interface Table {
  name: string;
  rowCount: number;
}

export interface QueryResult {
  data: Record<string, unknown>[];
  rowCount: number;
}

export interface TableSchemaResponse {
  columns: Array<{ column_name: string; data_type: string }>;
  primaryKey: string;
}

export interface EditRecordDto {
  table: string;
  values: Record<string, unknown>;
  where: Record<string, unknown>;
  returning?: string[];
}

export type CloneSslMode =
  | "disable"
  | "allow"
  | "prefer"
  | "require"
  | "verify-ca"
  | "verify-full";

export interface CloneDatabasePayload {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  dbname?: string;
  sslmode?: CloneSslMode;
}

export interface CloneDatabaseResponse {
  sourceDatabase?: string;
  localDatabase?: string;
  connected?: boolean;
}

interface BackendQueryResponse {
  rows?: Record<string, unknown>[];
  rowCount?: number;
  data?: Record<string, unknown>[];
}

export async function query(queryText: string, params?: unknown[], schema?: string): Promise<QueryResult> {
  const res = await fetch(`${API_BASE_URL}/databases/query`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query: queryText, params, schema }),
  });

  if (!res.ok) {
    throw new Error(`Failed to run query: ${res.status}`);
  }

  const payload = (await res.json()) as BackendQueryResponse;
  const rows = payload.rows ?? payload.data ?? [];
  const rowCount = payload.rowCount ?? rows.length;

  return { data: rows, rowCount };
}

export async function editRecord(payload: EditRecordDto): Promise<{ rowCount: number }> {
  const res = await fetch(`${API_BASE_URL}/databases/records`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Failed to edit record: ${res.status}`);
  }

  const data = (await res.json()) as { rowCount?: number };
  return { rowCount: data.rowCount ?? 0 };
}

export async function getDatabases(): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/databases`);
  if (!res.ok) {
    throw new Error(`Failed to load databases: ${res.status}`);
  }

  const payload = (await res.json()) as BackendQueryResponse;
  const rows = payload.rows ?? [];

  return rows
    .map((row) => String((row.datname ?? "").toString()))
    .filter((name) => name.length > 0);
}

export async function getSchemas(database: string): Promise<string[]> {
  const res = await fetch(`${API_BASE_URL}/databases/${encodeURIComponent(database)}/schemas`);
  if (!res.ok) {
    throw new Error(`Failed to load schemas: ${res.status}`);
  }

  const payload = (await res.json()) as BackendQueryResponse;
  const rows = payload.rows ?? [];

  return rows
    .map((row) => String((row.schema_name ?? "").toString()))
    .filter((name) => name.length > 0);
}

export async function getTables(database: string, schema = "public"): Promise<Table[]> {
  const url = new URL(`${API_BASE_URL}/databases/${encodeURIComponent(database)}/tables`);
  url.searchParams.set("schema", schema);
  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load tables: ${res.status}`);
  }

  const payload = (await res.json()) as BackendQueryResponse;
  const rows = payload.rows ?? [];

  return rows
    .map((row) => {
      const tableName = row.table_name;
      if (!tableName) return null;

      return {
        name: String(tableName),
        rowCount: 0,
      } as Table;
    })
    .filter((table): table is Table => table !== null);
}

export async function getTableEnumValues(
  database: string,
  table: string,
  schema = "public",
): Promise<Record<string, string[]>> {
  const url = new URL(
    `${API_BASE_URL}/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/enum-values`,
  );
  url.searchParams.set("schema", schema);

  const res = await fetch(url.toString());
  if (!res.ok) {
    throw new Error(`Failed to load enum values: ${res.status}`);
  }

  const payload = (await res.json()) as BackendQueryResponse;
  const rows = payload.rows ?? [];

  const result: Record<string, string[]> = {};
  for (const row of rows) {
    const columnName = String(row.column_name ?? "");
    const raw = row.enum_values;
    let enumValues: string[];
    if (Array.isArray(raw)) {
      enumValues = raw as string[];
    } else if (typeof raw === "string" && raw.startsWith("{") && raw.endsWith("}")) {
      // pg returns unrecognised array types as the literal "{val1,val2,...}"
      enumValues = raw.slice(1, -1).split(",").filter(Boolean);
    } else {
      enumValues = [];
    }
    if (columnName) {
      result[columnName] = enumValues;
    }
  }
  return result;
}

export async function getTableSchema(
  database: string,
  table: string,
): Promise<TableSchemaResponse> {
  const res = await fetch(
    `${API_BASE_URL}/databases/${encodeURIComponent(database)}/tables/${encodeURIComponent(table)}/schema`,
  );
  if (!res.ok) {
    throw new Error(`Failed to load table schema: ${res.status}`);
  }

  const payload = (await res.json()) as BackendQueryResponse;
  const columns = (payload.rows ?? []) as Array<{ column_name: string; data_type: string }>;

  const hasId = columns.some((column) => column.column_name === "id");
  return {
    columns,
    primaryKey: hasId ? "id" : columns[0]?.column_name ?? "id",
  };
}

export async function getTableRowCounts(
  database: string,
  tableNames: string[],
  schema = "public",
): Promise<Record<string, number>> {
  if (tableNames.length === 0) return {};

  const safeTableNames = tableNames.filter((name) => /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(name));
  if (safeTableNames.length === 0) return {};

  const safeSchema = /^[_a-zA-Z][_a-zA-Z0-9]*$/.test(schema) ? schema : "public";

  const unionQuery = safeTableNames
    .map(
      (name) =>
        `SELECT '${name}'::text AS table_name, COUNT(*)::bigint AS row_count FROM "${safeSchema}"."${name}"`,
    )
    .join(" UNION ALL ");

  const result = await query(unionQuery);

  const counts: Record<string, number> = {};
  for (const row of result.data) {
    const tableName = String(row.table_name ?? "");
    const rowCount = Number(row.row_count ?? 0);
    if (tableName) {
      counts[tableName] = Number.isFinite(rowCount) ? rowCount : 0;
    }
  }

  return counts;
}

export async function cloneDatabaseToLocal(
  payload: CloneDatabasePayload,
): Promise<CloneDatabaseResponse> {
  const res = await fetch(`${API_BASE_URL}/databases/clone-local`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    let details = `Failed to clone database: ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[]; error?: string };
      const message = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      details = message || body.error || details;
    } catch {
      // Keep fallback details string.
    }
    throw new Error(details);
  }

  return (await res.json()) as CloneDatabaseResponse;
}
