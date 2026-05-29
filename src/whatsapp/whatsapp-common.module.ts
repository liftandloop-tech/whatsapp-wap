import { Module } from '@nestjs/common';
import { AutomationService } from './services/automation.service';
import { WhatsappMessageProvider } from './providers/whatsapp-message.provider';
import { WabaCredentialService } from './services/waba-credential.service';
import { SharedModule } from './shared/shared.module';
import { WhatsappTemplateService } from './services/whatsapp-template.service';
import { WhatsappTemplateProvider } from './providers/whatsapp-template.provider';
import { WhatsappDatabaseModule } from './database/whatsapp-database-module';
import { WhatsappMediaService } from './services/whatsapp-media.service.js';
import { WhatsappMediaProvider } from './providers/whatsapp-media.provider';

@Module({
  imports: [SharedModule, WhatsappDatabaseModule],
  providers: [
    AutomationService,
    WhatsappMessageProvider,
    WabaCredentialService,
    WhatsappTemplateService,
    WhatsappTemplateProvider,
    WhatsappMediaService,
    WhatsappMediaProvider,
  ],
  exports: [
    AutomationService,
    WhatsappMessageProvider,
    WabaCredentialService,
    WhatsappTemplateService,
    WhatsappTemplateProvider,
    WhatsappMediaService,
    WhatsappMediaProvider,
  ],
})
export class WhatsappCommonModule {}
