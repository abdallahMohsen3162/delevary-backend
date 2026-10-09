// Explicit integration command only. Creates its own empty database and removes ONLY that database.
// Messaging worker is disabled; OTPs are read from the encrypted test outbox, never sent externally.
import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { DataSource } from 'typeorm';
import { loadConfig } from '../config/config';
import { decryptMessage } from '../modules/auth/crypto';
import { createApp } from '../create-app';
import { JwtService } from '@nestjs/jwt';
import { MapsService } from '../modules/maps/maps.service';
import type { INestApplication } from '@nestjs/common';

type TokenView = {
  access_token: string;
  needsLocation: boolean;
  user: { id: string; accountVerified: boolean };
};
type ChallengeView = { challengeId: string };
type NearbyView = { distanceMeters: number }[];

export async function runIntegration() {
  const original = loadConfig();
  const name = `wasel_it_${randomBytes(8).toString('hex')}`;
  const admin = new Client({
    host: original.DB_HOST,
    port: original.DB_PORT,
    user: original.DB_USER,
    password: original.DB_PASSWORD,
    database: original.DB_NAME,
    connectionTimeoutMillis: 5000,
  });
  let created = false;
  let app: INestApplication | undefined;
  try {
    await admin.connect();
    const version = await admin.query<{ version: number }>(
      "SELECT current_setting('server_version_num')::int AS version",
    );
    assert.equal(
      Math.floor(version.rows[0].version / 10000),
      17,
      'Integration target must be PostgreSQL 17',
    );
    await admin.query(`CREATE DATABASE "${name}"`);
    created = true;
    process.env.DB_NAME = name;
    process.env.DB_SYNCHRONIZE = 'false';
    process.env.NODE_ENV = 'test';
    app = await createApp(true);
    await app.listen(0, '127.0.0.1');
    const base = `${await app.getUrl()}/api/v1`;
    const db = app.get(DataSource);
    // Exercise the local development synchronize path against the migrated schema too.
    await db.synchronize();
    app.get(MapsService).route = () =>
      Promise.resolve({
        distance: 2100,
        duration: 600,
        geometry: {
          type: 'LineString',
          coordinates: [
            [31.2357, 30.0444],
            [31.24, 30.06],
          ],
        },
      });
    async function call<T = unknown>(
      path: string,
      body?: object,
      token?: string,
      method = 'POST',
      expected = 200,
    ) {
      const response = await fetch(`${base}${path}`, {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      assert.equal(response.status, expected, `${method} ${path} status`);
      return response.json() as Promise<T>;
    }
    async function code(id: string) {
      const rows = await db.query<{ payload_ciphertext: string }[]>(
        'SELECT payload_ciphertext FROM message_jobs WHERE challenge_id=$1',
        [id],
      );
      assert.equal(rows.length, 1, 'one encrypted delivery job');
      const message = JSON.parse(
        decryptMessage(
          rows[0].payload_ciphertext,
          original.MESSAGE_ENCRYPTION_KEY,
        ),
      ) as { text: string };
      const match = message.text.match(/\b\d{6}\b/);
      assert.ok(match);
      return match[0];
    }
    async function ageChallenges(userId: string) {
      await db.query(
        "UPDATE auth_verifications SET created_at=now()-interval '61 minutes' WHERE user_id=$1",
        [userId],
      );
    }
    const password = 'integration-password-123';
    const signup = await call<ChallengeView>(
      '/customers/auth/register',
      {
        fullName: 'Test Customer',
        phone: '01012345678',
        email: 'customer@example.invalid',
        password,
      },
      undefined,
      'POST',
      201,
    );
    await call(
      '/riders/auth/verify',
      { challengeId: signup.challengeId, code: await code(signup.challengeId) },
      undefined,
      'POST',
      400,
    );
    const customer = await call<TokenView>('/customers/auth/verify', {
      challengeId: signup.challengeId,
      code: await code(signup.challengeId),
    });
    assert.equal(customer.needsLocation, true);
    assert.equal(customer.user.accountVerified, true);
    await call(
      '/customers/auth/verify',
      { challengeId: signup.challengeId, code: await code(signup.challengeId) },
      undefined,
      'POST',
      400,
    );
    const saved = await call<{ latitude: number }>(
      '/customers/me/location',
      {
        latitude: 30.0444,
        longitude: 31.2357,
        addressText: 'Test pickup in Cairo',
      },
      customer.access_token,
      'PUT',
    );
    assert.equal(saved.latitude, 30.0444);
    const location = await call<{ needsLocation: boolean }>(
      '/customers/me',
      undefined,
      customer.access_token,
      'GET',
    );
    assert.equal(location.needsLocation, false);
    const place = await call<{ id: string }>(
      '/customers/addresses',
      {
        label: 'Work',
        addressText: 'Office in Cairo',
        latitude: 30.05,
        longitude: 31.23,
      },
      customer.access_token,
      'POST',
      201,
    );
    const places = await call<unknown[]>(
      '/customers/addresses',
      undefined,
      customer.access_token,
      'GET',
    );
    assert.equal(places.length, 1);
    const unchangedPickup = await call<{ latitude: number }>(
      '/customers/me/location',
      undefined,
      customer.access_token,
      'GET',
    );
    assert.equal(unchangedPickup.latitude, 30.0444);
    await call(
      `/customers/addresses/${place.id}`,
      undefined,
      customer.access_token,
      'DELETE',
    );
    const riderSignup = await call<ChallengeView>(
      '/riders/auth/register',
      {
        fullName: 'Test Rider',
        phone: '01112345678',
        password,
        vehicleType: 'CAR',
      },
      undefined,
      'POST',
      201,
    );
    const rider = await call<TokenView>('/riders/auth/verify', {
      challengeId: riderSignup.challengeId,
      code: await code(riderSignup.challengeId),
    });
    assert.equal(rider.user.accountVerified, false);
    await call(
      '/riders/orders/nearby?latitude=30.0444&longitude=31.2357',
      undefined,
      rider.access_token,
      'GET',
      403,
    );
    await call('/customers/me', undefined, rider.access_token, 'GET', 403);
    const draft = await call<{ id: string; version: number }>(
      '/trips',
      {
        packageDescription: 'Test parcel',
        vehicleType: 'CAR',
        destination: {
          latitude: 30.06,
          longitude: 31.24,
          addressText: 'Test destination',
        },
        recipientName: 'Test recipient',
        recipientPhone: '01212345678',
      },
      customer.access_token,
      'POST',
      201,
    );
    await call(`/trips/${draft.id}/quote`, {}, customer.access_token);
    await call(
      `/trips/${draft.id}/publish`,
      { version: draft.version },
      customer.access_token,
    );
    await db.query(
      'UPDATE users SET is_rider_verified=true,is_online=true WHERE id=$1',
      [rider.user.id],
    );
    const nearby = await call<NearbyView>(
      '/riders/orders/nearby?latitude=30.0444&longitude=31.2357',
      undefined,
      rider.access_token,
      'GET',
    );
    assert.equal(nearby.length, 1);
    assert.equal(nearby[0].distanceMeters, 0);
    assert.equal('recipientPhone' in nearby[0], false);
    const far = await call<NearbyView>(
      '/riders/orders/nearby?latitude=31&longitude=32',
      undefined,
      rider.access_token,
      'GET',
    );
    assert.equal(far.length, 0);
    // Profile identity comes from UserContext, never a client-supplied user id.
    const profile = await call<{ user: { fullName: string } }>(
      '/customers/me',
      { fullName: 'Updated Customer' },
      customer.access_token,
      'PATCH',
    );
    assert.equal(profile.user.fullName, 'Updated Customer');
    await call(
      '/customers/me',
      { isRiderVerified: true },
      customer.access_token,
      'PATCH',
      400,
    );
    await call(
      '/customers/me',
      { vehicleType: 'CAR' },
      customer.access_token,
      'PATCH',
      400,
    );
    await call(`/trips/${draft.id}`, undefined, rider.access_token, 'GET', 404);
    const accepted = await call<{ version: number }>(
      `/trips/${draft.id}/accept`,
      {},
      rider.access_token,
    );
    const messageKey = randomUUID();
    await call(
      `/trips/${draft.id}/messages`,
      { clientMessageId: messageKey, body: 'Ready for pickup' },
      customer.access_token,
      'POST',
      201,
    );
    await call(
      `/trips/${draft.id}/messages`,
      { clientMessageId: messageKey, body: 'Retry' },
      customer.access_token,
      'POST',
      201,
    );
    const messages = await call<unknown[]>(
      `/trips/${draft.id}/messages`,
      undefined,
      rider.access_token,
      'GET',
    );
    assert.equal(messages.length, 1);
    let current = await call<{ version: number; status: string }>(
      `/trips/${draft.id}/actions/start`,
      { version: accepted.version },
      rider.access_token,
    );
    await call(
      `/trips/${draft.id}/actions/cancel`,
      { version: current.version, reason: 'Cannot cancel now' },
      customer.access_token,
      'POST',
      409,
    );
    await assert.rejects(
      db.query("UPDATE trips SET status='CANCELLED' WHERE id=$1", [draft.id]),
    );
    await call(
      `/trips/${draft.id}/tracking/locations`,
      {
        updateId: randomUUID(),
        sequence: 1,
        latitude: 30.0444,
        longitude: 31.2357,
        accuracy: 10,
        recordedAt: new Date().toISOString(),
      },
      rider.access_token,
    );
    const snapshot = await call<{ location: { sequence: number } }>(
      `/trips/${draft.id}/tracking`,
      undefined,
      customer.access_token,
      'GET',
    );
    assert.equal(snapshot.location.sequence, 1);
    for (const action of [
      'arrive-pickup',
      'confirm-pickup',
      'start-transit',
      'arrive-destination',
      'complete',
    ]) {
      current = await call(
        `/trips/${draft.id}/actions/${action}`,
        { version: current.version },
        rider.access_token,
      );
    }
    assert.equal(current.status, 'DELIVERED');
    await call(
      `/trips/${draft.id}/messages`,
      { clientMessageId: randomUUID(), body: 'Closed' },
      rider.access_token,
      'POST',
      409,
    );
    const history = await call<{ items: { status: string }[] }>(
      '/trips?status=DELIVERED',
      undefined,
      rider.access_token,
      'GET',
    );
    assert.equal(history.items[0].status, 'DELIVERED');
    const earnings = await call<{ deliveries: number; totalPiasters: number }>(
      '/riders/earnings',
      undefined,
      rider.access_token,
      'GET',
    );
    assert.equal(earnings.deliveries, 1);
    assert.equal(earnings.totalPiasters, 4865);
    const repeated = await call<{
      id: string;
      status: string;
      riderId: null;
      pricePiasters: null;
    }>(
      `/trips/${draft.id}/repeat`,
      { clientRequestId: randomUUID() },
      customer.access_token,
      'POST',
      201,
    );
    assert.equal(repeated.status, 'DRAFT');
    assert.equal(repeated.riderId, null);
    assert.equal(repeated.pricePiasters, null);
    await call(`/trips/${repeated.id}/quote`, {}, customer.access_token);
    await call(
      `/trips/${repeated.id}/publish`,
      { version: 1 },
      customer.access_token,
    );
    const offer = await call<{ id: string }>(
      `/trips/${repeated.id}/offers`,
      { amountPiasters: 7500, reason: 'Special handling' },
      rider.access_token,
      'POST',
      201,
    );
    const assigned = await call<{ version: number; pricePiasters: number }>(
      `/trips/${repeated.id}/offers/${offer.id}/accept`,
      {},
      customer.access_token,
    );
    assert.equal(assigned.pricePiasters, 7500);
    await call(
      `/trips/${repeated.id}/actions/cancel`,
      { version: assigned.version, reason: 'Plans changed' },
      customer.access_token,
    );
    const key = randomUUID();
    const racing = await call<{ id: string }>(
      `/trips/${draft.id}/repeat`,
      { clientRequestId: key },
      customer.access_token,
      'POST',
      201,
    );
    const duplicate = await call<{ id: string }>(
      `/trips/${draft.id}/repeat`,
      { clientRequestId: key },
      customer.access_token,
      'POST',
      201,
    );
    assert.equal(racing.id, duplicate.id);
    await call(`/trips/${racing.id}/quote`, {}, customer.access_token);
    await call(
      `/trips/${racing.id}/publish`,
      { version: 1 },
      customer.access_token,
    );
    const [second] = await db.query<{ id: string }[]>(
      "INSERT INTO users(phone,full_name,role,password_hash,phone_verified_at,is_rider_verified,is_active,vehicle_type,is_online) SELECT '+201512345678','Second Rider',role,password_hash,phone_verified_at,true,true,vehicle_type,true FROM users WHERE id=$1 RETURNING id",
      [rider.user.id],
    );
    const secondToken = await app
      .get(JwtService)
      .signAsync({ sub: second.id, version: 0, type: 'access' });
    const attempts = await Promise.all(
      [rider.access_token, secondToken].map((token) =>
        fetch(`${base}/trips/${racing.id}/accept`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: '{}',
        }),
      ),
    );
    assert.deepEqual(
      attempts.map((response) => response.status).sort(),
      [200, 409],
    );
    const raced = await call<{ version: number; riderId: string }>(
      `/trips/${racing.id}`,
      undefined,
      customer.access_token,
      'GET',
    );
    assert.ok([rider.user.id, second.id].includes(raced.riderId));
    const winningToken =
      raced.riderId === second.id ? secondToken : rider.access_token;
    const startCancel = await Promise.all([
      fetch(`${base}/trips/${racing.id}/actions/start`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${winningToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ version: raced.version }),
      }),
      fetch(`${base}/trips/${racing.id}/actions/cancel`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${customer.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          version: raced.version,
          reason: 'Race cancellation',
        }),
      }),
    ]);
    assert.deepEqual(
      startCancel.map((response) => response.status).sort(),
      [200, 409],
    );
    await ageChallenges(customer.user.id);
    const email = await call<ChallengeView>(
      '/customers/auth/email/request-verification',
      {},
      customer.access_token,
    );
    await call(
      '/customers/auth/email/verify',
      { challengeId: email.challengeId, code: await code(email.challengeId) },
      customer.access_token,
    );
    for (const channel of ['WHATSAPP', 'EMAIL']) {
      await ageChallenges(customer.user.id);
      const reset = await call<ChallengeView>(
        '/customers/auth/password/forgot',
        {
          phone: '01012345678',
          channel,
        },
      );
      await call('/customers/auth/password/reset', {
        challengeId: reset.challengeId,
        code: await code(reset.challengeId),
        newPassword: password,
      });
    }
    await call('/customers/me', undefined, customer.access_token, 'GET', 401);
    const login = await call<TokenView>('/customers/auth/login', {
      phone: '01012345678',
      password,
    });
    assert.equal(login.needsLocation, false);
    assert.ok(login.access_token);
    assert.equal('refreshToken' in login, false);
    assert.equal(
      (
        await db.query<{ value: null }[]>(
          "SELECT to_regclass('sessions') AS value",
        )
      )[0].value,
      null,
    );
    console.log(
      'PASS: PostgreSQL 17 migration, signup, role separation, OTP replay, location, rider approval, nearby discovery, profile context, saved places, quotes, lifecycle, cancellation trigger, tracking, chat deduplication, offers, repeat trips, earnings, both recovery channels, access tokens and password-reset invalidation. No messages sent.',
    );
  } finally {
    if (app) await app.close();
    if (created && /^wasel_it_[a-f0-9]{16}$/.test(name))
      await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end().catch(() => {});
    process.env.DB_NAME = original.DB_NAME;
    process.env.NODE_ENV = original.NODE_ENV;
  }
}
if (require.main === module)
  void runIntegration().catch((error: unknown) => {
    console.error(
      `Integration check failed: ${error instanceof Error ? error.message : 'Unknown error'}. Confirm PostgreSQL 17 is running and the local DB user can create a test database.`,
    );
    process.exitCode = 1;
  });
