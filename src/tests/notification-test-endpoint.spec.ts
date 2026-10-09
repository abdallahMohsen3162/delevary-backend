import 'reflect-metadata';
import { INestApplication, NotFoundException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { CONFIG } from '../config/config';
import { NotificationsController, NotificationSenderGuard } from '../modules/notifications/notifications.controller';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { FirebasePushService } from '../modules/notifications/firebase-push.service';

describe('GET /notifications/test', () => {
  let app: INestApplication;
  const key = 'test-notification-key-with-32-characters';
  const fcm = 'test_FCM_registration_token_1234567890';
  const notifications = { sendToToken: jest.fn() };
  const firebase = { configured: true };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [
        NotificationSenderGuard,
        { provide: CONFIG, useValue: { NOTIFICATIONS_API_KEY: key } },
        { provide: NotificationsService, useValue: notifications },
        { provide: FirebasePushService, useValue: firebase },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
  });

  beforeEach(() => {
    firebase.configured = true;
    notifications.sendToToken.mockReset();
    notifications.sendToToken.mockResolvedValue({ notification: { id: 'test-id' }, pushStatus: 'queued' });
  });
  afterAll(async () => { await app?.close(); });

  test('rejects absent or incorrect sender keys without queueing a push', async () => {
    for (const supplied of ['', 'incorrect']) {
      await request(app.getHttpServer()).get('/api/v1/notifications/test').query({ fcm })
        .set('x-notification-key', supplied).expect(401);
    }
    expect(notifications.sendToToken).not.toHaveBeenCalled();
  });

  test('rejects missing and malformed FCM query parameters', async () => {
    for (const query of [{}, { fcm: 'short' }, { fcm: 'invalid token with spaces' }]) {
      await request(app.getHttpServer()).get('/api/v1/notifications/test').query(query)
        .set('x-notification-key', key).expect(400);
    }
    expect(notifications.sendToToken).not.toHaveBeenCalled();
  });

  test('queues a fixed test payload and does not cache or claim delivery', async () => {
    const response = await request(app.getHttpServer()).get('/api/v1/notifications/test').query({ fcm })
      .set('x-notification-key', key).expect(202).expect('Cache-Control', 'no-store');
    expect(notifications.sendToToken).toHaveBeenCalledWith(fcm, {
      type: 'system', title: 'Wasel test notification',
      description: 'This is a test notification from Wasel. Open Updates to view it.',
    });
    expect(response.body).toEqual({ notification: { id: 'test-id' }, pushStatus: 'queued', pushConfigured: true });
  });

  test('reports unavailable Firebase without creating a queued notification', async () => {
    firebase.configured = false;
    await request(app.getHttpServer()).get('/api/v1/notifications/test').query({ fcm })
      .set('x-notification-key', key).expect(503);
    expect(notifications.sendToToken).not.toHaveBeenCalled();
  });

  test('reports tokens that have no registered user', async () => {
    notifications.sendToToken.mockRejectedValue(new NotFoundException('No registered user'));
    await request(app.getHttpServer()).get('/api/v1/notifications/test').query({ fcm })
      .set('x-notification-key', key).expect(404);
  });
});
