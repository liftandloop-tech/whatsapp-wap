import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { OutboundListener } from './outbound.listener';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'outbound' }),
  ],
  providers: [OutboundListener],
})
export class OutboundModule {}
