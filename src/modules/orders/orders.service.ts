import { DeliveryOrder } from './order.entity';
import { Injectable } from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { NearbyDto } from '../locations/location.dto';
import { Vehicle } from '../users/user.entity';
export type NearbyOrder = {
  id: string;
  packageDescription: string;
  vehicleType: Vehicle;
  longitude: number;
  latitude: number;
  distanceMeters: number;
  pricePiasters: number;
  destinationAddress: string;
};
@Injectable()
export class OrdersService {
  constructor(
    @InjectRepository(DeliveryOrder)
    private readonly tripsRepository: Repository<DeliveryOrder>,
  ) {}
  async earnings(riderId: string) {
    const [result] = await this.tripsRepository.query<
      { deliveries: number; totalPiasters: number }[]
    >(
      'SELECT count(*)::int AS deliveries, COALESCE(sum(price_piasters),0)::float8 AS "totalPiasters" FROM trips WHERE rider_id=$1 AND status=\'DELIVERED\'',
      [riderId],
    );
    return result;
  }
  async nearby(
    query: NearbyDto,
    vehicleType: Vehicle | null,
  ): Promise<NearbyOrder[]> {
    // Haversine distance in meters works on the user's standard PostgreSQL 17 image.
    // Latitude prefilter uses an index; exact radius filtering precedes display rounding.
    return this.tripsRepository.query(
      `SELECT id, package_description AS "packageDescription", vehicle_type AS "vehicleType",
      price_piasters AS "pricePiasters", destination_address AS "destinationAddress", pickup_address AS "pickupAddress",
      pickup_longitude AS longitude, pickup_latitude AS latitude, ROUND(distance)::int AS "distanceMeters"
      FROM (SELECT *, 12742000 * ASIN(SQRT(LEAST(1.0, GREATEST(0.0,
        POWER(SIN(RADIANS(pickup_latitude - $2) / 2), 2) +
        COS(RADIANS($2)) * COS(RADIANS(pickup_latitude)) * POWER(SIN(RADIANS(pickup_longitude - $1) / 2), 2)
      )))) AS distance FROM trips WHERE status = 'OPEN' AND vehicle_type = $4
        AND pickup_latitude BETWEEN $2 - DEGREES($3 / 6371000.0) AND $2 + DEGREES($3 / 6371000.0)) nearby
      WHERE distance <= $3 ORDER BY distance, created_at DESC LIMIT 20`,
      [query.longitude, query.latitude, query.radius, vehicleType],
    );
  }
}
