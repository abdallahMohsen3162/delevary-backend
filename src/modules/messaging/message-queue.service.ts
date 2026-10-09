import { Inject, Injectable } from '@nestjs/common';
import { CONFIG, type AppConfig } from '../../config/config';
import { Verification } from '../auth/entities';
import { MessageJob } from './message-job.entity';
import { EntityManager } from 'typeorm';
import { encryptMessage } from '../auth/crypto';
@Injectable()
export class MessageQueue {
  constructor(@Inject(CONFIG) private readonly config: AppConfig) {}
  async enqueue(
    manager: EntityManager,
    challenge: Verification,
    destination: string,
    code: string,
  ) {
    const text = `Your Wasel code is ${code}. It expires in 5 minutes. Do not share it with anyone.`;
    await manager.save(
      MessageJob,
      manager.create(MessageJob, {
        challengeId: challenge.id,
        channel: challenge.channel,
        payloadCiphertext: encryptMessage(
          JSON.stringify({ destination, text }),
          this.config.MESSAGE_ENCRYPTION_KEY,
        ),
        status: 'QUEUED',
        attempts: 0,
        nextAttemptAt: new Date(),
        expiresAt: challenge.expiresAt,
      }),
    );
  }
}
