import {
  BadRequestException,
  ConflictException,
  HttpException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Role, User } from '../users/user.entity';
import {
  RegisterCustomerDto,
  RegisterRiderDto,
  LoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  VerifyCodeDto,
} from './auth.dto';
import { Verification, ChallengePurpose, DeliveryChannel } from './entities';
import { hashPassword, verifyPassword } from './crypto';
import { ChallengesService } from './challenges.service';
import { TokensService } from './tokens.service';

@Injectable()
export class AuthService {
  private dummyHash = hashPassword('not-a-real-account-password');
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
    private readonly challenges: ChallengesService,
    private readonly tokens: TokensService,
  ) {}
  async register(dto: RegisterCustomerDto | RegisterRiderDto, role: Role) {
    const passwordHash = await hashPassword(dto.password);
    try {
      return await this.usersRepository.manager.transaction(async (manager) => {
        const user = await manager.save(
          User,
          manager.create(User, {
            phone: dto.phone,
            fullName: dto.fullName,
            email: dto.email || null,
            passwordHash,
            role,
            isRiderVerified: false,
            phoneVerifiedAt: null,
            emailVerifiedAt: null,
            isActive: true,
            vehicleType:
              role === Role.RIDER && 'vehicleType' in dto
                ? dto.vehicleType
                : null,
          }),
        );
        return this.challenges.issue(
          manager,
          user,
          role,
          ChallengePurpose.SIGNUP,
          DeliveryChannel.WHATSAPP,
        );
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw new ConflictException(
          'An account already uses those details. Please log in or reset your password.',
        );
      throw error;
    }
  }
  async login(dto: LoginDto, role: Role) {
    const user = await this.usersRepository
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.phone = :phone AND u.role = :role', { phone: dto.phone, role })
      .getOne();
    const valid = await verifyPassword(
      dto.password,
      user?.passwordHash || (await this.dummyHash),
    );
    if (!user || !valid || !user.isActive)
      throw new UnauthorizedException('Phone number or password is incorrect.');
    return this.usersRepository.manager.transaction(async (manager) => {
      const current = await manager.findOneOrFail(User, {
        where: { id: user.id },
        lock: { mode: 'pessimistic_write' },
      });
      // Re-read the hash under lock to reject a login racing a completed password reset.
      const credentials = await manager
        .getRepository(User)
        .createQueryBuilder('u')
        .addSelect('u.passwordHash')
        .where('u.id = :id', { id: user.id })
        .getOneOrFail();
      if (credentials.passwordHash !== user.passwordHash || !current.isActive)
        throw new UnauthorizedException();
      if (!current.phoneVerifiedAt)
        return {
          requiresVerification: true,
          ...(await this.challenges.issue(
            manager,
            current,
            role,
            ChallengePurpose.SIGNUP,
            DeliveryChannel.WHATSAPP,
          )),
        };
      return this.tokens.create(manager, current);
    });
  }
  async verify(dto: VerifyCodeDto, role: Role) {
    const result = await this.usersRepository.manager.transaction(
      async (manager) => {
        const challenge = await this.challenges.consume(
          manager,
          dto.challengeId,
          dto.code,
          role,
          ChallengePurpose.SIGNUP,
        );
        if (!challenge?.userId) return null;
        const user = await manager.findOne(User, {
          where: { id: challenge.userId, role },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user || !user.isActive) return null;
        user.phoneVerifiedAt = new Date();
        await manager.save(user);
        return this.tokens.create(manager, user);
      },
    );
    if (!result) return this.challenges.invalidCode();
    return result;
  }
  async resend(challengeId: string, role: Role) {
    return this.usersRepository.manager.transaction(async (manager) => {
      const original = await manager.findOneBy(Verification, {
        id: challengeId,
        role,
      });
      if (
        !original ||
        original.consumedAt ||
        original.purpose !== ChallengePurpose.SIGNUP ||
        !original.userId
      )
        throw new BadRequestException('Start the verification flow again.');
      const user = await manager.findOne(User, {
        where: { id: original.userId, role },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user || !user.isActive || user.phoneVerifiedAt)
        throw new BadRequestException('Start the verification flow again.');
      return this.challenges.issue(
        manager,
        user,
        role,
        original.purpose,
        original.channel,
      );
    });
  }
  async forgotPassword(dto: ForgotPasswordDto, role: Role) {
    return this.usersRepository.manager.transaction(async (manager) => {
      const user = await manager.findOne(User, {
        where: { phone: dto.phone, role },
        lock: { mode: 'pessimistic_write' },
      });
      const eligible =
        user?.isActive &&
        (dto.channel === DeliveryChannel.WHATSAPP ||
          (user.phoneVerifiedAt && user.email && user.emailVerifiedAt));
      try {
        return await this.challenges.issue(
          manager,
          eligible ? user : null,
          role,
          ChallengePurpose.PASSWORD_RESET,
          dto.channel,
        );
      } catch (error) {
        // Keep account existence/rate-limit state private on public recovery requests.
        if (error instanceof HttpException && error.getStatus() === 429)
          return this.challenges.issue(
            manager,
            null,
            role,
            ChallengePurpose.PASSWORD_RESET,
            dto.channel,
          );
        throw error;
      }
    });
  }
  async resetPassword(dto: ResetPasswordDto, role: Role) {
    const passwordHash = await hashPassword(dto.newPassword);
    const success = await this.usersRepository.manager.transaction(
      async (manager) => {
        const challenge = await this.challenges.consume(
          manager,
          dto.challengeId,
          dto.code,
          role,
          ChallengePurpose.PASSWORD_RESET,
        );
        if (!challenge?.userId) return false;
        const user = await manager.findOne(User, {
          where: { id: challenge.userId, role },
          lock: { mode: 'pessimistic_write' },
        });
        if (!user?.isActive) return false;
        user.passwordHash = passwordHash;
        user.tokenVersion += 1;
        await manager.save(user);
        await manager
          .getRepository(Verification)
          .createQueryBuilder()
          .update()
          .set({ consumedAt: new Date() })
          .where('user_id = :id AND consumed_at IS NULL', { id: user.id })
          .execute();
        return true;
      },
    );
    if (!success) this.challenges.invalidCode();
    return { success: true, message: 'Password changed. Please log in again.' };
  }
  async requestEmailVerification(userId: string, role: Role) {
    return this.usersRepository.manager.transaction(async (manager) => {
      const user = await manager.findOneOrFail(User, {
        where: { id: userId, role },
        lock: { mode: 'pessimistic_write' },
      });
      if (!user.email)
        throw new BadRequestException('No recovery email is saved.');
      if (user.emailVerifiedAt)
        throw new BadRequestException(
          'Your recovery email is already verified.',
        );
      return this.challenges.issue(
        manager,
        user,
        role,
        ChallengePurpose.VERIFY_EMAIL,
        DeliveryChannel.EMAIL,
      );
    });
  }
  async verifyEmail(dto: VerifyCodeDto, userId: string, role: Role) {
    const success = await this.usersRepository.manager.transaction(
      async (manager) => {
        const challenge = await this.challenges.consume(
          manager,
          dto.challengeId,
          dto.code,
          role,
          ChallengePurpose.VERIFY_EMAIL,
          userId,
        );
        if (!challenge) return false;
        await manager.update(
          User,
          { id: userId, role },
          { emailVerifiedAt: new Date() },
        );
        return true;
      },
    );
    if (!success) this.challenges.invalidCode();
    return { success: true };
  }
}
