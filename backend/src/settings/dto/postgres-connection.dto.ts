export class PostgresConnectionDto {
  declare host: string;
  declare port: number;
  declare username: string;
  declare password: string;
  declare database: string;
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
}
