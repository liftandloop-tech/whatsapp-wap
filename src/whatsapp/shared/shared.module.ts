import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * 🧠 SharedModule
 *
 * Provides globally available infrastructure clients (Redis, etc.)
 * to all modules in the engine without circular dependency issues.
 *
 * Decorated with @Global() so any module that imports SharedModule
 * will have access to REDIS_CLIENT without re-declaring it.
 */
import { WhatsappGateway } from '../gateways/whatsapp.gateway';

@Global()
@Module({
  providers: [
    WhatsappGateway,
    {
      provide: 'REDIS_CLIENT',
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis => {
        const redisUrl = config.get<string>('REDIS_URL');
        const client = redisUrl
          ? new Redis(redisUrl, {
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
              lazyConnect: false,
            })
          : new Redis({
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              password: config.get<string>('REDIS_PASSWORD'),
              maxRetriesPerRequest: null,
              enableReadyCheck: false,
              lazyConnect: false,
            });

        client.on('connect', () => {
          ('✅ Redis connected successfully');
        });

        client.on('error', (err) => {
          ('❌ Redis connection failed');
          err.message;
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT', WhatsappGateway],
})
export class SharedModule {}
