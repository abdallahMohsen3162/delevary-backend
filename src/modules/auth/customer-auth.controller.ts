import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Role } from '../users/user.entity';
import { AuthService } from './auth.service';
import { Public, Roles, CurrentUser, type Principal } from './security';
import {
  RegisterCustomerDto,
  LoginDto,
  VerifyCodeDto,
  ChallengeIdDto,
  ForgotPasswordDto,
  ResetPasswordDto,
} from './auth.dto';

@Controller('customers/auth')
@Roles(Role.CUSTOMER)
@Throttle({ default: { limit: 10, ttl: 60_000 } })
export class CustomerAuthController {
  constructor(private readonly auth: AuthService) {}
  @Public()
  @Post('register')
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  register(@Body() dto: RegisterCustomerDto) {
    return this.auth.register(dto, Role.CUSTOMER);
  }
  @Public()
  @Post('verify')
  @HttpCode(200)
  verify(@Body() dto: VerifyCodeDto) {
    return this.auth.verify(dto, Role.CUSTOMER);
  }
  @Public()
  @Post('login')
  @HttpCode(200)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto, Role.CUSTOMER);
  }
  @Public()
  @Post('otp/resend')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  resend(@Body() dto: ChallengeIdDto) {
    return this.auth.resend(dto.challengeId, Role.CUSTOMER);
  }
  @Public()
  @Post('password/forgot')
  @HttpCode(200)
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  forgot(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto, Role.CUSTOMER);
  }
  @Public()
  @Post('password/reset')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto, Role.CUSTOMER);
  }
  @Post('email/request-verification')
  @HttpCode(200)
  requestEmail(@CurrentUser() principal: Principal) {
    return this.auth.requestEmailVerification(principal.user.id, Role.CUSTOMER);
  }
  @Post('email/verify')
  @HttpCode(200)
  verifyEmail(@CurrentUser() principal: Principal, @Body() dto: VerifyCodeDto) {
    return this.auth.verifyEmail(dto, principal.user.id, Role.CUSTOMER);
  }
}
