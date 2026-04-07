import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { DatabasesService } from './databases.service';
import { CreateBackupDto } from './dto/create-backup.dto';
import { EditRecordDto } from './dto/edit-record.dto';

@Controller('databases')
export class DatabasesController {
  constructor(private readonly databasesService: DatabasesService) {}

  @Post('query')
  async query(@Body() body: { query: string; params?: any[]; schema?: string }): Promise<any> {
    return await this.databasesService.query(body.query, body.params, body.schema);
  }

  @Patch('records')
  async editRecord(@Body() body: EditRecordDto): Promise<any> {
    return await this.databasesService.editRecord(body);
  }

  @Get('')
  async getDatabases(): Promise<any> {
    return await this.databasesService.getDatabases();
  }

  @Get(':database/schemas')
  async getSchemas(@Param('database') database: string): Promise<any> {
    return await this.databasesService.getSchemas(database);
  }

  @Get(':database/tables')
  async getTables(@Param('database') database: string, @Query('schema') schema?: string): Promise<any> {
    return await this.databasesService.getTables(database, schema);
  }

  @Get(':database/tables/:table/enum-values')
  async getTableEnumColumns(
    @Param('database') database: string,
    @Param('table') table: string,
    @Query('schema') schema?: string,
  ): Promise<any> {
    return await this.databasesService.getTableEnumColumns(database, table, schema);
  }

  @Get(':database/tables/:table/schema')
  async getTableSchema(@Param('database') database: string, @Param('table') table: string): Promise<any> {
    return await this.databasesService.getTableSchema(database, table);
  }

  @Post('clone-local')
  async cloneDatabaseToLocal(@Body() body: CreateBackupDto): Promise<any> {
    return await this.databasesService.createBackup(body);
  }
}
