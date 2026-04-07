import { LmStudioSettingsDto } from './lm-studio-settings.dto';

export class AiSettingsDto {
  openAIApiKey?: string;
  anthropicApiKey?: string;
  lmStudio?: LmStudioSettingsDto;
  aiProvider?: 'openai' | 'anthropic' | 'lmstudio';
  aiModel?: string;
}
