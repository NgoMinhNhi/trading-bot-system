import { NestFactory } from '@nestjs/core';
import {
  ValidationPipe,
  BadRequestException,
  VersioningType,
  Logger,
} from '@nestjs/common';
import { AppModule } from './app.module';
import { ValidationError } from 'class-validator';
import { getFirstValidateMsg } from './utils/getFirstValidateMsg.helper';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as bodyParser from 'body-parser';
import * as express from 'express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { HttpExceptionFilter } from './filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  const PORT = process.env.PORT || 3000;

  // Enable CORS
  app.enableCors({
    origin: '*',
    allowedHeaders: '*',
    methods: '*',
  });

  // Body parser for large payloads
  app.use(bodyParser.json({ limit: '25mb' }));
  app.use(bodyParser.urlencoded({ extended: true, limit: '25mb' }));

  // Static folders
  app.use('/uploads', express.static('uploads'));
  app.use('/public', express.static('public'));
  app.use('/exports', express.static('exports'));

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      exceptionFactory: (errors: ValidationError[]) => {
        return new BadRequestException(getFirstValidateMsg(errors));
      },
      whitelist: true,
      transform: true,
      stopAtFirstError: true,
    }),
  );

  // Global exception filter
  app.useGlobalFilters(new HttpExceptionFilter());

  // Prefix + Versioning
  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });

  // Swagger (only for non-production)
  if (process.env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('Video Bot API')
      .setDescription('Auto Video Bot Telegram x GPT x RunwayML')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const doc = SwaggerModule.createDocument(app, config);

    // 👉 Swagger path MUST include prefix + version
    SwaggerModule.setup('api/v1/api-docs', app, doc);
  }

  await app.listen(PORT);
  Logger.log(`🚀 Server running at: http://localhost:${PORT}`);
  Logger.log(`📚 Swagger docs at: http://localhost:${PORT}/api/v1/api-docs`);
}

bootstrap();
