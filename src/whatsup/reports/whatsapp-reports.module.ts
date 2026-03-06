import {Module} from '@nestjs/common';
import { WhatsappDatabaseModule } from '../database/whatsapp-database-module';
import { CampaignReportController } from './controllers/campaign-report.controller';
import { MessageLogReportController } from './controllers/message-log-report.controller';
import { CampaignReportService } from './services/campaign-report.service';
import { MessageLogReportService } from './services/message-log-report.service';
 

@Module({
   imports: [
       WhatsappDatabaseModule
   ],
   controllers: [
       CampaignReportController,
       MessageLogReportController
   ],
   providers: [
       CampaignReportService,
       MessageLogReportService
   ],
})

export class WhatsappReportsModule {};