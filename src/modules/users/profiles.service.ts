import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserContext } from '../auth/user-context';
import { Role, User, publicUser } from './user.entity';
import { UpdateProfileDto } from './profile.dto';
import { Verification, ChallengePurpose } from '../auth/entities';

@Injectable()
export class ProfilesService {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly context: UserContext,
  ) {}
  async update(dto: UpdateProfileDto) {
    try {
      return await this.usersRepository.manager.transaction(async (manager) => {
        const user = await manager.findOneOrFail(User, {
          where: { id: this.context.user.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (
          user.role !== Role.RIDER &&
          (dto.vehicleType !== undefined || dto.isOnline !== undefined)
        )
          throw new BadRequestException(
            'Vehicle and availability are rider settings.',
          );
        if (dto.isOnline && !user.isRiderVerified)
          throw new BadRequestException(
            'Your rider account is awaiting approval.',
          );
        if (dto.vehicleType && dto.vehicleType !== user.vehicleType) {
          const active = await manager.query<{ id: string }[]>(
            "SELECT id FROM trips WHERE rider_id=$1 AND status NOT IN ('DELIVERED','CANCELLED','FAILED') LIMIT 1",
            [user.id],
          );
          if (active.length)
            throw new ConflictException(
              'Finish your active trip before changing vehicles.',
            );
          user.vehicleType = dto.vehicleType;
        }
        if (dto.fullName !== undefined) user.fullName = dto.fullName;
        if (dto.email !== undefined && dto.email !== user.email) {
          user.email = dto.email;
          user.emailVerifiedAt = null;
          await manager.update(
            Verification,
            { userId: user.id, purpose: ChallengePurpose.VERIFY_EMAIL },
            { consumedAt: new Date() },
          );
        }
        if (dto.isOnline !== undefined) user.isOnline = dto.isOnline;
        return { user: publicUser(await manager.save(user)) };
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException('That email is already in use.');
      throw error;
    }
  }
}
