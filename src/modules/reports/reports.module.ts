import { Module } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { LegacyBridgeController } from './reports.controller';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [LegacyBridgeController],
  providers: [ReportsService],
})
export class ReportsModule {}
