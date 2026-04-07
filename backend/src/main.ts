import { resolve } from 'node:path';
import * as dotenv from 'dotenv';
import { json, urlencoded } from 'express';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  dotenv.config({ path: resolve(process.cwd(), '.env') });
  dotenv.config({ path: resolve(process.cwd(), 'backend/.env') });
  dotenv.config({ path: resolve(__dirname, '../.env') });

  const app = await NestFactory.create(AppModule);
  const corsOrigin = process.env.CORS_ORIGIN ?? 'http://localhost:5174';
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.use(json({ limit: process.env.BODY_SIZE_LIMIT ?? '2mb' }));
  app.use(urlencoded({ extended: true, limit: process.env.BODY_SIZE_LIMIT ?? '2mb' }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
