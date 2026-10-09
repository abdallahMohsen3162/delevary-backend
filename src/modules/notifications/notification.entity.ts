import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { User } from '../users/user.entity';
import { DeliveryOrder } from '../orders/order.entity';

export enum NotificationType { SYSTEM = 'system', FINANCIAL = 'financial', ARRIVAL = 'arrival' }

@Entity('notifications')
@Index('notifications_user_lookup', ['userId', 'createdAt'])
@Index('notifications_client_request', ['clientRequestId'], { unique: true })
export class Notification {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'user_id' }) user!: User;
  @Column({ name: 'trip_id', type: 'uuid', nullable: true }) tripId!: string | null;
  @ManyToOne(() => DeliveryOrder, { nullable: true }) @JoinColumn({ name: 'trip_id' }) trip!: DeliveryOrder | null;
  @Column({ type: 'varchar', length: 20, default: NotificationType.SYSTEM }) type!: NotificationType;
  @Column({ type: 'varchar', length: 150 }) title!: string;
  @Column({ type: 'text', default: '' }) description!: string;
  @Column({ name: 'client_request_id', type: 'uuid', nullable: true }) clientRequestId!: string | null;
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true }) readAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}

export type PushStatus = 'queued' | 'sent' | 'failed' | 'skipped';
@Entity('notification_push_deliveries')
@Index('notification_push_one_per_notification', ['notificationId'], { unique: true })
@Index('notification_push_due', ['status', 'nextAttemptAt'])
export class NotificationPushDelivery {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'notification_id', type: 'uuid' }) notificationId!: string;
  @ManyToOne(() => Notification) @JoinColumn({ name: 'notification_id' }) notification!: Notification;
  @Column({ type: 'varchar', length: 16, default: 'queued' }) status!: PushStatus;
  @Column({ type: 'integer', default: 0 }) attempts!: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz', default: () => 'now()' }) nextAttemptAt!: Date;
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true }) lockedUntil!: Date | null;
  @Column({ name: 'lease_id', type: 'uuid', nullable: true }) leaseId!: string | null;
  @Column({ name: 'last_error_code', type: 'varchar', length: 100, nullable: true }) lastErrorCode!: string | null;
  @Column({ name: 'provider_message_id', type: 'text', nullable: true }) providerMessageId!: string | null;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true }) sentAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' }) createdAt!: Date;
}
