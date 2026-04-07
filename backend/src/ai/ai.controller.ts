import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { AIProvider, AiService } from './ai.service';
import { LmStudioService } from './lmstudio.service';

@Controller('ai')
export class AiController {
  constructor(
    private readonly aiService: AiService,
    private readonly lmStudioService: LmStudioService,
  ) {}

  @Get('models')
  async listModels() {
    return this.aiService.listProviderModels();
  }

  @Post()
  async generate(
    @Body()
    body: {
      prompt: string;
      model?: string;
      provider?: AIProvider;
    },
  ) {
    return this.aiService.generateText(body.prompt, body.model, body.provider);
  }

  @Post('sql')
  async generateSql(
    @Body()
    body: {
      question: string;
      schema?: string;
      provider?: AIProvider;
      model?: string;
    },
  ) {
    return this.aiService.generateSql(body);
  }

  @Post('logs')
  async analyzeLogs(
    @Body()
    body: {
      logs: string | Array<string | Record<string, unknown>>;
      provider?: AIProvider;
      model?: string;
    },
  ) {
    return this.aiService.analyzeLogs(body);
  }

  @Get('prompts')
  async listPrompts() {
    return this.aiService.listPromptLogs();
  }

  @Get('prompts/:fileName')
  async getPromptByFileName(@Param('fileName') fileName: string) {
    return this.aiService.getPromptLog(fileName);
  }

  @Post('prompts/sql')
  async saveSqlPrompt(
    @Body()
    body: {
      sql: string;
      title?: string;
      question?: string;
    },
  ) {
    return this.aiService.saveSqlPrompt(body);
  }

  @Patch('prompts/:fileName/question')
  async updatePromptQuestion(
    @Param('fileName') fileName: string,
    @Body()
    body: {
      question: string;
    },
  ) {
    return this.aiService.updatePromptQuestion(fileName, body.question);
  }

  @Delete('prompts/:fileName')
  async deletePrompt(@Param('fileName') fileName: string) {
    return this.aiService.deletePromptLog(fileName);
  }

  @Get('lmstudio/status')
  async lmStudioStatus() {
    return this.lmStudioService.getServerStatus();
  }

  @Get('lmstudio/models/loaded')
  async lmStudioLoadedModels() {
    return this.lmStudioService.listLoadedModels();
  }
}
