import { TypeOrmModule } from '@nestjs/typeorm';
import { UserAddress } from './user-address.entity';
import { Module } from '@nestjs/common';
import { LocationsService } from './locations.service';
export { LocationsService } from './locations.service';
@Module({
  imports: [TypeOrmModule.forFeature([UserAddress])],
  providers: [LocationsService],
  exports: [LocationsService],
})
export class LocationsModule {}
