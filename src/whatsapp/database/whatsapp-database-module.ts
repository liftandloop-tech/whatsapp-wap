import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Message, MessageSchema } from '../schemas/message.schema';
import { Campaign, CampaignSchema } from '../schemas/campaign.schema';
import { Template, TemplateSchema } from '../schemas/template.schema';
import { MessageLog, MessageLogSchema } from '../schemas/message-log.schema';
import {
  InboundMessage,
  InboundMessageSchema,
} from '../schemas/inbound-message.schema';
import {
  WabaAccount,
  WabaAccountSchema,
} from '../onboarding/schemas/waba-account.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Message.name, schema: MessageSchema },
      { name: Campaign.name, schema: CampaignSchema },
      { name: Template.name, schema: TemplateSchema },
      { name: MessageLog.name, schema: MessageLogSchema },
      { name: InboundMessage.name, schema: InboundMessageSchema },
      { name: WabaAccount.name, schema: WabaAccountSchema },
    ]),
  ],

  exports: [MongooseModule],
})
export class WhatsappDatabaseModule {}
