import { Module } from '@nestjs/common';
import { ConversationStateService } from './conversation-state.service';
import { ConversationsController } from './conversations.controller';
import { OutboxModule } from '../outbox/outbox.module';

@Module({
  imports: [OutboxModule],
  controllers: [ConversationsController],
  providers: [ConversationStateService],
  exports: [ConversationStateService],
})
export class ConversationsModule {}
