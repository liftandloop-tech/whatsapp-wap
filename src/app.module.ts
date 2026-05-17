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
        const redisUrl = config.get<string>('REDIS_URL');
        const redisHost = config.get<string>('REDIS_HOST', 'localhost');
        const redisPort = config.get<number>('REDIS_PORT', 6379);
        const redisPassword = config.get<string>('REDIS_PASSWORD');

        const connection: any = redisUrl
          ? redisUrl
          : {
              host: redisHost,
              port: redisPort,
              password: redisPassword,
            };

        return {
          connection,
          prefix: 'wa_service',
          maxRetriesPerRequest: null,
          enableReadyCheck: false,
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
