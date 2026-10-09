import 'reflect-metadata';
import { TokenTripWorkflows1791700000000 } from './migrations/token-trip-workflows';
import { DataSource, type DataSourceOptions } from 'typeorm';
import { loadConfig, type AppConfig } from '../config/config';
import { entities } from './entities';
import { InitialSchema1791490000000 } from './migrations/initial-schema';
import { VerificationRename1791600000000 } from './migrations/verification-rename';
export function databaseOptions(config: AppConfig): DataSourceOptions {
  return {
    type: 'postgres',
    host: config.DB_HOST,
    port: config.DB_PORT,
    username: config.DB_USER,
    password: config.DB_PASSWORD,
    database: config.DB_NAME,
    entities,
    synchronize: config.DB_SYNCHRONIZE === 'true',
    migrations: [
      InitialSchema1791490000000,
      VerificationRename1791600000000,
      TokenTripWorkflows1791700000000,
    ],
    migrationsRun: false,
    logging: false,
    extra: {
      max: 10,
      connectionTimeoutMillis: 5000,
      statement_timeout: 15_000,
    },
  };
}
export default new DataSource(databaseOptions(loadConfig()));
