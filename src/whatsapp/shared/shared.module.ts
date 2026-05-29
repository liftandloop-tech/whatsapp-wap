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
        const redisUrl = config.get<string>('REDIS_URI') || config.get<string>('REDIS_URL');

        // Shared resilience options for all Redis clients
        const resilienceOpts = {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          lazyConnect: false,
          keepAlive: 30000,            // Send TCP keepalive every 30s to prevent ECONNRESET
          retryStrategy: (times: number) => {
            if (times > 20) {
              console.error('[REDIS] Max reconnect attempts reached. Stopping retry.');
              return null; // stop retrying
            }
            const delay = Math.min(times * 300, 5000); // exponential backoff capped at 5s
            console.warn(`[REDIS] Reconnecting... attempt ${times}, next in ${delay}ms`);
            return delay;
          },
          reconnectOnError: (err: Error) => {
            // Reconnect on ECONNRESET and ETIMEDOUT
            if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
              return true;
            }
            return false;
          },
        };

        const redisUsername = config.get<string>('REDIS_USERNAME');
        const client = redisUrl
          ? new Redis(redisUrl, resilienceOpts)
          : new Redis({
              host: config.get<string>('REDIS_HOST', 'localhost'),
              port: config.get<number>('REDIS_PORT', 6379),
              ...(redisUsername ? { username: redisUsername } : {}),
              password: config.get<string>('REDIS_PASSWORD'),
              db: 0,
              ...resilienceOpts,
            });

        client.on('connect', () => {
          console.log('✅ [REDIS] Connected successfully');
        });

        client.on('ready', () => {
          console.log('✅ [REDIS] Client ready');
        });

        client.on('error', (err) => {
          console.error('❌ [REDIS] Error:', err.message);
        });

        client.on('close', () => {
          console.warn('⚠️ [REDIS] Connection closed');
        });

        client.on('reconnecting', (delay: number) => {
          console.warn(`🔄 [REDIS] Reconnecting in ${delay}ms...`);
        });

        return client;
      },
    },
  ],
  exports: ['REDIS_CLIENT', WhatsappGateway],
})
export class SharedModule {}
