import {Module} from '@nestjs/common';
import { MessageWorker } from './workers/message.worker';
import { CampaignWorker } from './workers/campaign-worker';
import { WhatsappMessageProvider} from './providers/whatsapp-message.provider';
import { CampaignController } from './controllers/whatsapp-campaign.controller';
import { TemplateController } from './controllers/whatsapp-template.controller';
import { WhatsappCampaignService } from './services/whatsapp-campaign.service';
import { WhatsappTemplateService } from './services/whatsapp-template.service';
import { WhatsappTemplateProvider } from './providers/whatsapp-template.provider';
import { WhatsappDatabaseModule } from './database/whatsapp-database-module';
import { WhatsappReportsModule } from './reports/whatsapp-reports.module';
import { WhatsappWebhookModule } from './webhook/whatsapp-webhook.module';



@Module({
   imports: [
       WhatsappDatabaseModule,
       WhatsappReportsModule,
       WhatsappWebhookModule
   ],
   controllers: [
       CampaignController,
       TemplateController
   ],
   providers: [
       WhatsappCampaignService,
       WhatsappTemplateService,
       MessageWorker,
       CampaignWorker,
       WhatsappMessageProvider,
       WhatsappTemplateProvider
   ],
})
export class WhatsappModule {};