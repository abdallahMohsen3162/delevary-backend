import 'reflect-metadata';
import assert from 'node:assert/strict';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import {
  encryptMessage,
  decryptMessage,
  hashPassword,
  verifyPassword,
} from '../modules/auth/crypto';
import { RegisterRiderDto, normalizePhone } from '../modules/auth/auth.dto';
import { ChallengesService } from '../modules/auth/challenges.service';
import { Role, publicUser, User } from '../modules/users/user.entity';
import {
  Verification,
  ChallengePurpose,
  DeliveryChannel,
} from '../modules/auth/entities';
import type { EntityManager } from 'typeorm';
import type { MessageQueue } from '../modules/messaging/messaging.module';

test('passwords are salted, verified, and never stored in plaintext', async () => {
  const a = await hashPassword('strong-password-123');
  const b = await hashPassword('strong-password-123');
  assert.notEqual(a, b);
  assert.equal(await verifyPassword('strong-password-123', a), true);
  assert.equal(await verifyPassword('incorrect-password', a), false);
});
test('message payloads are encrypted and tampering is rejected', () => {
  const key = '12'.repeat(32);
  const encrypted = encryptMessage('code:654321', key);
  assert.equal(encrypted.includes('654321'), false);
  assert.equal(decryptMessage(encrypted, key), 'code:654321');
  assert.throws(() => decryptMessage(encrypted, '34'.repeat(32)));
});
test('rider approval and internal fields cannot be submitted in a signup DTO', async () => {
  const dto = plainToInstance(RegisterRiderDto, {
    fullName: 'Test Rider',
    phone: '01012345678',
    email: 'rider@example.com',
    password: 'secure-password-123',
    vehicleType: 'CAR',
    isRiderVerified: true,
  });
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  assert.ok(errors.some((error) => error.property === 'isRiderVerified'));
  assert.equal(dto.phone, '+201012345678');
});
test('phone verification does not approve a rider; public users omit credentials', () => {
  const user = Object.assign(new User(), {
    role: Role.RIDER,
    phoneVerifiedAt: new Date(),
    isRiderVerified: false,
    passwordHash: 'secret',
    fcmToken: 'private',
  });
  const view = publicUser(user);
  assert.equal(view.accountVerified, false);
  assert.equal('passwordHash' in view, false);
  assert.equal('fcmToken' in view, false);
  user.isRiderVerified = true;
  assert.equal(publicUser(user).accountVerified, true);
  user.role = Role.CUSTOMER;
  user.isRiderVerified = false;
  assert.equal(publicUser(user).accountVerified, true);
});
test('OTP failures increment persistently and cannot pass after the attempt limit', async () => {
  const id = '7cc57784-cbe6-41d5-8629-2a2d8cfba2a0';
  const challenge = Object.assign(new Verification(), {
    id,
    userId: 'user-id',
    purpose: ChallengePurpose.SIGNUP,
    role: Role.CUSTOMER,
    channel: DeliveryChannel.WHATSAPP,
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 300_000),
    code: '654321',
  });
  const builder = {
    addSelect() {
      return builder;
    },
    where() {
      return builder;
    },
    setLock() {
      return builder;
    },
    getOne() {
      return Promise.resolve(challenge);
    },
  };
  let persistedAttempts = 0;
  const manager = {
    findOneBy: () => Promise.resolve(challenge),
    findOne: () => Promise.resolve({}),
    getRepository: () => ({ createQueryBuilder: () => builder }),
    save: (value: Verification) => {
      persistedAttempts = value.attempts;
      return Promise.resolve(value);
    },
  } as unknown as EntityManager;
  const service = new ChallengesService({} as MessageQueue);
  for (let attempt = 1; attempt <= 5; attempt++) {
    assert.equal(
      await service.consume(
        manager,
        id,
        '000000',
        Role.CUSTOMER,
        ChallengePurpose.SIGNUP,
      ),
      null,
    );
    assert.equal(persistedAttempts, attempt);
  }
  assert.equal(
    await service.consume(
      manager,
      id,
      '654321',
      Role.CUSTOMER,
      ChallengePurpose.SIGNUP,
    ),
    null,
  );
});
test('OTP is purpose/role-bound, expires, and can only be consumed once', async () => {
  const id = 'challenge';
  const challenge = Object.assign(new Verification(), {
    id,
    userId: 'user',
    purpose: ChallengePurpose.PASSWORD_RESET,
    role: Role.CUSTOMER,
    attempts: 0,
    consumedAt: null,
    expiresAt: new Date(Date.now() + 300_000),
    code: '654321',
  });
  const builder = {
    addSelect() {
      return builder;
    },
    where() {
      return builder;
    },
    setLock() {
      return builder;
    },
    getOne() {
      return Promise.resolve(challenge);
    },
  };
  const manager = {
    findOneBy: () => Promise.resolve(challenge),
    findOne: () => Promise.resolve({}),
    getRepository: () => ({ createQueryBuilder: () => builder }),
    save: (value: Verification) => Promise.resolve(value),
  } as unknown as EntityManager;
  const service = new ChallengesService({} as MessageQueue);
  assert.equal(
    await service.consume(
      manager,
      id,
      '654321',
      Role.RIDER,
      ChallengePurpose.PASSWORD_RESET,
    ),
    null,
  );
  assert.equal(
    await service.consume(
      manager,
      id,
      '654321',
      Role.CUSTOMER,
      ChallengePurpose.SIGNUP,
    ),
    null,
  );
  assert.ok(
    await service.consume(
      manager,
      id,
      '654321',
      Role.CUSTOMER,
      ChallengePurpose.PASSWORD_RESET,
    ),
  );
  assert.equal(
    await service.consume(
      manager,
      id,
      '654321',
      Role.CUSTOMER,
      ChallengePurpose.PASSWORD_RESET,
    ),
    null,
  );
  challenge.consumedAt = null;
  challenge.expiresAt = new Date(0);
  assert.equal(
    await service.consume(
      manager,
      id,
      '654321',
      Role.CUSTOMER,
      ChallengePurpose.PASSWORD_RESET,
    ),
    null,
  );
  assert.equal(normalizePhone('٠١٠١٢٣٤٥٦٧٨'), '+201012345678');
});
