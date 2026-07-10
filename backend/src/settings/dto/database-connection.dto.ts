export class DatabaseConnectionDto {
  id!: string;
  name!: string;
  host!: string;
  port!: number;
  username!: string;
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  password?: string;
  database!: string;
}

export class DatabaseConnectionUpsertDto {
  id!: string;
  name!: string;
  host!: string;
  port!: number;
  username!: string;
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
  password?: string;
  database!: string;
}

export class ActiveDatabaseConnectionDto {
  id!: string;
}
