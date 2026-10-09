import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, IsUUID, Length, Matches, Max, Min } from 'class-validator';
import { NotificationType } from './notification.entity';

export class DeviceTokenDto {
  @IsString() @Length(20, 4096) @Matches(/^[A-Za-z0-9_:\-]+$/) fcmToken!: string;
}
export class SendNotificationQuery {
  @IsString() @Length(20, 4096) @Matches(/^[A-Za-z0-9_:\-]+$/) fcm!: string;
}
export class SendNotificationDto {
  @IsEnum(NotificationType) type!: NotificationType;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 150) title!: string;
  @Transform(({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value)
  @IsString() @Length(1, 500) description!: string;
  @IsOptional() @IsUUID() clientRequestId?: string;
}
export class NotificationHistoryDto {
  @Type(() => Number) @IsInt() @Min(1) page = 1;
  @Type(() => Number) @IsInt() @Min(1) @Max(50) limit = 20;
  @IsOptional() @IsEnum(NotificationType) type?: NotificationType;
}
