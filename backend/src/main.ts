import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.enableCors({
    origin: (process.env.API_CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    credentials: true,
  });

  const config = new DocumentBuilder()
    .setTitle('Relève API')
    .setDescription("API de la plateforme d'interim aide a domicile")
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));

  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`API : http://localhost:${port}/api`);
  logger.log(`Doc : http://localhost:${port}/api/docs`);
}

void bootstrap();
