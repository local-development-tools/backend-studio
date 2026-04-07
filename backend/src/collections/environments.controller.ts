import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { EnvironmentsService } from './environments.service';
import { EnvironmentDto } from './entities/environment.entity';
import { CreateEnvironmentDto } from './dto/create-environment.dto';
import { UpdateEnvironmentDto } from './dto/update-environment.dto';
import { SetActiveEnvironmentDto } from './dto/set-active-environment.dto';

@Controller('collections/:collectionId/environments')
export class EnvironmentsController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Get()
  list(@Param('collectionId') collectionId: string): Promise<EnvironmentDto[]> {
    return this.environmentsService.listEnvironments(collectionId);
  }

  @Post()
  create(@Param('collectionId') collectionId: string, @Body() dto: CreateEnvironmentDto): Promise<EnvironmentDto> {
    return this.environmentsService.createEnvironment(collectionId, dto.name, dto.vars ?? {});
  }

  @Get(':name')
  getOne(@Param('collectionId') collectionId: string, @Param('name') name: string): Promise<EnvironmentDto> {
    return this.environmentsService.getEnvironment(collectionId, name);
  }

  @Patch(':name')
  update(
    @Param('collectionId') collectionId: string,
    @Param('name') name: string,
    @Body() dto: UpdateEnvironmentDto,
  ): Promise<EnvironmentDto> {
    return this.environmentsService.updateEnvironment(collectionId, name, dto.vars, dto.newName);
  }

  @Delete(':name')
  remove(@Param('collectionId') collectionId: string, @Param('name') name: string): Promise<void> {
    return this.environmentsService.deleteEnvironment(collectionId, name);
  }
}

@Controller('collections/:collectionId/active-environment')
export class ActiveEnvironmentController {
  constructor(private readonly environmentsService: EnvironmentsService) {}

  @Patch()
  setActive(@Param('collectionId') collectionId: string, @Body() dto: SetActiveEnvironmentDto): Promise<void> {
    return this.environmentsService.setActiveEnvironment(collectionId, dto.name);
  }
}
