import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './dto/create-folder.dto';
import { UpdateFolderDto } from './dto/update-folder.dto';
import { Folder } from './entities/folder.entity';

@Controller()
export class FoldersController {
  constructor(private readonly foldersService: FoldersService) {}

  @Post('folders')
  createRootFolder(@Body() createFolderDto: CreateFolderDto): Promise<Folder> {
    return this.foldersService.createRootFolder(createFolderDto);
  }

  @Get('collections/:collectionId/folders')
  getFoldersByCollection(@Param('collectionId') collectionId: string): Promise<Folder[]> {
    return this.foldersService.getFoldersByCollection(collectionId);
  }

  @Get('folders/:id')
  getFolderById(@Param('id') id: string): Promise<Folder> {
    return this.foldersService.getFolderById(id);
  }

  @Get('folders/:folderId/folders')
  getFoldersByFolder(@Param('folderId') folderId: string): Promise<Folder[]> {
    return this.foldersService.getFoldersByFolder(folderId);
  }

  @Post('collections/:collectionId/folders')
  createFolderInCollection(
    @Param('collectionId') collectionId: string,
    @Body() createFolderDto: CreateFolderDto,
  ): Promise<Folder> {
    return this.foldersService.createFolderInCollection(collectionId, createFolderDto);
  }

  @Post('folders/:folderId/folders')
  createFolderInFolder(@Param('folderId') folderId: string, @Body() createFolderDto: CreateFolderDto): Promise<Folder> {
    return this.foldersService.createFolderInFolder(folderId, createFolderDto);
  }

  @Patch('folders/:id')
  updateFolder(@Param('id') id: string, @Body() updateFolderDto: UpdateFolderDto): Promise<Folder> {
    return this.foldersService.updateFolder(id, updateFolderDto);
  }

  @Delete('folders/:id')
  deleteFolder(@Param('id') id: string): Promise<void> {
    return this.foldersService.deleteFolder(id);
  }
}
