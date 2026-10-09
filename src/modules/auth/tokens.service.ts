import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { EntityManager } from 'typeorm';
import { Role, User, publicUser } from '../users/user.entity';
import { UserAddress } from '../locations/user-address.entity';

// Access tokens are self-contained. There are no server sessions or refresh tokens.
@Injectable()
export class TokensService {
  constructor(private readonly jwt: JwtService) {}
  async create(manager: EntityManager, user: User) {
    return {
      access_token: await this.jwt.signAsync({
        sub: user.id,
        version: user.tokenVersion,
        type: 'access',
      }),
      token_type: 'Bearer',
      expiresInSeconds: 604800,
      user: publicUser(user),
      needsLocation:
        user.role === Role.CUSTOMER &&
        !(await manager.exists(UserAddress, {
          where: { userId: user.id, isDefault: true },
        })),
    };
  }
}
