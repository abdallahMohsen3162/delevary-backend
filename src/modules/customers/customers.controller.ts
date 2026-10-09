import { ProfilesService } from '../users/profiles.service';
import { Throttle } from '@nestjs/throttler';
import { UpdateProfileDto } from '../users/profile.dto';
import {
  Delete,
  Param,
  ParseUUIDPipe,
  Patch,
  Body,
  Controller,
  Get,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { CurrentUser, Roles, type Principal } from '../auth/security';
import { Role, publicUser } from '../users/user.entity';
import {
  CoordinatesDto,
  MapImageDto,
  MapSearchDto,
  MapTileDto,
  SaveLocationDto,
} from '../locations/location.dto';
import { LocationsService } from '../locations/locations.service';
import { MapsService } from '../maps/maps.service';
import { TripsService } from '../orders/trips.service';
import { CreateOrderDto } from '../orders/create-order.dto';

@Controller('customers')
@Roles(Role.CUSTOMER)
export class CustomerController {
  constructor(
    private readonly locations: LocationsService,
    private readonly profiles: ProfilesService,
  ) {}
  @Patch('me') update(@Body() dto: UpdateProfileDto) {
    return this.profiles.update(dto);
  }
  @Get('me') async me(@CurrentUser() { user }: Principal) {
    const location = await this.locations.current(user.id);
    return { user: publicUser(user), location, needsLocation: !location };
  }
  @Get('addresses') addresses(@CurrentUser() { user }: Principal) {
    return this.locations.list(user.id);
  }
  @Post('addresses') addAddress(
    @CurrentUser() { user }: Principal,
    @Body() dto: SaveLocationDto,
  ) {
    return this.locations.add(user.id, dto);
  }
  @Delete('addresses/:id') removeAddress(
    @CurrentUser() { user }: Principal,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.locations.remove(user.id, id);
  }
  @Get('me/location') location(@CurrentUser() { user }: Principal) {
    return this.locations.current(user.id);
  }
  @Put('me/location') save(
    @CurrentUser() { user }: Principal,
    @Body() dto: SaveLocationDto,
  ) {
    return this.locations.save(user.id, dto);
  }
}
@Controller('customers/maps')
@Roles(Role.CUSTOMER)
export class CustomerMapsController {
  constructor(private readonly maps: MapsService) {}
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
  @Get('image') image(@Query() dto: MapImageDto) {
    return this.maps.image(dto);
  }
}
@Controller('customers/orders')
@Roles(Role.CUSTOMER)
export class CustomerOrdersController {
  constructor(private readonly orders: TripsService) {}
  @Post() create(@Body() dto: CreateOrderDto) {
    return this.orders.create(dto);
  }
}
