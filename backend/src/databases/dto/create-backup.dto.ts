export class CreateBackupDto {
  host: string;
  port?: number;
  user?: string;
  password?: string;
  dbname?: string;
  sslmode?: 'disable' | 'allow' | 'prefer' | 'require' | 'verify-ca' | 'verify-full';
}
