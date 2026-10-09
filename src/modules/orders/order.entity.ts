import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User, Vehicle } from '../users/user.entity';
@Entity('trips')
@Index(['customerId', 'clientRequestId'], { unique: true })
@Index('trips_one_active_rider', ['riderId'], {
  unique: true,
  where:
    "rider_id IS NOT NULL AND status NOT IN ('DELIVERED','CANCELLED','FAILED')",
})
export class DeliveryOrder {
  @PrimaryGeneratedColumn('uuid') id!: string;
  @Column({ name: 'customer_id', type: 'uuid' }) customerId!: string;
  @ManyToOne(() => User) @JoinColumn({ name: 'customer_id' }) customer!: User;
  @Index() @Column({ type: 'varchar', default: 'OPEN' }) status!: string;
  @Column({ name: 'package_description', type: 'varchar', length: 300 })
  packageDescription!: string;
  @Column({ name: 'vehicle_type', type: 'enum', enum: Vehicle })
  vehicleType!: Vehicle;
  @Column({ name: 'pickup_address', type: 'text' }) pickupAddress!: string;
  @Column({ name: 'destination_address', type: 'text' })
  destinationAddress!: string;
  @Index()
  @Column({ name: 'pickup_latitude', type: 'double precision' })
  pickupLatitude!: number;
  @Column({ name: 'pickup_longitude', type: 'double precision' })
  pickupLongitude!: number;
  @Column({ name: 'destination_latitude', type: 'double precision' })
  destinationLatitude!: number;
  @Column({ name: 'destination_longitude', type: 'double precision' })
  destinationLongitude!: number;
  @Column({ name: 'recipient_name', type: 'varchar', length: 80 })
  recipientName!: string;
  @Column({ name: 'recipient_phone', type: 'varchar', length: 20 })
  recipientPhone!: string;
  @Column({ name: 'client_request_id', type: 'uuid', nullable: true })
  clientRequestId!: string | null;
  @Column({ name: 'rider_id', type: 'uuid', nullable: true }) riderId!:
    string | null;
  @ManyToOne(() => User) @JoinColumn({ name: 'rider_id' }) rider!: User | null;
  @Column({ default: 1 }) version!: number;
  @Column({ name: 'price_piasters', type: 'integer', nullable: true })
  pricePiasters!: number | null;
  @Column({ name: 'distance_meters', type: 'integer', nullable: true })
  distanceMeters!: number | null;
  @Column({ name: 'duration_seconds', type: 'integer', nullable: true })
  durationSeconds!: number | null;
  @Column({ name: 'route_geometry', type: 'jsonb', nullable: true })
  routeGeometry!: { type: 'LineString'; coordinates: number[][] } | null;
  @Column({ name: 'quote_expires_at', type: 'timestamptz', nullable: true })
  quoteExpiresAt!: Date | null;
  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;
  @Column({ name: 'picked_up_at', type: 'timestamptz', nullable: true })
  pickedUpAt!: Date | null;
  @Column({ name: 'delivered_at', type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;
  @Column({ name: 'cancelled_at', type: 'timestamptz', nullable: true })
  cancelledAt!: Date | null;
  @Column({
    name: 'delivery_instructions',
    type: 'varchar',
    length: 500,
    default: '',
  })
  deliveryInstructions!: string;
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
