import { BadRequestException, HttpException, Injectable } from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import { EntityManager } from 'typeorm';
import { MessageQueue } from '../messaging/messaging.module';
import { Role, User } from '../users/user.entity';
import { Verification, ChallengePurpose, DeliveryChannel } from './entities';
import { safeEqual } from './crypto';

@Injectable()
export class ChallengesService {
  constructor(private readonly queue: MessageQueue) {}
  async issue(
    manager: EntityManager,
    user: User | null,
    role: Role,
    purpose: ChallengePurpose,
    channel: DeliveryChannel,
  ) {
    if (user) {
      // Caller holds the user lock; limits and invalidation are serialized per account.
      const recent = await manager
        .getRepository(Verification)
        .createQueryBuilder('c')
        .where('c.user_id = :id AND c.created_at > :since', {
          id: user.id,
          since: new Date(Date.now() - 3600_000),
        })
        .orderBy('c.created_at', 'DESC')
        .getMany();
      if (
        recent.length >= 5 ||
        (recent[0] && recent[0].createdAt.getTime() > Date.now() - 60_000)
      )
        throw new HttpException(
          'Please wait before requesting another code.',
          429,
        );
      await manager
        .getRepository(Verification)
        .createQueryBuilder()
        .update()
        .set({ consumedAt: new Date() })
        .where('user_id = :id AND purpose = :purpose AND consumed_at IS NULL', {
          id: user.id,
          purpose,
        })
        .execute();
    }
    const id = randomUUID();
    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    const challenge = manager.create(Verification, {
      id,
      userId: user?.id || null,
      role,
      purpose,
      channel,
      code,
      attempts: 0,
      expiresAt: new Date(Date.now() + 300_000),
      consumedAt: null,
    });
    await manager.save(challenge);
    const destination =
      channel === DeliveryChannel.WHATSAPP ? user?.phone : user?.email;
    if (user && destination)
      await this.queue.enqueue(manager, challenge, destination, code);
    return {
      challengeId: id,
      expiresInSeconds: 300,
      resendAfterSeconds: 60,
      channel,
      message: 'If the account is eligible, a verification code will be sent.',
    };
  }
  async consume(
    manager: EntityManager,
    id: string,
    code: string,
    role: Role,
    purpose: ChallengePurpose,
    userId?: string,
  ) {
    // All auth mutations lock user -> challenge, preventing resend/reset deadlocks.
    const snapshot = await manager.findOneBy(Verification, { id });
    if (snapshot?.userId)
      await manager.findOne(User, {
        where: { id: snapshot.userId },
        lock: { mode: 'pessimistic_write' },
      });
    const challenge = await manager
      .getRepository(Verification)
      .createQueryBuilder('c')
      .addSelect('c.code')
      .where('c.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (
      !challenge ||
      challenge.role !== role ||
      challenge.purpose !== purpose ||
      (userId && challenge.userId !== userId) ||
      challenge.consumedAt ||
      challenge.expiresAt.getTime() <= Date.now() ||
      challenge.attempts >= 5
    )
      return null;
    challenge.attempts += 1;
    const matches = safeEqual(challenge.code, code);
    if (matches && challenge.userId) challenge.consumedAt = new Date();
    await manager.save(challenge);
    // Return, don't throw, so failed-attempt increments commit before the caller reports failure.
    return matches && challenge.userId ? challenge : null;
  }
  invalidCode(): never {
    throw new BadRequestException(
      'The code is invalid, expired, or has reached its attempt limit.',
    );
  }
}
