import { Module } from '@nestjs/common';
import { PubSubController } from './pubsub.controller';
import { PubSubService } from './pubsub.service';

@Module({
  controllers: [PubSubController],
  providers: [PubSubService],
})
export class PubSubModule {}
