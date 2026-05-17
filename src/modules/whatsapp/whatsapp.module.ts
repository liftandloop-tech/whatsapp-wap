import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { WhatsAppController } from './whatsapp.controller';
import { WhatsAppService } from './whatsapp.service';
import { TemplateSyncService } from './template-sync.service';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'webhook' },
      { name: 'media' },
      { name: 'outbound' },
    ),
  ],
  controllers: [WhatsAppController],
  providers: [WhatsAppService, TemplateSyncService],
  exports: [WhatsAppService, TemplateSyncService],
})
export class WhatsAppModule {}
