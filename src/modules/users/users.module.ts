import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from './user.entity';
import { Module } from '@nestjs/common';
import { ProfilesService } from './profiles.service';
@Module({
  imports: [TypeOrmModule.forFeature([User])],
  providers: [ProfilesService],
  exports: [ProfilesService],
})
export class UsersModule {}
