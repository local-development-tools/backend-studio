import { Module } from '@nestjs/common';
import { CollectionsController } from './collections.controller';
import { CollectionsService } from './collections.service';
import { CollectionImportService } from './collection-import.service';
import { CollectionExportService } from './collection-export.service';
import { EnvironmentsService } from './environments.service';
import { EnvironmentsController, ActiveEnvironmentController } from './environments.controller';

@Module({
  imports: [],
  controllers: [CollectionsController, EnvironmentsController, ActiveEnvironmentController],
  providers: [CollectionsService, CollectionImportService, CollectionExportService, EnvironmentsService],
})
export class CollectionsModule {}
