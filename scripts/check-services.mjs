// Read-only checks. Never sends email/WhatsApp or prints provider secrets.
import { config } from 'dotenv';
import { resolve } from 'node:path';
import pg from 'pg';
import nodemailer from 'nodemailer';
config({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
const env = process.env;
let failed = false;
async function check(name, work) {
  try { console.log(`${name}: ${await work()}`); }
  catch { failed = true; console.log(`${name}: unavailable or configuration rejected (credentials omitted)`); }
}
await Promise.all([
  check('PostgreSQL', async () => {
    const client = new pg.Client({ host: env.DB_HOST, port: Number(env.DB_PORT), database: env.DB_NAME, user: env.DB_USER, password: env.DB_PASSWORD, connectionTimeoutMillis: 5000 });
    try { await client.connect(); const result = await client.query("SELECT current_setting('server_version') AS version"); return `version ${result.rows[0].version}`; }
    finally { await client.end().catch(() => {}); }
  }),
  check('OpenWA', async () => {
    const result = await fetch(`${env.OPENWA_URL}/api/sessions`, { headers: { 'X-API-Key': env.OPENWA_API_KEY }, signal: AbortSignal.timeout(8000) });
    if (!result.ok) throw new Error();
    const body = await result.json(); const sessions = Array.isArray(body) ? body : body.data;
    const status = sessions?.find(session => session.name === env.OPENWA_SESSION_NAME)?.status;
    if (status !== 'ready') { failed = true; return 'reachable; run npm run openwa:connect and scan the dashboard QR'; }
    return 'WhatsApp session ready';
  }),
  check('SMTP', async () => {
    const transport = nodemailer.createTransport({ host: env.SMTP_HOST, port: Number(env.SMTP_PORT), secure: env.SMTP_SECURE === 'true', auth: { user: env.SMTP_USER, pass: env.SMTP_PASS }, connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 8000 });
    try { await transport.verify(); return 'connection and authentication accepted; no message sent'; }
    finally { transport.close(); }
  }),
  check('Mapbox static map', async () => {
    const url = new URL('https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/31.2357,30.0444,12,0/200x200');
    url.searchParams.set('access_token', env.MAPBOX_TOKEN);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(); await response.arrayBuffer(); return 'accepted';
  }),
  check('Mapbox permanent geocoding', async () => {
    const url = new URL('https://api.mapbox.com/search/geocode/v6/forward?q=Cairo&country=eg&limit=1&permanent=true&autocomplete=false');
    url.searchParams.set('access_token', env.MAPBOX_TOKEN);
    const response = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!response.ok) throw new Error(); const data = await response.json(); if (!data.features?.length) throw new Error(); return 'accepted';
  }),
]);
if (failed) process.exitCode = 1;
