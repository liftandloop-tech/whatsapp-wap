import { Module } from '@nestjs/common';
import { MessagesController } from './messages.controller';

import { WhatsAppModule } from '../whatsapp/whatsapp.module';

@Module({
  imports: [WhatsAppModule],
  controllers: [MessagesController],
})
export class MessagesModule {}
