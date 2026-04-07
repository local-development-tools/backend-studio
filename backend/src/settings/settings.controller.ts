import { Controller, Post, Body, Get, Delete, Patch } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { DatabaseSettingsDto } from './dto/database-settings.dto';
import { AiSettingsDto } from './dto/ai-settings.dto';
class MicroservicesRootDto {
  path: string;
}

@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get('db')
  getDatabaseSettings() {
    return this.settingsService.getDatabaseSettings();
  }

  @Post('db')
  upsertDatabaseSettings(@Body() settingsDto: DatabaseSettingsDto) {
    return this.settingsService.upsertDatabaseSettings(settingsDto);
  }

  @Patch('db')
  updateDatabaseSettings(@Body() settingsDto: DatabaseSettingsDto) {
    return this.settingsService.updateDatabaseSettings(settingsDto);
  }

  @Delete('db')
  clearDatabaseSettings() {
    return this.settingsService.clearDatabaseSettings();
  }

  @Get('ai')
  getAiSettings() {
    return this.settingsService.getAiSettings();
  }

  @Post('ai')
  upsertAiSettings(@Body() settingsDto: AiSettingsDto) {
    return this.settingsService.upsertAiSettings(settingsDto);
  }

  @Patch('ai')
  updateAiSettings(@Body() settingsDto: AiSettingsDto) {
    return this.settingsService.updateAiSettings(settingsDto);
  }

  @Delete('ai')
  clearAiSettings() {
    return this.settingsService.clearAiSettings();
  }

  @Get('microservices-root')
  getMicroservicesRoot() {
    return this.settingsService.getMicroservicesRoot();
  }

  @Patch('microservices-root')
  setMicroservicesRoot(@Body() dto: MicroservicesRootDto) {
    return this.settingsService.setMicroservicesRoot(dto.path);
  }
}
