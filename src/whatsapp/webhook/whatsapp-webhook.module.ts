import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';
import { WhatsappWebhookController } from './controllers/whatsapp-webhook.controller';
import { WhatsappWebhookService } from './services/whatsapp-webhook.service';
import { WhatsappDatabaseModule } from '../database/whatsapp-database-module';
import { OnboardingModule } from '../onboarding/onboarding.module';
import { WhatsappGateway } from '../gateways/whatsapp.gateway';
import { WhatsappCommonModule } from '../whatsapp-common.module';
import { TemplateWebhookProcessor } from './processors/template-webhook.processor';
import { RefundProcessor } from './processors/refund.processor';
import {
  ProcessedEvent,
  ProcessedEventSchema,
} from '../schemas/processed-event.schema';
import { WHATSAPP_QUEUE_IDS } from '../constants/whatsapp-queue.constants';

@Module({
  imports: [
    WhatsappDatabaseModule,
    OnboardingModule,
    WhatsappCommonModule,
    MongooseModule.forFeature([
      { name: ProcessedEvent.name, schema: ProcessedEventSchema },
    ]),
    BullModule.registerQueue(
      { name: WHATSAPP_QUEUE_IDS.TEMPLATE_WEBHOOK },
      { name: WHATSAPP_QUEUE_IDS.REFUND },
    ),
  ],
  controllers: [WhatsappWebhookController],
  providers: [
    WhatsappWebhookService,
    TemplateWebhookProcessor,
    RefundProcessor,
  ],
})
export class WhatsappWebhookModule {}
