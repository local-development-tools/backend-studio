export class EditRecordDto {
  table: string;
  values: Record<string, unknown>;
  where: Record<string, unknown>;
  returning?: string[];
}
