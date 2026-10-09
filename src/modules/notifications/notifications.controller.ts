import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, HttpCode, Inject, Injectable, Param, ParseUUIDPipe, Post, Put, Query, ServiceUnavailableException, UnauthorizedException, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { createHash, timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { CONFIG, type AppConfig } from '../../config/config';
import { CurrentUser, Public, type Principal } from '../auth/security';
import { DeviceTokenDto, NotificationHistoryDto, SendNotificationDto, SendNotificationQuery } from './notification.dto';
import { NotificationsService } from './notifications.service';
import { FirebasePushService } from './firebase-push.service';

@Injectable()
export class NotificationSenderGuard implements CanActivate {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  canActivate(context: ExecutionContext) {
    if (!this.config.NOTIFICATIONS_API_KEY) throw new ServiceUnavailableException('Notification sender key is not configured.');
    const supplied = context.switchToHttp().getRequest<Request>().header('x-notification-key');
    if (!supplied || !timingSafeEqual(createHash('sha256').update(supplied).digest(), createHash('sha256').update(this.config.NOTIFICATIONS_API_KEY).digest())) throw new UnauthorizedException();
    return true;
  }
}

@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly firebase: FirebasePushService) {}
  @Put('device') register(@CurrentUser() { user }: Principal, @Body() dto: DeviceTokenDto) { return this.notifications.registerDevice(user.id, dto.fcmToken); }
  @Delete('device') unregister(@CurrentUser() { user }: Principal, @Body() dto: DeviceTokenDto) { return this.notifications.unregisterDevice(user.id, dto.fcmToken); }
  @Get() history(@CurrentUser() { user }: Principal, @Query() dto: NotificationHistoryDto) { return this.notifications.list(user.id, dto); }
  @Post('read-all') @HttpCode(200) readAll(@CurrentUser() { user }: Principal) { return this.notifications.readAll(user.id); }
  @Post(':id/read') @HttpCode(200) read(@CurrentUser() { user }: Principal, @Param('id', ParseUUIDPipe) id: string) { return this.notifications.read(user.id, id); }
  // Separate trusted-server authorization; no customer/rider can send arbitrary alerts.
  @Public() @UseGuards(NotificationSenderGuard) @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Post('send') @HttpCode(202)
  async send(@Query() query: SendNotificationQuery, @Body() dto: SendNotificationDto) {
    return { ...await this.notifications.sendToToken(query.fcm, dto), pushConfigured: this.firebase.configured };
  }
}
