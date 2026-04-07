import { Controller, Get, Post, Delete, Param, Body, Patch } from '@nestjs/common';
import { RequestsService } from './requests.service';
import { GrpcReflectionService } from './grpc-reflection.service';
import { CreateHttpRequestDto } from './dto/create-http-request.dto';
import { CreateGrpcRequestDto } from './dto/create-grpc-request.dto';
import { ReflectGrpcDto } from './dto/reflect-grpc.dto';
import { UpdateRequestDto } from './dto/update-request.dto';
import { Request } from './entities/request.entity';
import { RequestHttpService } from './request-http.service';
import { RequestGrpcService } from './request-grpc.service';
import { RunnerService } from './runner.service';

@Controller('')
export class RequestsController {
  constructor(
    private readonly requestsService: RequestsService,
    private readonly grpcReflectionService: GrpcReflectionService,
    private readonly requestHttpService: RequestHttpService,
    private readonly requestGrpcService: RequestGrpcService,
    private readonly runnerService: RunnerService,
  ) {}

  @Get('requests')
  listRootRequests(): Promise<Request[]> {
    return this.requestsService.listRootRequests();
  }

  @Post('http/requests')
  createRootHttpRequest(@Body() createRequestDto: CreateHttpRequestDto): Promise<Request> {
    return this.requestHttpService.createHttpRequest(createRequestDto);
  }

  @Post('grpc/requests')
  createRootGrpcRequest(@Body() createGrpcRequestDto: CreateGrpcRequestDto): Promise<Request> {
    return this.requestGrpcService.createGrpcRequest(createGrpcRequestDto);
  }

  @Post('grpc/reflect')
  reflectGrpcServer(@Body() dto: ReflectGrpcDto) {
    return this.grpcReflectionService.reflect(dto.serverAddress);
  }

  @Get('collections/:collectionId/requests')
  listRequestsByCollection(@Param('collectionId') collectionId: string): Promise<Request[]> {
    return this.requestsService.listRequestsByCollection(collectionId);
  }

  @Post('collections/:collectionId/http/requests')
  createHttpRequestInCollection(
    @Param('collectionId') collectionId: string,
    @Body() createRequestDto: CreateHttpRequestDto,
  ): Promise<Request> {
    return this.requestHttpService.createHttpRequest({
      ...createRequestDto,
      collectionId,
    });
  }

  @Post('collections/:collectionId/grpc/requests')
  createGrpcRequestInCollection(
    @Param('collectionId') collectionId: string,
    @Body() createGrpcRequestDto: CreateGrpcRequestDto,
  ): Promise<Request> {
    return this.requestGrpcService.createGrpcRequest({
      ...createGrpcRequestDto,
      collectionId,
    });
  }

  @Get('folders/:folderId/requests')
  listRequestsByFolder(@Param('folderId') folderId: string): Promise<Request[]> {
    return this.requestsService.listRequestsByFolder(folderId);
  }

  @Post('folders/:folderId/http/requests')
  createHttpRequestInFolder(
    @Param('folderId') folderId: string,
    @Body() createRequestDto: CreateHttpRequestDto,
  ): Promise<Request> {
    return this.requestHttpService.createHttpRequest({
      ...createRequestDto,
      folderId,
    });
  }

  @Post('folders/:folderId/grpc/requests')
  createGrpcRequestInFolder(
    @Param('folderId') folderId: string,
    @Body() createGrpcRequestDto: CreateGrpcRequestDto,
  ): Promise<Request> {
    return this.requestGrpcService.createGrpcRequest({
      ...createGrpcRequestDto,
      folderId,
    });
  }

  @Get('requests/:id')
  getRequestById(@Param('id') id: string): Promise<Request> {
    return this.requestsService.getRequestById(id);
  }

  @Patch('requests/:id')
  updateRequest(@Param('id') id: string, @Body() updateRequestDto: UpdateRequestDto): Promise<Request> {
    return this.requestsService.updateRequest(id, updateRequestDto);
  }

  @Delete('requests/:id')
  deleteRequest(@Param('id') id: string): Promise<void> {
    return this.requestsService.deleteRequest(id);
  }

  @Post('requests/:id/run')
  async runRequest(@Param('id') id: string) {
    const result = await this.runnerService.runRequest(id);
    return [result];
  }

  @Post('folders/:folderId/run')
  runFolder(@Param('folderId') folderId: string) {
    return this.runnerService.runFolder(folderId);
  }

  @Post('collections/:collectionId/run')
  runCollection(@Param('collectionId') collectionId: string) {
    return this.runnerService.runCollection(collectionId);
  }
}
