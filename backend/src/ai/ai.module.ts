import { Module } from '@nestjs/common';
import { AiService } from './ai.service';
import { AiController } from './ai.controller';
import { DatabasesModule } from 'src/databases/databases.module';
import { LmStudioService } from './lmstudio.service';

@Module({
  imports: [DatabasesModule],
  controllers: [AiController],
  providers: [AiService, LmStudioService],
})
export class AiModule {}
