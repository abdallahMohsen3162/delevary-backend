import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as dotenv } from 'dotenv';
dotenv({ path: resolve(import.meta.dirname, '../.env'), quiet: true });
const base = process.env.OPENWA_URL || 'http://127.0.0.1:2785';
const name = process.env.OPENWA_SESSION_NAME || 'wasel';
async function request(path, method = 'GET', body) {
  const response = await fetch(`${base}/api${path}`, { method, signal: AbortSignal.timeout(60_000), headers: { 'X-API-Key': process.env.OPENWA_API_KEY, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`OpenWA request ${path} failed (${response.status}). Check that its build is complete and the API key matches.`);
  return response.json();
}
try {
  const listed = await request('/sessions');
  const sessions = Array.isArray(listed) ? listed : listed.data || [];
  let session = sessions.find(item => item.name === name);
  if (!session) { const created = await request('/sessions', 'POST', { name }); session = created.data || created; }
  if (session.status !== 'connected' && session.status !== 'ready' && session.status !== 'WORKING') await request(`/sessions/${session.id}/start`, 'POST');
  console.log(`OpenWA session '${name}' is configured. Open ${base} and link WhatsApp by scanning its QR code.`);
  console.log('The dashboard API key is OPENWA_API_KEY in your ignored .env file. Do not paste it into chat.');
  try {
    const result = await request(`/sessions/${session.id}/qr`);
    const qr = result.data?.qr || result.qr || result.data?.qrCode || result.qrCode;
    if (typeof qr === 'string' && qr.startsWith('data:image/png;base64,')) {
      const dir = resolve(import.meta.dirname, '../.artifacts'); mkdirSync(dir, { recursive: true });
      writeFileSync(resolve(dir, 'openwa-qr.png'), Buffer.from(qr.split(',')[1], 'base64'));
      console.log('QR saved privately to .artifacts/openwa-qr.png.');
    }
  } catch { console.log('QR may still be initializing; use the dashboard to check connection status.'); }
} catch (error) { console.error(error.message); process.exitCode = 1; }
