import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../../config/config';
import { Verification, DeliveryChannel } from '../auth/entities';
import { MessageJob } from './message-job.entity';
import {
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { decryptMessage } from '../auth/crypto';
import {
  EmailProvider,
  OpenWaProvider,
  type MessagePayload,
} from './providers';
@Injectable()
export class MessageWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: NodeJS.Timeout;
  private busy = false;
  private readonly logger = new Logger(MessageWorker.name);
  constructor(
    @InjectRepository(MessageJob)
    private readonly jobsRepository: Repository<MessageJob>,
    @InjectRepository(Verification)
    private readonly verificationsRepository: Repository<Verification>,
    @Inject(CONFIG) private readonly config: AppConfig,
    private readonly whatsapp: OpenWaProvider,
    private readonly email: EmailProvider,
  ) {}
  onModuleInit() {
    if (this.config.NODE_ENV !== 'test')
      this.timer = setInterval(() => {
        void this.tick();
      }, 1500);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }
  async tick() {
    if (this.busy) return;
    this.busy = true;
    try {
      await this.jobsRepository
        .createQueryBuilder()
        .update()
        .set({ status: 'SKIPPED', payloadCiphertext: null })
        .where('status = :status AND expires_at <= NOW()', { status: 'QUEUED' })
        .execute();
      const job = await this.jobsRepository.manager.transaction(
        async (manager) => {
          const entry = await manager
            .getRepository(MessageJob)
            .createQueryBuilder('job')
            .addSelect('job.payloadCiphertext')
            .where(
              'job.status = :status AND job.next_attempt_at <= NOW() AND (job.locked_until IS NULL OR job.locked_until < NOW())',
              { status: 'QUEUED' },
            )
            .orderBy('job.created_at', 'ASC')
            .setLock('pessimistic_write')
            .setOnLocked('skip_locked')
            .getOne();
          if (!entry) return null;
          entry.lockedUntil = new Date(Date.now() + 60_000);
          entry.attempts += 1;
          await manager.save(entry);
          return entry;
        },
      );
      if (!job) return;
      const challenge = await this.verificationsRepository.findOneBy({
        id: job.challengeId,
      });
      if (
        !challenge ||
        challenge.consumedAt ||
        challenge.expiresAt.getTime() <= Date.now() ||
        !job.payloadCiphertext
      ) {
        await this.jobsRepository.update(job.id, {
          status: 'SKIPPED',
          payloadCiphertext: null,
          lockedUntil: null,
        });
        return;
      }
      try {
        const payload = JSON.parse(
          decryptMessage(
            job.payloadCiphertext,
            this.config.MESSAGE_ENCRYPTION_KEY,
          ),
        ) as MessagePayload;
        await (
          job.channel === DeliveryChannel.EMAIL ? this.email : this.whatsapp
        ).send(payload, job.id);
        await this.jobsRepository.update(job.id, {
          status: 'SENT',
          sentAt: new Date(),
          payloadCiphertext: null,
          lockedUntil: null,
          lastError: null,
        });
      } catch {
        await this.jobsRepository.update(job.id, {
          status: job.attempts >= 5 ? 'FAILED' : 'QUEUED',
          ...(job.attempts >= 5 ? { payloadCiphertext: null } : {}),
          lockedUntil: null,
          nextAttemptAt: new Date(
            Date.now() + Math.min(60_000, 2000 * 2 ** job.attempts),
          ),
          lastError: 'PROVIDER_UNAVAILABLE',
        });
        this.logger.warn(
          `Message delivery ${job.id} failed; attempt ${job.attempts}. No message content logged.`,
        );
      }
    } catch {
      this.logger.error('Message queue processing failed');
    } finally {
      this.busy = false;
    }
  }
}
