export class CreateEnvironmentDto {
  name: string;
  vars?: Record<string, string>;
}
