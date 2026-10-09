import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../users/user.entity';
@Entity('user_addresses')
@Index('user_addresses_one_default', ['userId'], {
  unique: true,
  where: 'is_default = true',
})
export class UserAddress {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'user_id', type: 'uuid' }) userId!: string;
  @Column({ name: 'is_default', default: false }) isDefault!: boolean;
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
  @Column({ length: 60, default: 'Current location' }) label!: string;
  @Column({ name: 'address_text', type: 'text' }) addressText!: string;
  @Column({ type: 'double precision' }) latitude!: number;
  @Column({ type: 'double precision' }) longitude!: number;
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
export function addressView(address: UserAddress | null) {
  return address
    ? {
        id: address.id,
        label: address.label,
        addressText: address.addressText,
        longitude: address.longitude,
        latitude: address.latitude,
        updatedAt: address.updatedAt,
      }
    : null;
}
