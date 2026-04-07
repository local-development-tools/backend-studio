import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { PubSubService } from './pubsub.service';

@Controller('pubsub')
export class PubSubController {
  constructor(private readonly pubSubService: PubSubService) {}

  @Get('topics')
  listTopics() {
    return this.pubSubService.listTopics();
  }

  @Get('subscriptions')
  listSubscriptions() {
    return this.pubSubService.listSubscriptions();
  }

  @Post('subscriptions/:name/pull')
  pullMessages(@Param('name') name: string, @Body() body: { maxMessages?: number }) {
    return this.pubSubService.pullMessages(name, body.maxMessages ?? 10);
  }
}
