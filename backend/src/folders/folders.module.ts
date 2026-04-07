import { Module } from '@nestjs/common';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { FolderStorageService } from './folder-storage.service';
import { FolderRelationsService } from './folder-relations.service';

@Module({
  imports: [],
  controllers: [FoldersController],
  providers: [FoldersService, FolderStorageService, FolderRelationsService],
})
export class FoldersModule {}
