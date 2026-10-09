import {
  Inject,
  Injectable,
  Scope,
  UnauthorizedException,
} from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import type { Request } from 'express';
import type { User } from '../users/user.entity';

/** Injectable in application services; the global token guard populates request.user. */
@Injectable({ scope: Scope.REQUEST })
export class UserContext {
  constructor(
    @Inject(REQUEST) private readonly request: Request & { user?: User },
  ) {}
  get user(): User {
    if (!this.request.user) throw new UnauthorizedException();
    return this.request.user;
  }
}
