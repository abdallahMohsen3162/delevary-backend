import { loadConfig } from '../config/config';
import { databaseOptions } from '../database/data-source';

const original = { ...process.env };

beforeEach(() => {
  process.env = {
    ...original,
    NODE_ENV: 'production',
    DB_PASSWORD: 'test-database-password',
    JWT_SECRET: 'test-jwt-secret-with-at-least-32-characters',
    MESSAGE_ENCRYPTION_KEY: 'ab'.repeat(32),
    OPENWA_URL: 'http://127.0.0.1:2785',
    OPENWA_API_KEY: 'test-openwa-key-with-at-least-32-characters',
    MAPBOX_TOKEN: 'test-map-token',
    SMTP_HOST: 'smtp.example.com',
    SMTP_USER: 'test@example.com',
    SMTP_PASS: 'test-password',
    SMTP_FROM: 'test@example.com',
  };
});

afterEach(() => { process.env = { ...original }; });

test('production startup leaves schema changes disabled when the setting is absent', () => {
  delete process.env.DB_SYNCHRONIZE;
  const options = databaseOptions(loadConfig());
  expect(options.synchronize).toBe(false);
  expect(options.migrationsRun).toBe(false);
});

test('the string false does not enable database synchronization', () => {
  process.env.DB_SYNCHRONIZE = 'false';
  expect(databaseOptions(loadConfig()).synchronize).toBe(false);
  process.env.DB_SYNCHRONIZE = 'true';
  expect(databaseOptions(loadConfig()).synchronize).toBe(true);
});

test('invalid synchronization settings fail configuration validation', () => {
  process.env.DB_SYNCHRONIZE = 'yes';
  expect(() => loadConfig()).toThrow('DB_SYNCHRONIZE');
});
