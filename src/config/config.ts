import { Global, Module } from '@nestjs/common';
import { config as dotenv } from 'dotenv';
import { resolve } from 'node:path';
import { z } from 'zod';

dotenv({ path: resolve(__dirname, '../../.env'), quiet: true });
const schema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DB_HOST: z.string().default('127.0.0.1'),
  DB_PORT: z.coerce.number().default(5433),
  DB_NAME: z.string().default('wasel'),
  DB_USER: z.string().default('wasel'),
  DB_PASSWORD: z.string().min(12),
  DB_SYNCHRONIZE: z.enum(['true', 'false']).default('false'),
  JWT_SECRET: z.string().min(32),
  MESSAGE_ENCRYPTION_KEY: z.string().regex(/^[a-f0-9]{64}$/i),
  OPENWA_URL: z.string().url(),
  OPENWA_API_KEY: z.string().min(32),
  OPENWA_SESSION_NAME: z.string().default('wasel'),
  MAPBOX_TOKEN: z.string().min(1),
  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().default(587),
  SMTP_SECURE: z.enum(['true', 'false']).default('false'),
  SMTP_USER: z.string().min(1),
  SMTP_PASS: z.string().min(1),
  SMTP_FROM: z.string().min(1),
  CORS_ORIGINS: z.string().default('http://localhost:8090'),
  NOTIFICATIONS_API_KEY: z.union([z.literal(''), z.string().min(32)]).default(''),
  FIREBASE_PROJECT_ID: z.string().default(''),
  FIREBASE_CLIENT_EMAIL: z.string().default(''),
  FIREBASE_PRIVATE_KEY: z.string().default(''),
});
export type AppConfig = z.infer<typeof schema>;
export const CONFIG = Symbol('CONFIG');
export function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success)
    throw new Error(
      `Invalid configuration keys: ${parsed.error.issues.map((issue) => issue.path.join('.')).join(', ')}`,
    );
  return parsed.data;
}
@Global()
@Module({
  providers: [{ provide: CONFIG, useFactory: loadConfig }],
  exports: [CONFIG],
})
export class ConfigurationModule {}
