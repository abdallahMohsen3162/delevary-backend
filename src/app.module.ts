import {
  Controller,
  Get,
  Module,
  ServiceUnavailableException,
} from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { InjectRepository, TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { DataSource, Repository } from 'typeorm';
import { User } from './modules/users/user.entity';
import { ConfigurationModule, CONFIG, type AppConfig } from './config/config';
import { databaseOptions } from './database/data-source';
import { TokenTripWorkflows1791700000000 } from './database/migrations/token-trip-workflows';
import { AuthModule } from './modules/auth/auth.module';
import { Public, AccessTokenGuard } from './modules/auth/security';
import { CustomersModule } from './modules/customers/customers.module';
import { RidersModule } from './modules/riders/riders.module';

@Controller('health')
class HealthController {
  constructor(
    @InjectRepository(User) private readonly usersRepository: Repository<User>,
  ) {}
  @Public() @Get() async health() {
    try {
      await this.usersRepository.query('SELECT 1');
      return { status: 'ok', database: 'connected' };
    } catch {
      throw new ServiceUnavailableException('Database unavailable');
    }
  }
}
@Module({
  imports: [
    ConfigurationModule,
    TypeOrmModule.forRootAsync({
      dataSourceFactory: async (options) => {
        if (!options) throw new Error('Database configuration missing');
        if (!options.synchronize) return new DataSource(options).initialize();
        // Upgrade the existing local synchronize schema before TypeORM compares it.
        const db = await new DataSource({
          ...options,
          synchronize: false,
          migrationsRun: false,
        }).initialize();
        try {
          const [{ existing }] = await db.query<{ existing: boolean }[]>(
            "SELECT to_regclass('users') IS NOT NULL AS existing",
          );
          if (existing) {
            const runner = db.createQueryRunner();
            await runner.connect();
            await runner.startTransaction();
            try {
              await new TokenTripWorkflows1791700000000().up(runner);
              await runner.commitTransaction();
            } catch (error) {
              await runner.rollbackTransaction();
              throw error;
            } finally {
              await runner.release();
            }
          } else await db.runMigrations();
          await db.synchronize();
          return db;
        } catch (error) {
          await db.destroy();
          throw error;
        }
      },
      inject: [CONFIG],
      useFactory: (config: AppConfig) => ({
        ...databaseOptions(config),
        retryAttempts: 3,
        retryDelay: 2000,
      }),
    }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 90 }]),
    AuthModule,
    CustomersModule,
    RidersModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: AccessTokenGuard },
  ],
})
export class AppModule {}
