export interface DatabaseConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  passwordSet?: boolean;
}

export interface DatabaseConnectionProfile {
  id: string;
  name: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password?: string;
  passwordSet?: boolean;
}

const randomPart = () => Math.random().toString(36).slice(2, 8);

export const createConnectionId = () => `conn_${Date.now()}_${randomPart()}`;

export const getConnectionDisplayName = (connection: Pick<DatabaseConnectionProfile, "name" | "host" | "database">) => {
  const trimmedName = connection.name.trim();
  if (trimmedName) {
    return trimmedName;
  }
  const host = connection.host || "localhost";
  const db = connection.database || "postgres";
  return `${host} / ${db}`;
};

export const upsertDatabaseConnection = (
  connections: DatabaseConnectionProfile[],
  nextConnection: DatabaseConnectionProfile,
): DatabaseConnectionProfile[] => {
  const index = connections.findIndex((connection) => connection.id === nextConnection.id);
  if (index === -1) {
    return [...connections, nextConnection];
  }

  const next = [...connections];
  next[index] = nextConnection;
  return next;
};
