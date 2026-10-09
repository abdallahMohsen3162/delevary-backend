import { UsersModule } from '../users/users.module';
import { Module } from '@nestjs/common';
import { MapsModule } from '../maps/maps.module';
import { OrdersModule } from '../orders/orders.module';
import {
  RiderController,
  RiderOrdersController,
  RiderMapsController,
} from './riders.controller';
@Module({
  imports: [UsersModule, MapsModule, OrdersModule],
  controllers: [RiderController, RiderOrdersController, RiderMapsController],
})
export class RidersModule {}
