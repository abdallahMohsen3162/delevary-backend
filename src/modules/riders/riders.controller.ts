import { ProfilesService } from '../users/profiles.service';
import { Throttle } from '@nestjs/throttler';
import { UpdateProfileDto } from '../users/profile.dto';
import { Patch, Body, Controller, Get, Query } from '@nestjs/common';
import {
  ApprovedRider,
  CurrentUser,
  Roles,
  type Principal,
} from '../auth/security';
import { Role, publicUser } from '../users/user.entity';
import {
  CoordinatesDto,
  MapImageDto,
  MapSearchDto,
  MapTileDto,
  NearbyDto,
} from '../locations/location.dto';
import { MapsService } from '../maps/maps.service';
import { OrdersService } from '../orders/orders.service';

@Controller('riders')
@Roles(Role.RIDER)
export class RiderController {
  constructor(
    private readonly profiles: ProfilesService,
    private readonly orders: OrdersService,
  ) {}
  @Get('earnings') earnings(@CurrentUser() { user }: Principal) {
    return this.orders.earnings(user.id);
  }
  @Patch('me') update(@Body() dto: UpdateProfileDto) {
    return this.profiles.update(dto);
  }
  @Get('me') me(@CurrentUser() { user }: Principal) {
    return { user: publicUser(user), awaitingApproval: !user.isRiderVerified };
  }
}
@Controller('riders/orders')
@Roles(Role.RIDER)
@ApprovedRider()
export class RiderOrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get('nearby') nearby(
    @CurrentUser() { user }: Principal,
    @Query() dto: NearbyDto,
  ) {
    return this.orders.nearby(dto, user.vehicleType);
  }
}
@Controller('riders/maps')
@Roles(Role.RIDER)
@ApprovedRider()
export class RiderMapsController {
  constructor(
    private readonly maps: MapsService,
    private readonly orders: OrdersService,
  ) {}
  @Get('tiles')
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  tile(@Query() dto: MapTileDto) {
    return this.maps.tile(dto);
  }
  @Get('search') search(@Query() dto: MapSearchDto) {
    return this.maps.search(dto.q);
  }
  @Get('reverse') reverse(@Query() dto: CoordinatesDto) {
    return this.maps.reverse(dto);
  }
  @Get('image') async image(
    @CurrentUser() { user }: Principal,
    @Query() dto: MapImageDto,
  ) {
    const nearby = await this.orders.nearby(
      { ...dto, radius: 5000 },
      user.vehicleType,
    );
    return this.maps.image(dto, nearby);
  }
}
