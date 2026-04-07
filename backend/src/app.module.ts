import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ContainersModule } from './containers/containers.module';
import { CollectionsModule } from './collections/collections.module';
import { DatabasesModule } from './databases/databases.module';
import { FoldersModule } from './folders/folders.module';
import { SettingsModule } from './settings/settings.module';
import { RequestsModule } from './requests/requests.module';
import { AiModule } from './ai/ai.module';
import { PubSubModule } from './pubsub/pubsub.module';

@Module({
  imports: [
    ContainersModule,
    CollectionsModule,
    DatabasesModule,
    FoldersModule,
    SettingsModule,
    RequestsModule,
    AiModule,
    PubSubModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
