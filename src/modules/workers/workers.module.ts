import { Module } from '@nestjs/common';
import { WebhookProcessor } from './webhook.processor';
import { ConversationsModule } from '../conversations/conversations.module';
import { OutboxModule } from '../outbox/outbox.module';
import { TenantsModule } from '../tenants/tenants.module';
import { BullModule } from '@nestjs/bullmq';
import { StorageModule } from '../../infra/storage/storage.module';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { WhatsappModule as LegacyWhatsappModule } from '../../whatsapp/whatsapp.module';
import { WhatsappDatabaseModule } from '../../whatsapp/database/whatsapp-database-module';
import { MediaProcessor } from './media.processor';
import { OutboundProcessor } from './outbound.processor';
import { CampaignGuardService } from '../../whatsapp/services/campaign-guard.service';

@Module({
  imports: [
    ConversationsModule, 
    OutboxModule, 
    TenantsModule,
    BullModule.registerQueue(
      { name: 'media' },
      { name: 'outbound' },
    ),
    StorageModule,
    WhatsAppModule,
    LegacyWhatsappModule,
    WhatsappDatabaseModule,
  ],
  providers: [WebhookProcessor, MediaProcessor, OutboundProcessor, CampaignGuardService],
})
export class WorkersModule {}
