import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { CONFIG, type AppConfig } from './config/config';

export async function createApp(quiet = false) {
  const app = await NestFactory.create(AppModule, {
    bodyParser: true,
    abortOnError: false,
    ...(quiet ? { logger: false as const } : {}),
  });
  const config = app.get<AppConfig>(CONFIG);
  app.use(helmet());
  app.enableCors({
    origin: config.CORS_ORIGINS.trim() === '*'
      ? '*'
      : config.CORS_ORIGINS.split(',').map(origin => origin.trim()).filter(Boolean),
    credentials: false,
  });
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      validationError: { target: false, value: false },
    }),
  );
  return app;
}
