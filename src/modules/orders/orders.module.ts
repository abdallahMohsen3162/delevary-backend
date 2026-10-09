import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { DeliveryOrder } from './order.entity';
import { MapsModule } from '../maps/maps.module';
import { TripsService } from './trips.service';
import { TripsController, NotificationsController } from './trips.controller';
import { Module } from '@nestjs/common';
import { OrdersService } from './orders.service';
export { OrdersService } from './orders.service';
export { CreateOrderDto } from './create-order.dto';
@Module({
  imports: [TypeOrmModule.forFeature([DeliveryOrder, User]), MapsModule],
  controllers: [TripsController, NotificationsController],
  providers: [OrdersService, TripsService],
  exports: [OrdersService, TripsService],
})
export class OrdersModule {}
