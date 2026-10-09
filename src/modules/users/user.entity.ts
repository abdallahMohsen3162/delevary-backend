import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum Role {
  CUSTOMER = 'CUSTOMER',
  RIDER = 'RIDER',
}
export enum Vehicle {
  MOTORCYCLE = 'MOTORCYCLE',
  CAR = 'CAR',
  BICYCLE = 'BICYCLE',
  TUKTUK = 'TUKTUK',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ type: 'varchar', length: 20, unique: true }) phone!: string;
  @Column({ type: 'varchar', length: 254, unique: true, nullable: true })
  email!: string | null;
  @Column({ name: 'full_name', length: 80 }) fullName!: string;
  @Column({ type: 'enum', enum: Role }) role!: Role;
  @Column({ name: 'password_hash', type: 'text', select: false })
  passwordHash!: string;
  @Column({ name: 'phone_verified_at', type: 'timestamptz', nullable: true })
  phoneVerifiedAt!: Date | null;
  @Column({ name: 'email_verified_at', type: 'timestamptz', nullable: true })
  emailVerifiedAt!: Date | null;
  @Column({ name: 'is_rider_verified', default: false })
  isRiderVerified!: boolean;
  @Column({ name: 'token_version', default: 0 }) tokenVersion!: number;
  @Column({ name: 'is_online', default: false }) isOnline!: boolean;
  @Column({ name: 'is_active', default: true }) isActive!: boolean;
  @Column({ name: 'vehicle_type', type: 'enum', enum: Vehicle, nullable: true })
  vehicleType!: Vehicle | null;
  @Column({ name: 'fcm_token', type: 'text', nullable: true, select: false })
  fcmToken!: string | null;
  @Column({ name: 'fcm_token_updated_at', type: 'timestamptz', nullable: true })
  fcmTokenUpdatedAt!: Date | null;
  @Column({ name: 'push_enabled', default: false }) pushEnabled!: boolean;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
export function publicUser(user: User) {
  return {
    id: user.id,
    phone: user.phone,
    email: user.email,
    fullName: user.fullName,
    role: user.role,
    phoneVerified: !!user.phoneVerifiedAt,
    emailVerified: !!user.emailVerifiedAt,
    isRiderVerified: user.isRiderVerified,
    accountVerified:
      !!user.phoneVerifiedAt &&
      (user.role === Role.CUSTOMER || user.isRiderVerified),
    vehicleType: user.vehicleType,
    isOnline: user.isOnline,
  };
}
