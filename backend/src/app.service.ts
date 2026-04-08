import { Injectable } from '@nestjs/common';

@Injectable()
export class AppService {
  getHello(): string {
    return 'Hello World! You can find the API documentation at <a href="https://github.com/local-development-tools/backend-studio/blob/main/backend/docs/endpointsList.md" target="_blank">here</a>.';
  }
}
