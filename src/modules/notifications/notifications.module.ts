import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Notification, NotificationPushDelivery } from './notification.entity';
import { NotificationsController, NotificationSenderGuard } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { FirebasePushService } from './firebase-push.service';
import { PushWorkerService } from './push-worker.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Notification, NotificationPushDelivery])],
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebasePushService, PushWorkerService, NotificationSenderGuard],
  exports: [NotificationsService],
})
export class NotificationsModule {}
