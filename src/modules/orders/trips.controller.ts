import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { IsUUID } from 'class-validator';
import { Role } from '../users/user.entity';
import { ApprovedRider, Roles } from '../auth/security';
import { CreateOrderDto } from './create-order.dto';
import { TripsService } from './trips.service';
import {
  ActionDto,
  ChatDto,
  HistoryDto,
  OfferDto,
  TrackingDto,
} from './trip.dto';
class RepeatDto {
  @IsUUID() clientRequestId!: string;
}
@Controller('trips')
export class TripsController {
  constructor(private readonly trips: TripsService) {}
  @Post() @Roles(Role.CUSTOMER) create(@Body() dto: CreateOrderDto) {
    return this.trips.create(dto);
  }
  @Get() list(@Query() dto: HistoryDto) {
    return this.trips.list(dto);
  }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.detail(id);
  }
  @Post(':id/quote') @HttpCode(200) quote(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.quote(id);
  }
  @Post(':id/publish') @HttpCode(200) publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ActionDto,
  ) {
    return this.trips.publish(id, dto);
  }
  @Post(':id/accept') @ApprovedRider() @HttpCode(200) accept(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.accept(id);
  }
  @Post(':id/actions/:action') @HttpCode(200) action(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('action') action: string,
    @Body() dto: ActionDto,
  ) {
    return this.trips.action(id, action, dto);
  }
  @Post(':id/repeat') repeat(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RepeatDto,
  ) {
    return this.trips.repeat(id, dto.clientRequestId);
  }
  @Get(':id/offers') offers(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.offers(id);
  }
  @Post(':id/offers') @ApprovedRider() propose(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: OfferDto,
  ) {
    return this.trips.propose(id, dto);
  }
  @Post(':id/offers/:offerId/accept') @HttpCode(200) acceptOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.trips.respondOffer(id, offerId, true);
  }
  @Post(':id/offers/:offerId/reject') @HttpCode(200) rejectOffer(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('offerId', ParseUUIDPipe) offerId: string,
  ) {
    return this.trips.respondOffer(id, offerId, false);
  }
  @Get(':id/messages') messages(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() dto: HistoryDto,
  ) {
    return this.trips.messages(id, dto);
  }
  @Post(':id/messages') send(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ChatDto,
  ) {
    return this.trips.send(id, dto);
  }
  @Get(':id/map') map(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.map(id);
  }
  @Get(':id/tracking') tracking(@Param('id', ParseUUIDPipe) id: string) {
    return this.trips.tracking(id);
  }
  @Post(':id/tracking/locations') @ApprovedRider() @HttpCode(200) track(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: TrackingDto,
  ) {
    return this.trips.track(id, dto);
  }
}
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly trips: TripsService) {}
  @Get() list() {
    return this.trips.notifications();
  }
  @Post(':id/read') @HttpCode(200) read(
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.trips.readNotification(id);
  }
}
