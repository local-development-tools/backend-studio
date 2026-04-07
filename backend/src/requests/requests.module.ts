import { Module } from '@nestjs/common';
import { RequestsController } from './requests.controller';
import { RequestsService } from './requests.service';
import { GrpcReflectionService } from './grpc-reflection.service';
import { RequestBruService } from './request-bru.service';
import { RequestHttpService } from './request-http.service';
import { RequestGrpcService } from './request-grpc.service';
import { RunnerService } from './runner.service';

@Module({
  imports: [],
  controllers: [RequestsController],
  providers: [
    RequestsService,
    GrpcReflectionService,
    RequestBruService,
    RequestHttpService,
    RequestGrpcService,
    RunnerService,
  ],
})
export class RequestsModule {}
