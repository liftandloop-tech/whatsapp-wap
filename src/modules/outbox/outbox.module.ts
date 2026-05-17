import { Module } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [ScheduleModule.forRoot()],
  providers: [OutboxService],
  exports: [OutboxService],
})
export class OutboxModule {}
