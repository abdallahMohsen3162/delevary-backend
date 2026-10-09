import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Verification, DeliveryChannel } from '../auth/entities';
@Entity('message_jobs')
@Index(['status', 'nextAttemptAt'])
export class MessageJob {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'challenge_id', type: 'uuid', unique: true })
  challengeId!: string;
  @ManyToOne(() => Verification, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'challenge_id' })
  challenge!: Verification;
  @Column({ type: 'enum', enum: DeliveryChannel }) channel!: DeliveryChannel;
  @Column({
    name: 'payload_ciphertext',
    type: 'text',
    nullable: true,
    select: false,
  })
  payloadCiphertext!: string | null;
  @Column({ type: 'varchar', default: 'QUEUED' }) status!:
    'QUEUED' | 'SENT' | 'FAILED' | 'SKIPPED';
  @Column({ default: 0 }) attempts!: number;
  @Column({ name: 'next_attempt_at', type: 'timestamptz' })
  nextAttemptAt!: Date;
  @Column({ name: 'locked_until', type: 'timestamptz', nullable: true })
  lockedUntil!: Date | null;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'sent_at', type: 'timestamptz', nullable: true })
  sentAt!: Date | null;
  @Column({ name: 'last_error', type: 'varchar', nullable: true }) lastError!:
    string | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
