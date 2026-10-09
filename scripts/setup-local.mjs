import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const file = resolve(root, '.env');
if (existsSync(file)) { console.log('Local .env already exists; no values changed.'); process.exit(0); }
const entries = {};
const smtpFile = resolve(root, 'env/emails.txt');
if (existsSync(smtpFile)) for (const line of readFileSync(smtpFile, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^\s*(SMTP_[A-Z_]+)\s*=\s*(.*?)\s*$/);
  if (match) entries[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
}
const mapFile = resolve(root, 'env/mapbox token.txt');
const mapToken = existsSync(mapFile) ? readFileSync(mapFile, 'utf8').match(/(?:pk|sk)\.[A-Za-z0-9._-]+/)?.[0] || '' : '';
const settings = {
  NODE_ENV: 'development', POSTGRES_IMAGE: 'postgres:17', PORT: '3000', DB_HOST: '127.0.0.1', DB_PORT: '5433', DB_NAME: 'wasel', DB_USER: 'wasel',
  DB_PASSWORD: randomBytes(24).toString('hex'), DB_SYNCHRONIZE: 'true',
  JWT_SECRET: randomBytes(48).toString('hex'),
  MESSAGE_ENCRYPTION_KEY: randomBytes(32).toString('hex'),
  OPENWA_URL: 'http://127.0.0.1:2785', OPENWA_API_KEY: randomBytes(32).toString('hex'), OPENWA_SESSION_NAME: 'wasel',
  CORS_ORIGINS: 'http://localhost:8081,http://127.0.0.1:8081,http://localhost:8090,http://127.0.0.1:8090,http://localhost:8091,http://127.0.0.1:8091',
  MAPBOX_TOKEN: mapToken, ...entries, SMTP_FROM: entries.SMTP_USER || '',
};
writeFileSync(file, Object.entries(settings).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + '\n', { mode: 0o600, flag: 'wx' });
console.log('Created ignored .env with random local secrets and private SMTP/Mapbox configuration. No secrets printed.');
