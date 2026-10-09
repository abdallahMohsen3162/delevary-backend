import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserAddress, addressView } from './user-address.entity';
import { SaveLocationDto } from './location.dto';
import { User } from '../users/user.entity';
@Injectable()
export class LocationsService {
  constructor(
    @InjectRepository(UserAddress)
    private readonly addressesRepository: Repository<UserAddress>,
  ) {}
  async current(userId: string) {
    return addressView(
      await this.addressesRepository.findOneBy({ userId, isDefault: true }),
    );
  }
  async save(userId: string, dto: SaveLocationDto) {
    await this.addressesRepository.manager.transaction(async (manager) => {
      await manager.findOneOrFail(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = await manager.findOneBy(UserAddress, {
        userId,
        isDefault: true,
      });
      await manager.save(UserAddress, {
        ...current,
        ...dto,
        userId,
        isDefault: true,
        label: dto.label || 'Current location',
        addressText: dto.addressText.trim(),
      });
    });
    return this.current(userId);
  }
  async list(userId: string) {
    return (
      await this.addressesRepository.find({
        where: { userId, isDefault: false },
        order: { updatedAt: 'DESC' },
        take: 50,
      })
    ).map(addressView);
  }
  async add(userId: string, dto: SaveLocationDto) {
    return this.addressesRepository.manager.transaction(async (manager) => {
      await manager.findOneOrFail(User, {
        where: { id: userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        (await manager.count(UserAddress, {
          where: { userId, isDefault: false },
        })) >= 50
      )
        throw new ConflictException('You can save up to 50 places.');
      return addressView(
        await manager.save(
          UserAddress,
          manager.create(UserAddress, {
            ...dto,
            label: dto.label || 'Saved destination',
            userId,
            isDefault: false,
          }),
        ),
      );
    });
  }
  async remove(userId: string, id: string) {
    const result = await this.addressesRepository.delete({
      id,
      userId,
      isDefault: false,
    });
    if (!result.affected) throw new NotFoundException('Saved place not found.');
    return { success: true };
  }
}
