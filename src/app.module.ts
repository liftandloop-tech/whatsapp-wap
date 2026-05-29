import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { BullModule } from '@nestjs/bullmq';
import { SharedModule } from './whatsapp/shared/shared.module';
import { ScheduleModule } from '@nestjs/schedule';

import { AppController } from './app.controller';
import { PrismaModule } from './infra/prisma/prisma.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { WhatsAppModule as NewWhatsAppModule } from './modules/whatsapp/whatsapp.module';
import { WhatsappModule as LegacyWhatsAppModule } from './whatsapp/whatsapp.module';
import { WorkersModule } from './modules/workers/workers.module';
import { ConversationsModule } from './modules/conversations/conversations.module';
import { OutboxModule } from './modules/outbox/outbox.module';
import { RealtimeModule } from './modules/realtime/realtime.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { MessagesModule } from './modules/messages/messages.module';
import { ReportsModule } from './modules/reports/reports.module';
import { OutboundModule } from './modules/outbound/outbound.module';
import { ManagementModule } from './modules/management/management.module';
import { ObservabilityModule } from './infra/observability/observability.module';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';

/**
 * Parses a Redis URI (redis://user:pass@host:port/db) into ioredis connection options.
 * This is needed because passing a raw URL string to ioredis/BullMQ prevents setting
 * additional options like retryStrategy, keepAlive, etc.
 */
function parseRedisUrl(redisUrl: string): Record<string, any> {
  try {
    const url = new URL(redisUrl);
    const result: Record<string, any> = {
      host: url.hostname,
      port: parseInt(url.port, 10) || 6379,
    };
    if (url.username) result.username = decodeURIComponent(url.username);
    if (url.password) result.password = decodeURIComponent(url.password);
    if (url.pathname && url.pathname !== '/') {
      result.db = parseInt(url.pathname.replace('/', ''), 10) || 0;
    }
    return result;
  } catch {
    console.warn('[REDIS] Failed to parse REDIS_URI, falling back to individual env vars');
    return {};
  }
}

@Module({
  imports: [
    SharedModule,
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),

    MongooseModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const mongoUri = config.get<string>('MONGO_URI');

        if (!mongoUri) {
          throw new Error('MONGO_URI missing');
        }

        return {
          uri: mongoUri,
          connectionFactory: (connection) => {
            connection.on('error', (err) => {
              console.error('❌ MongoDB connection failed', err.message);
            });
            return connection;
          },
        };
      },
    }),

    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const redisUri = config.get<string>('REDIS_URI') || config.get<string>('REDIS_URL');
        const redisHost = config.get<string>('REDIS_HOST', 'localhost');
        const redisPort = config.get<number>('REDIS_PORT', 6379);
        const redisUsername = config.get<string>('REDIS_USERNAME');
        const redisPassword = config.get<string>('REDIS_PASSWORD');

        // Resilience options shared across all BullMQ workers
        const resilienceOpts: any = {
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
          keepAlive: 30000,
          retryStrategy: (times: number) => {
            if (times > 20) return null; // stop retrying after 20 attempts
            return Math.min(times * 300, 5000); // exponential backoff, max 5s
          },
          reconnectOnError: (err: Error) => {
            if (err.message.includes('ECONNRESET') || err.message.includes('ETIMEDOUT')) {
              return true;
            }
            return false;
          },
        };

        const connection: any = redisUri
          ? { ...resilienceOpts, ...parseRedisUrl(redisUri) }
          : {
              host: redisHost,
              port: redisPort,
              ...(redisUsername ? { username: redisUsername } : {}),
              password: redisPassword,
              db: 0,
              ...resilienceOpts,
            };

        return {
          connection,
          prefix: 'wa_service',
          metrics: {
            maxDataPoints: 1000,
          },
        };
      },
    }),

    PrismaModule,
    TenantsModule,
    NewWhatsAppModule,
    LegacyWhatsAppModule,
    WorkersModule,
    ConversationsModule,
    OutboxModule,
    RealtimeModule,
    MessagesModule,
    ReportsModule,
    OutboundModule,
    ManagementModule,
    EventEmitterModule.forRoot({
      wildcard: true,
      delimiter: '.',
    }),
    ObservabilityModule,
    BullBoardModule.forFeature(
      { name: 'webhook', adapter: BullMQAdapter },
      { name: 'outbound', adapter: BullMQAdapter },
      { name: 'media', adapter: BullMQAdapter },
    ),
  ],
  controllers: [AppController],
})
export class AppModule {}
