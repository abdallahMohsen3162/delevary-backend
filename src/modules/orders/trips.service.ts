import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository, EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserContext } from '../auth/user-context';
import { Role, User, Vehicle } from '../users/user.entity';
import { UserAddress } from '../locations/user-address.entity';
import { MapsService } from '../maps/maps.service';
import { DeliveryOrder } from './order.entity';
import { CreateOrderDto } from './create-order.dto';
import {
  ActionDto,
  ChatDto,
  HistoryDto,
  OfferDto,
  TrackingDto,
} from './trip.dto';
import { nextStatus, terminal } from './trip-policy';

@Injectable()
export class TripsService {
  constructor(
    @InjectRepository(DeliveryOrder)
    private readonly tripsRepository: Repository<DeliveryOrder>,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly context: UserContext,
    private readonly maps: MapsService,
  ) {}
  private get user() {
    return this.context.user;
  }
  private async trip(manager: EntityManager, id: string, lock = false) {
    const trip = await manager.findOne(DeliveryOrder, {
      where: { id },
      ...(lock ? { lock: { mode: 'pessimistic_write' as const } } : {}),
    });
    if (!trip) throw new NotFoundException('Trip not found.');
    return trip;
  }
  private participant(trip: DeliveryOrder) {
    if (trip.customerId !== this.user.id && trip.riderId !== this.user.id)
      throw new NotFoundException('Trip not found.');
  }
  private owner(trip: DeliveryOrder) {
    if (trip.customerId !== this.user.id) throw new ForbiddenException();
  }
  private async eligible(
    manager: EntityManager,
    id: string,
    trip: DeliveryOrder,
  ) {
    const rider = await manager.findOne(User, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (
      !rider ||
      rider.role !== Role.RIDER ||
      !rider.isActive ||
      !rider.phoneVerifiedAt ||
      !rider.isRiderVerified ||
      !rider.isOnline ||
      rider.vehicleType !== trip.vehicleType
    )
      throw new ConflictException(
        'Rider must be approved, online, and have the matching vehicle.',
      );
    const busy = await manager.query<{ id: string }[]>(
      "SELECT id FROM trips WHERE rider_id=$1 AND status NOT IN ('DELIVERED','CANCELLED','FAILED') LIMIT 1",
      [id],
    );
    if (busy.length)
      throw new ConflictException('This rider already has an active trip.');
    return rider;
  }
  private async history(
    manager: EntityManager,
    trip: DeliveryOrder,
    previous: string | null,
    reason?: string,
  ) {
    await manager.query(
      'INSERT INTO trip_status_history(trip_id,from_status,to_status,changed_by,reason,trip_version) VALUES($1,$2,$3,$4,$5,$6)',
      [
        trip.id,
        previous,
        trip.status,
        this.user.id,
        reason || null,
        trip.version,
      ],
    );
    if (previous && !['DRAFT', 'IN_TRANSIT'].includes(trip.status)) {
      const ids = [trip.customerId, trip.riderId].filter(
        (id) => id && id !== this.user.id,
      );
      for (const id of ids)
        await manager.query(
          'INSERT INTO notifications(user_id,trip_id,title) VALUES($1,$2,$3)',
          [
            id,
            trip.id,
            `Trip ${trip.status.toLowerCase().replaceAll('_', ' ')}`,
          ],
        );
    }
  }
  async create(dto: CreateOrderDto) {
    if (this.user.role !== Role.CUSTOMER) throw new ForbiddenException();
    return this.tripsRepository.manager.transaction(async (manager) => {
      // Serialize creation per customer so a retry cannot create a second trip.
      await manager.findOne(User, {
        where: { id: this.user.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (dto.clientRequestId) {
        const existing = await manager.findOneBy(DeliveryOrder, {
          customerId: this.user.id,
          clientRequestId: dto.clientRequestId,
        });
        if (existing) return existing;
      }
      const pickup =
        dto.pickup ||
        (await manager.findOneBy(UserAddress, {
          userId: this.user.id,
          isDefault: true,
        }));
      if (!pickup)
        throw new BadRequestException('Choose your pickup location first.');
      const trip = await manager.save(
        DeliveryOrder,
        manager.create(DeliveryOrder, {
          customerId: this.user.id,
          clientRequestId: dto.clientRequestId || null,
          status: 'DRAFT',
          version: 1,
          pickupAddress: pickup.addressText,
          pickupLatitude: pickup.latitude,
          pickupLongitude: pickup.longitude,
          destinationAddress: dto.destination.addressText,
          destinationLatitude: dto.destination.latitude,
          destinationLongitude: dto.destination.longitude,
          recipientName: dto.recipientName,
          recipientPhone: dto.recipientPhone,
          packageDescription: dto.packageDescription,
          vehicleType: dto.vehicleType,
          deliveryInstructions: dto.deliveryInstructions || '',
        }),
      );
      await this.history(manager, trip, null);
      return trip;
    });
  }
  async list(query: HistoryDto) {
    const where =
      this.user.role === Role.CUSTOMER
        ? { customerId: this.user.id }
        : { riderId: this.user.id };
    const [items, total] = await this.tripsRepository.findAndCount({
      where: { ...where, ...(query.status ? { status: query.status } : {}) },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }
  async detail(id: string) {
    const trip = await this.trip(this.tripsRepository.manager, id);
    this.participant(trip);
    const history = await this.tripsRepository.query<
      { status: string; reason: string | null; createdAt: Date }[]
    >(
      'SELECT to_status AS status, reason, created_at AS "createdAt" FROM trip_status_history WHERE trip_id=$1 ORDER BY trip_version',
      [id],
    );
    const rider = trip.riderId
      ? await this.usersRepository.findOneBy({ id: trip.riderId })
      : null;
    return {
      ...trip,
      history,
      rider: rider
        ? {
            fullName: rider.fullName,
            phone: rider.phone,
            vehicleType: rider.vehicleType,
          }
        : null,
    };
  }
  async quote(id: string) {
    const snapshot = await this.trip(this.tripsRepository.manager, id);
    this.owner(snapshot);
    if (snapshot.status !== 'DRAFT')
      throw new ConflictException('Only draft trips can be priced.');
    const route = await this.maps.route(
      {
        latitude: snapshot.pickupLatitude,
        longitude: snapshot.pickupLongitude,
      },
      {
        latitude: snapshot.destinationLatitude,
        longitude: snapshot.destinationLongitude,
      },
      snapshot.vehicleType === Vehicle.BICYCLE,
    );
    const rules = await this.tripsRepository.query<
      {
        base_fee_piasters: number;
        per_km_piasters: number;
        minimum_fee_piasters: number;
      }[]
    >('SELECT * FROM pricing_rules WHERE vehicle_type=$1 AND active=true', [
      snapshot.vehicleType,
    ]);
    if (!rules.length)
      throw new ConflictException('Pricing is unavailable for this vehicle.');
    const rule = rules[0];
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      this.owner(trip);
      if (trip.status !== 'DRAFT' || trip.version !== snapshot.version)
        throw new ConflictException('Trip changed. Request a new quote.');
      trip.distanceMeters = Math.ceil(route.distance);
      trip.durationSeconds = Math.ceil(route.duration);
      trip.routeGeometry = route.geometry;
      trip.pricePiasters = Math.max(
        rule.minimum_fee_piasters,
        rule.base_fee_piasters +
          Math.ceil((trip.distanceMeters * rule.per_km_piasters) / 1000),
      );
      trip.quoteExpiresAt = new Date(Date.now() + 10 * 60_000);
      return manager.save(trip);
    });
  }
  async publish(id: string, dto: ActionDto) {
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      this.owner(trip);
      if (trip.status === 'OPEN' && trip.version === dto.version + 1)
        return trip;
      if (
        trip.status !== 'DRAFT' ||
        trip.version !== dto.version ||
        !trip.pricePiasters ||
        !trip.quoteExpiresAt ||
        trip.quoteExpiresAt.getTime() < Date.now()
      )
        throw new ConflictException('Request a fresh quote before publishing.');
      trip.status = 'OPEN';
      trip.version++;
      await manager.save(trip);
      await this.history(manager, trip, 'DRAFT');
      return trip;
    });
  }
  async accept(id: string) {
    if (this.user.role !== Role.RIDER) throw new ForbiddenException();
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      if (trip.status === 'ASSIGNED' && trip.riderId === this.user.id)
        return trip;
      if (trip.status !== 'OPEN' || !trip.pricePiasters)
        throw new ConflictException('This trip is no longer available.');
      await this.eligible(manager, this.user.id, trip);
      return this.assign(manager, trip, this.user.id, trip.pricePiasters);
    });
  }
  private async assign(
    manager: EntityManager,
    trip: DeliveryOrder,
    riderId: string,
    price: number,
  ) {
    trip.riderId = riderId;
    trip.pricePiasters = price;
    trip.status = 'ASSIGNED';
    trip.version++;
    await manager.save(trip);
    await manager.query(
      "UPDATE trip_price_proposals SET status='SUPERSEDED',responded_at=now() WHERE trip_id=$1 AND status='PENDING'",
      [trip.id],
    );
    await this.history(manager, trip, 'OPEN');
    return trip;
  }
  async action(id: string, action: string, dto: ActionDto) {
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      this.participant(trip);
      if (trip.version !== dto.version)
        throw new ConflictException('Trip changed. Refresh before continuing.');
      const previous = trip.status;
      trip.status = nextStatus(trip, this.user, action, dto.reason);
      trip.version++;
      if (action === 'start') trip.startedAt = new Date();
      if (action === 'confirm-pickup') trip.pickedUpAt = new Date();
      if (action === 'complete') trip.deliveredAt = new Date();
      if (action === 'cancel') trip.cancelledAt = new Date();
      await manager.save(trip);
      await this.history(manager, trip, previous, dto.reason);
      return trip;
    });
  }
  async repeat(id: string, clientRequestId: string) {
    const trip = await this.trip(this.tripsRepository.manager, id);
    this.owner(trip);
    return this.create({
      clientRequestId,
      pickup: {
        latitude: trip.pickupLatitude,
        longitude: trip.pickupLongitude,
        addressText: trip.pickupAddress,
      },
      destination: {
        latitude: trip.destinationLatitude,
        longitude: trip.destinationLongitude,
        addressText: trip.destinationAddress,
      },
      vehicleType: trip.vehicleType,
      recipientName: trip.recipientName,
      recipientPhone: trip.recipientPhone,
      packageDescription: trip.packageDescription,
      deliveryInstructions: trip.deliveryInstructions,
    });
  }
  async offers(id: string) {
    const trip = await this.trip(this.tripsRepository.manager, id);
    this.owner(trip);
    return this.tripsRepository.query<
      {
        id: string;
        amountPiasters: number;
        reason: string | null;
        status: string;
        expiresAt: Date;
        riderName: string;
      }[]
    >(
      'SELECT p.id,p.amount_piasters AS "amountPiasters",p.reason,CASE WHEN p.status=\'PENDING\' AND p.expires_at<now() THEN \'EXPIRED\' ELSE p.status END AS status,p.expires_at AS "expiresAt",u.full_name AS "riderName" FROM trip_price_proposals p JOIN users u ON u.id=p.proposed_by WHERE p.trip_id=$1 ORDER BY p.created_at DESC',
      [id],
    );
  }
  async propose(id: string, dto: OfferDto) {
    if (this.user.role !== Role.RIDER) throw new ForbiddenException();
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      if (trip.status !== 'OPEN')
        throw new ConflictException('This trip is no longer available.');
      await this.eligible(manager, this.user.id, trip);
      await manager.query(
        "UPDATE trip_price_proposals SET status='SUPERSEDED',responded_at=now() WHERE trip_id=$1 AND proposed_by=$2 AND status='PENDING'",
        [id, this.user.id],
      );
      const [offer] = await manager.query<{ id: string }[]>(
        "INSERT INTO trip_price_proposals(trip_id,proposed_by,amount_piasters,reason,expires_at) VALUES($1,$2,$3,$4,now()+interval '10 minutes') RETURNING id",
        [id, this.user.id, dto.amountPiasters, dto.reason || null],
      );
      await manager.query(
        'INSERT INTO notifications(user_id,trip_id,title) VALUES($1,$2,$3)',
        [trip.customerId, id, 'New delivery price proposal'],
      );
      return offer;
    });
  }
  async respondOffer(id: string, offerId: string, accept: boolean) {
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      this.owner(trip);
      const [offer] = await manager.query<
        { proposed_by: string; amount_piasters: number }[]
      >(
        "SELECT * FROM trip_price_proposals WHERE id=$1 AND trip_id=$2 AND status='PENDING' AND expires_at>now() FOR UPDATE",
        [offerId, id],
      );
      if (!offer || trip.status !== 'OPEN')
        throw new ConflictException('This offer is no longer available.');
      if (accept) {
        await this.eligible(manager, offer.proposed_by, trip);
        await this.assign(
          manager,
          trip,
          offer.proposed_by,
          offer.amount_piasters,
        );
      }
      await manager.query(
        'UPDATE trip_price_proposals SET status=$1,responded_at=now() WHERE id=$2',
        [accept ? 'ACCEPTED' : 'REJECTED', offerId],
      );
      return trip;
    });
  }
  async messages(id: string, query: HistoryDto) {
    const trip = await this.trip(this.tripsRepository.manager, id);
    this.participant(trip);
    if (!trip.riderId) return [];
    return this.tripsRepository.query<
      { id: string; senderId: string; body: string; createdAt: Date }[]
    >(
      'SELECT id,sender_id AS "senderId",body,created_at AS "createdAt" FROM trip_messages WHERE trip_id=$1 ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3',
      [id, query.limit, (query.page - 1) * query.limit],
    );
  }
  async send(id: string, dto: ChatDto) {
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      this.participant(trip);
      if (!trip.riderId || terminal.includes(trip.status))
        throw new ConflictException(
          'Chat is available during assigned, active trips.',
        );
      const [message] = await manager.query<{ id: string }[]>(
        'INSERT INTO trip_messages(trip_id,sender_id,client_message_id,body) VALUES($1,$2,$3,$4) ON CONFLICT(trip_id,sender_id,client_message_id) DO UPDATE SET body=trip_messages.body RETURNING id',
        [id, this.user.id, dto.clientMessageId, dto.body],
      );
      return message;
    });
  }
  async tracking(id: string) {
    const trip = await this.trip(this.tripsRepository.manager, id);
    this.participant(trip);
    const [location] = await this.tripsRepository.query<
      {
        latitude: number;
        longitude: number;
        accuracy: number;
        sequence: number;
        recordedAt: Date;
        receivedAt: Date;
      }[]
    >(
      'SELECT latitude,longitude,accuracy,sequence,recorded_at AS "recordedAt",received_at AS "receivedAt" FROM trip_live_locations WHERE trip_id=$1',
      [id],
    );
    return {
      location: location || null,
      status: trip.status,
      version: trip.version,
      serverTime: new Date(),
      route: trip.routeGeometry,
    };
  }
  async track(id: string, dto: TrackingDto) {
    const time = new Date(dto.recordedAt).getTime();
    if (time > Date.now() + 10_000 || time < Date.now() - 60_000)
      throw new BadRequestException(
        'Location timestamp is stale or in the future.',
      );
    return this.tripsRepository.manager.transaction(async (manager) => {
      const trip = await this.trip(manager, id, true);
      if (trip.riderId !== this.user.id || !this.user.isRiderVerified)
        throw new ForbiddenException();
      if (!trip.startedAt || terminal.includes(trip.status))
        throw new ConflictException(
          'Tracking is only available on a started, active trip.',
        );
      const [last] = await manager.query<
        {
          sequence: number;
          recorded_at: Date;
          latitude: number;
          longitude: number;
          update_id: string;
        }[]
      >('SELECT * FROM trip_live_locations WHERE trip_id=$1', [id]);
      if (
        last &&
        (dto.sequence <= last.sequence ||
          dto.updateId === last.update_id ||
          time <= last.recorded_at.getTime())
      )
        return { sequence: last.sequence, accepted: false };
      if (last) {
        const meters = Math.hypot(
          (dto.latitude - last.latitude) * 111320,
          (dto.longitude - last.longitude) *
            111320 *
            Math.cos((dto.latitude * Math.PI) / 180),
        );
        if (meters > 300 + ((time - last.recorded_at.getTime()) / 1000) * 65)
          throw new BadRequestException(
            'GPS jumped too far. Wait for an accurate fix.',
          );
      }
      await manager.query(
        'INSERT INTO trip_live_locations(trip_id,rider_id,update_id,sequence,latitude,longitude,accuracy,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(trip_id) DO UPDATE SET update_id=$3,sequence=$4,latitude=$5,longitude=$6,accuracy=$7,recorded_at=$8,received_at=now()',
        [
          id,
          this.user.id,
          dto.updateId,
          dto.sequence,
          dto.latitude,
          dto.longitude,
          dto.accuracy,
          dto.recordedAt,
        ],
      );
      await manager.query(
        "INSERT INTO trip_location_history(trip_id,rider_id,latitude,longitude,accuracy,recorded_at) SELECT $1,$2,$3,$4,$5,$6 WHERE NOT EXISTS(SELECT 1 FROM trip_location_history WHERE trip_id=$1 AND received_at>now()-interval '30 seconds')",
        [
          id,
          this.user.id,
          dto.latitude,
          dto.longitude,
          dto.accuracy,
          dto.recordedAt,
        ],
      );
      return { sequence: dto.sequence, accepted: true };
    });
  }
  async map(id: string) {
    const trip = await this.trip(this.tripsRepository.manager, id);
    this.participant(trip);
    const [location] = await this.tripsRepository.query<
      { latitude: number; longitude: number }[]
    >('SELECT latitude,longitude FROM trip_live_locations WHERE trip_id=$1', [
      id,
    ]);
    return this.maps.tripImage(
      [
        { latitude: trip.pickupLatitude, longitude: trip.pickupLongitude },
        {
          latitude: trip.destinationLatitude,
          longitude: trip.destinationLongitude,
        },
        ...(location ? [location] : []),
      ],
      trip.routeGeometry,
    );
  }
  async notifications() {
    return this.tripsRepository.query<
      {
        id: string;
        tripId: string;
        title: string;
        readAt: Date | null;
        createdAt: Date;
      }[]
    >(
      'SELECT id,trip_id AS "tripId",title,read_at AS "readAt",created_at AS "createdAt" FROM notifications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 50',
      [this.user.id],
    );
  }
  async readNotification(id: string) {
    await this.tripsRepository.query(
      'UPDATE notifications SET read_at=now() WHERE id=$1 AND user_id=$2',
      [id, this.user.id],
    );
    return { success: true };
  }
}
