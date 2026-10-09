import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { User } from '../users/user.entity';
import { Notification, NotificationPushDelivery, NotificationType } from './notification.entity';
import { NotificationHistoryDto, SendNotificationDto } from './notification.dto';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @InjectRepository(User) private readonly users: Repository<User>,
  ) {}

  async registerDevice(userId: string, fcmToken: string) {
    await this.users.manager.transaction(async manager => {
      // Serialize ownership claims without introducing authentication sessions.
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [fcmToken]);
      await manager.findOneOrFail(User, { where: { id: userId }, lock: { mode: 'pessimistic_write' } });
      const owner = await manager.findOneBy(User, { fcmToken });
      if (owner && owner.id !== userId) throw new ConflictException('This device is registered to another account. Sign out on the device and retry.');
      await manager.update(User, { id: userId }, { fcmToken, fcmTokenUpdatedAt: new Date(), pushEnabled: true });
    });
    return { registered: true };
  }
  async unregisterDevice(userId: string, fcmToken: string) {
    // An older device must never clear a newer device's registration.
    await this.users.update({ id: userId, fcmToken }, { fcmToken: null, fcmTokenUpdatedAt: new Date(), pushEnabled: false });
    return { success: true };
  }
  async list(userId: string, query: NotificationHistoryDto) {
    const [items, total, unreadCount] = await Promise.all([
      this.notifications.find({ where: { userId, ...(query.type ? { type: query.type } : {}) }, order: { createdAt: 'DESC', id: 'DESC' }, skip: (query.page - 1) * query.limit, take: query.limit }),
      this.notifications.countBy({ userId, ...(query.type ? { type: query.type } : {}) }),
      this.notifications.countBy({ userId, readAt: IsNull() }),
    ]);
    return { items, total, unreadCount, page: query.page, limit: query.limit };
  }
  async read(userId: string, id: string) {
    const notification = await this.notifications.findOneBy({ id, userId });
    if (!notification) throw new NotFoundException('Notification not found.');
    if (!notification.readAt) await this.notifications.update({ id, userId, readAt: IsNull() }, { readAt: new Date() });
    return { success: true };
  }
  async readAll(userId: string) {
    await this.notifications.update({ userId, readAt: IsNull() }, { readAt: new Date() });
    return { success: true };
  }

  async enqueue(manager: EntityManager, userId: string, data: {
    type: NotificationType; title: string; description: string; tripId?: string; clientRequestId?: string;
  }) {
    const notification = await manager.save(Notification, manager.create(Notification, {
      userId, type: data.type, title: data.title, description: data.description,
      tripId: data.tripId || null, clientRequestId: data.clientRequestId || null,
    }));
    await manager.save(NotificationPushDelivery, manager.create(NotificationPushDelivery, { notificationId: notification.id }));
    return notification;
  }

  async sendToToken(fcm: string, dto: SendNotificationDto) {
    return this.notifications.manager.transaction(async manager => {
      await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [fcm]);
      const owners = await manager.find(User, { where: { fcmToken: fcm, isActive: true, pushEnabled: true }, take: 2 });
      if (owners.length !== 1) throw new NotFoundException('No unique active user is registered for this FCM token.');
      const user = owners[0];
      if (dto.clientRequestId) {
        await manager.query('SELECT pg_advisory_xact_lock(hashtext($1))', [dto.clientRequestId]);
        const existing = await manager.findOneBy(Notification, { clientRequestId: dto.clientRequestId });
        if (existing) {
          if (existing.userId !== user.id || existing.type !== dto.type || existing.title !== dto.title || existing.description !== dto.description)
            throw new ConflictException('This clientRequestId was already used for a different notification.');
          const delivery = await manager.findOneByOrFail(NotificationPushDelivery, { notificationId: existing.id });
          return { notification: existing, pushStatus: delivery.status };
        }
      }
      const notification = await this.enqueue(manager, user.id, dto);
      return { notification, pushStatus: 'queued' as const };
    });
  }
}
