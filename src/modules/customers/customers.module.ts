import { UsersModule } from '../users/users.module';
import { Module } from '@nestjs/common';
import { LocationsModule } from '../locations/locations.module';
import { MapsModule } from '../maps/maps.module';
import { OrdersModule } from '../orders/orders.module';
import {
  CustomerController,
  CustomerMapsController,
  CustomerOrdersController,
} from './customers.controller';
@Module({
  imports: [UsersModule, LocationsModule, MapsModule, OrdersModule],
  controllers: [
    CustomerController,
    CustomerMapsController,
    CustomerOrdersController,
  ],
})
export class CustomersModule {}
