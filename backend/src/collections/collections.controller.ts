import { Body, Controller, Delete, Get, Param, Patch, Post, UploadedFiles, UseInterceptors, Res } from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CollectionsService } from './collections.service';
import { CreateCollectionDto } from './dto/create-collection.dto';
import { UpdateCollectionDto } from './dto/update-collection.dto';
import { Collection } from './entities/collection.entity';
import { ImportedCollectionTree } from './entities/import-result.entity';

@Controller('collections')
export class CollectionsController {
  constructor(private readonly collectionsService: CollectionsService) {}

  @Get()
  getCollections(): Promise<Collection[]> {
    return this.collectionsService.getCollections();
  }

  @Post()
  createCollection(@Body() createCollectionDto: CreateCollectionDto): Promise<Collection> {
    return this.collectionsService.createCollection(createCollectionDto);
  }

  @Post('import')
  @UseInterceptors(AnyFilesInterceptor())
  importCollection(
    @UploadedFiles() files: Express.Multer.File[],
    @Body() body: { paths?: string | string[]; collectionName?: string },
  ): Promise<ImportedCollectionTree> {
    return this.collectionsService.importCollection({
      files: files ?? [],
      paths: body?.paths,
      collectionName: body?.collectionName,
    });
  }

  @Get(':id')
  getCollectionById(@Param('id') id: string): Promise<Collection> {
    return this.collectionsService.getCollectionById(id);
  }

  @Get(':id/export')
  async exportCollection(@Param('id') id: string, @Res() res: Response): Promise<void> {
    const zip = await this.collectionsService.exportCollectionZip(id);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zip.fileName}"`);
    res.send(zip.buffer);
  }

  @Patch(':id')
  updateCollection(@Param('id') id: string, @Body() updateCollectionDto: UpdateCollectionDto): Promise<Collection> {
    return this.collectionsService.updateCollection(id, updateCollectionDto);
  }

  @Delete(':id')
  deleteCollection(@Param('id') id: string): Promise<void> {
    return this.collectionsService.deleteCollection(id);
  }
}
