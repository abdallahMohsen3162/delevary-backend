import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageJob } from './message-job.entity';
import { Verification } from '../auth/entities';
import { Module } from '@nestjs/common';
import { MessageQueue } from './message-queue.service';
import { MessageWorker } from './message-worker.service';
import { EmailProvider, OpenWaProvider } from './providers';
export { MessageQueue } from './message-queue.service';
@Module({
  imports: [TypeOrmModule.forFeature([MessageJob, Verification])],
  providers: [MessageQueue, MessageWorker, OpenWaProvider, EmailProvider],
  exports: [MessageQueue],
})
export class MessagingModule {}
