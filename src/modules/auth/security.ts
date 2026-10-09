import {
  CanActivate,
  createParamDecorator,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import type { Request } from 'express';
import { Role, User } from '../users/user.entity';
import { isUUID } from 'class-validator';

export const Public = () => SetMetadata('public', true);
export const Roles = (...roles: Role[]) => SetMetadata('roles', roles);
export const ApprovedRider = () => SetMetadata('approvedRider', true);
export type Principal = { user: User };
type AuthRequest = Request & { principal: Principal; user: User };
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): Principal =>
    context.switchToHttp().getRequest<AuthRequest>().principal,
);

@Injectable()
export class AccessTokenGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}
  async canActivate(context: ExecutionContext) {
    if (
      this.reflector.getAllAndOverride<boolean>('public', [
        context.getHandler(),
        context.getClass(),
      ])
    )
      return true;
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const [scheme, token, extra] =
      request.headers.authorization?.split(' ') || [];
    if (scheme?.toLowerCase() !== 'bearer' || !token || extra !== undefined)
      throw new UnauthorizedException();
    let payload: { sub: string; version: number; type: string; exp: number };
    try {
      payload = await this.jwt.verifyAsync(token);
    } catch {
      throw new UnauthorizedException();
    }
    if (
      !isUUID(payload.sub) ||
      payload.type !== 'access' ||
      !Number.isInteger(payload.version) ||
      !payload.exp
    )
      throw new UnauthorizedException();
    const user = await this.usersRepository.findOneBy({ id: payload.sub });
    if (
      !user ||
      user.tokenVersion !== payload.version ||
      !user.isActive ||
      !user.phoneVerifiedAt
    )
      throw new UnauthorizedException();
    const roles = this.reflector.getAllAndOverride<Role[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ]);
    if (roles && !roles.includes(user.role))
      throw new ForbiddenException(
        'This endpoint belongs to a different account type.',
      );
    if (
      this.reflector.getAllAndOverride<boolean>('approvedRider', [
        context.getHandler(),
        context.getClass(),
      ]) &&
      (user.role !== Role.RIDER || !user.isRiderVerified)
    )
      throw new ForbiddenException(
        'Your rider account is awaiting manual approval.',
      );
    request.user = user;
    request.principal = { user };
    return true;
  }
}
