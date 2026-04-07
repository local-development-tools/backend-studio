export class UpdateEnvironmentDto {
  vars: Record<string, string>;
  newName?: string;
}
