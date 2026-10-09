import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { createApp } from './create-app';
import { CONFIG, type AppConfig } from './config/config';

async function bootstrap() {
  const app = await createApp();
  const config = app.get<AppConfig>(CONFIG);
  app.enableShutdownHooks();
  await app.listen(config.PORT, '0.0.0.0');
  Logger.log(`Wasel API listening on port ${config.PORT}`, 'Bootstrap');
}
void bootstrap();
