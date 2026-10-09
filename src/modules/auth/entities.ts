import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Role, User } from '../users/user.entity';

export enum ChallengePurpose {
  SIGNUP = 'SIGNUP',
  PASSWORD_RESET = 'PASSWORD_RESET',
  VERIFY_EMAIL = 'VERIFY_EMAIL',
}
export enum DeliveryChannel {
  WHATSAPP = 'WHATSAPP',
  EMAIL = 'EMAIL',
}

@Entity('auth_verifications')
@Index(['userId', 'purpose', 'createdAt'])
export class Verification {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid', nullable: true }) userId!:
    string | null;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ type: 'enum', enum: Role }) role!: Role;
  @Column({ type: 'enum', enum: ChallengePurpose }) purpose!: ChallengePurpose;
  @Column({ type: 'enum', enum: DeliveryChannel }) channel!: DeliveryChannel;
  @Column({ name: 'code', type: 'varchar', length: 6, select: false })
  code!: string;
  @Column({ default: 0 }) attempts!: number;
  @Column({ name: 'expires_at', type: 'timestamptz' }) expiresAt!: Date;
  @Column({ name: 'consumed_at', type: 'timestamptz', nullable: true })
  consumedAt!: Date | null;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
