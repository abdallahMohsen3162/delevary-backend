import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Notification, NotificationPushDelivery } from './notification.entity';
import { FirebasePushService } from './firebase-push.service';

@Injectable()
export class PushWorkerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PushWorkerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private working = false;
  private stopping = false;
  constructor(
    @InjectRepository(NotificationPushDelivery) private readonly deliveries: Repository<NotificationPushDelivery>,
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly firebase: FirebasePushService,
  ) {}
  onModuleInit() { this.timer = setInterval(() => { void this.tick(); }, 3000); this.timer.unref(); }
  onModuleDestroy() { this.stopping = true; if (this.timer) clearInterval(this.timer); }
  private async claim() {
    return this.deliveries.manager.transaction(async manager => {
      const item = await manager.getRepository(NotificationPushDelivery).createQueryBuilder('delivery')
        .where('delivery.status = :status AND delivery.next_attempt_at <= now()', { status: 'queued' })
        .andWhere('(delivery.locked_until IS NULL OR delivery.locked_until < now())')
        .orderBy('delivery.next_attempt_at', 'ASC').setLock('pessimistic_write').setOnLocked('skip_locked').getOne();
      if (!item) return null;
      item.leaseId = randomUUID(); item.lockedUntil = new Date(Date.now() + 60000); item.attempts++;
      return manager.save(item);
    });
  }
  private async tick() {
    if (this.working || this.stopping || !this.firebase.configured) return;
    this.working = true;
    try {
      for (let count = 0; count < 5 && !this.stopping; count++) {
        const delivery = await this.claim(); if (!delivery) break;
        await this.deliver(delivery);
      }
    } catch { this.logger.error('Push worker could not process the queue; it will retry.'); }
    finally { this.working = false; }
  }
  private async deliver(delivery: NotificationPushDelivery) {
    const where = { id: delivery.id, leaseId: delivery.leaseId! };
    const notification = await this.notifications.findOneByOrFail({ id: delivery.notificationId });
    const user = await this.users.createQueryBuilder('user').addSelect('user.fcmToken').where('user.id = :id', { id: notification.userId }).getOne();
    if (!user?.isActive || !user.pushEnabled || !user.fcmToken || notification.createdAt.getTime() < Date.now() - 86400000) {
      await this.deliveries.update(where, { status: 'skipped', lastErrorCode: 'NO_DEVICE_OR_EXPIRED', lockedUntil: null, leaseId: null }); return;
    }
    try {
      const providerMessageId = await this.firebase.send(user.fcmToken, notification);
      await this.deliveries.update(where, { status: 'sent', providerMessageId, sentAt: new Date(), lastErrorCode: null, lockedUntil: null, leaseId: null });
    } catch (error) {
      const rawCode = (error as { code?: unknown }).code;
      const code = typeof rawCode === 'string' && /^[a-z/-]+$/.test(rawCode) ? rawCode.slice(0, 100) : 'PUSH_SEND_FAILED';
      const invalidToken = ['messaging/registration-token-not-registered', 'messaging/invalid-registration-token'].includes(code);
      if (invalidToken) await this.users.update({ id: user.id, fcmToken: user.fcmToken }, { fcmToken: null, pushEnabled: false, fcmTokenUpdatedAt: new Date() });
      const permanent = invalidToken || ['messaging/invalid-argument', 'messaging/mismatched-credential'].includes(code);
      await this.deliveries.update(where, {
        status: permanent || delivery.attempts >= 6 ? 'failed' : 'queued', lastErrorCode: code,
        nextAttemptAt: new Date(Date.now() + Math.min(3600000, 15000 * 2 ** delivery.attempts)), lockedUntil: null, leaseId: null,
      });
    }
  }
}
