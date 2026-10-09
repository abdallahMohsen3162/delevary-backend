import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/user.entity';
import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { CONFIG, type AppConfig } from '../../config/config';
import { MessagingModule } from '../messaging/messaging.module';
import { UserContext } from './user-context';
import { AuthService } from './auth.service';
import { ChallengesService } from './challenges.service';
import { TokensService } from './tokens.service';
import { CustomerAuthController } from './customer-auth.controller';
import { RiderAuthController } from './rider-auth.controller';

@Global()
@Module({
  imports: [
    TypeOrmModule.forFeature([User]),
    MessagingModule,
    JwtModule.registerAsync({
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        secret: config.JWT_SECRET,
        signOptions: {
          expiresIn: '7d',
          issuer: 'wasel-api',
          audience: 'wasel-mobile',
        },
        verifyOptions: {
          issuer: 'wasel-api',
          audience: 'wasel-mobile',
          algorithms: ['HS256'],
        },
      }),
    }),
  ],
  controllers: [CustomerAuthController, RiderAuthController],
  providers: [AuthService, ChallengesService, TokensService, UserContext],
  exports: [JwtModule, UserContext, TypeOrmModule],
})
export class AuthModule {}
