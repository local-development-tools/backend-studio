export class EditRecordDto {
  table: string;
  schema?: string;
  values: Record<string, unknown>;
  where: Record<string, unknown>;
  returning?: string[];
}
