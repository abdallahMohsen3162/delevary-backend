import { Inject, Injectable, Logger } from '@nestjs/common';
import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getMessaging, type Messaging } from 'firebase-admin/messaging';
import { CONFIG, type AppConfig } from '../../config/config';
import { Notification } from './notification.entity';

@Injectable()
export class FirebasePushService {
  private readonly logger = new Logger(FirebasePushService.name);
  private messaging: Messaging | null = null;
  constructor(@Inject(CONFIG) config: AppConfig) {
    if (!config.FIREBASE_PROJECT_ID) { this.logger.warn('FCM is not configured. Notifications remain in history and push deliveries stay queued.'); return; }
    try {
      const app = getApps().find(value => value.name === 'wasel-push') || initializeApp({
        projectId: config.FIREBASE_PROJECT_ID,
        credential: config.FIREBASE_CLIENT_EMAIL && config.FIREBASE_PRIVATE_KEY ? cert({
          projectId: config.FIREBASE_PROJECT_ID, clientEmail: config.FIREBASE_CLIENT_EMAIL,
          privateKey: config.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }) : applicationDefault(),
      }, 'wasel-push');
      this.messaging = getMessaging(app);
    } catch { this.logger.error('FCM initialization failed. Check the server Firebase credentials.'); }
  }
  get configured() { return !!this.messaging; }
  async send(token: string, item: Notification) {
    if (!this.messaging) throw new Error('FCM_NOT_CONFIGURED');
    return this.messaging.send({
      token,
      notification: { title: item.title, body: item.description },
      data: { notificationId: item.id, userId: item.userId, type: item.type, ...(item.tripId ? { tripId: item.tripId } : {}) },
      android: { priority: 'high', ttl: 24 * 60 * 60 * 1000, notification: { channelId: 'wasel_updates', sound: 'default', tag: item.id } },
      apns: { headers: { 'apns-collapse-id': item.id, 'apns-expiration': String(Math.floor(Date.now() / 1000) + 86400) }, payload: { aps: { sound: 'default' } } },
    });
  }
}
