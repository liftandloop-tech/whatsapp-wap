import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { MongooseModule } from '@nestjs/mongoose';

import { CampaignController } from './controllers/whatsapp-campaign.controller';
import { TemplateController } from './controllers/whatsapp-template.controller';
import { InternalController } from './controllers/internal.controller';
import { InboundController } from './controllers/whatsapp-inbox.controller';
import { MediaController } from './controllers/whatsapp-media.controller';
import { ProfileController } from './controllers/whatsapp-profile.controller';
import { AutomationNativeController } from './controllers/whatsapp-automation-native.controller';
import { FlowsController } from './controllers/whatsapp-flows.controller';
import { WabaAccountController } from './controllers/waba-credential.controller';
import { AdminWebhookController } from './controllers/admin-webhook.controller';

import { WhatsappCampaignService } from './services/whatsapp-campaign.service';
import { WhatsappQueueService } from './services/whatsapp-queue.service';
import { TemplateCacheService } from './services/template-cache.service';
import { RateLimiterService } from './services/rate-limiter.service';
import { CampaignGuardService } from './services/campaign-guard.service';
import { WhatsappProfileService } from './services/whatsapp-profile.service';
import { WhatsappAutomationService as WhatsappAutomationNativeService } from './services/whatsapp-automation-native.service';
import { WhatsappFlowsService } from './services/whatsapp-flows.service';
import { WhatsappProfileProvider } from './providers/whatsapp-profile.provider';
import { WhatsappAutomationProvider } from './providers/whatsapp-automation.provider';
import { WhatsappFlowsProvider } from './providers/whatsapp-flows.provider';

import { BulkProcessor } from './processors/bulk.processor';
import { TransactionalProcessor } from './processors/transactional.processor';

import { WhatsappDatabaseModule } from './database/whatsapp-database-module';
import { WhatsappReportsModule } from './reports/whatsapp-reports.module';
import { WhatsappWebhookModule } from './webhook/whatsapp-webhook.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { WhatsappCommonModule } from './whatsapp-common.module';

import { WHATSAPP_QUEUE_IDS } from './constants/whatsapp-queue.constants';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: WHATSAPP_QUEUE_IDS.BULK },
      { name: WHATSAPP_QUEUE_IDS.TRANSACTIONAL },
      { name: WHATSAPP_QUEUE_IDS.TEMPLATE_WEBHOOK },
      { name: WHATSAPP_QUEUE_IDS.REFUND },
    ),

    WhatsappDatabaseModule,
    OnboardingModule,
    WhatsappCommonModule,
    WhatsappReportsModule,
  ],
  controllers: [
    CampaignController,
    TemplateController,
    InternalController,
    InboundController,
    MediaController,
    ProfileController,
    AutomationNativeController,
    FlowsController,
    WabaAccountController,
    AdminWebhookController,
  ],
  providers: [
    WhatsappCampaignService,
    WhatsappQueueService,
    TemplateCacheService,
    RateLimiterService,
    CampaignGuardService,
    BulkProcessor,
    TransactionalProcessor,
    WhatsappProfileService,
    WhatsappProfileProvider,
    WhatsappAutomationNativeService,
    WhatsappAutomationProvider,
    WhatsappFlowsService,
    WhatsappFlowsProvider,
  ],
  exports: [
    WhatsappQueueService,
    TemplateCacheService,
    RateLimiterService,
    CampaignGuardService,
    WhatsappDatabaseModule,
  ],
})
export class WhatsappModule {}
