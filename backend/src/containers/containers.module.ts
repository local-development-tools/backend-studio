import { Module } from '@nestjs/common';
import { ContainersController } from './containers.controller';
import { ContainersService } from './containers.service';
import { LogFormatterService } from './log-formatter.service';

@Module({
  imports: [],
  controllers: [ContainersController],
  providers: [ContainersService, LogFormatterService],
})
export class ContainersModule {}
