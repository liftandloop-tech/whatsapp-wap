import { Module } from '@nestjs/common';
import { ManagementController } from './management.controller';
import { BullModule } from '@nestjs/bullmq';

@Module({
  imports: [
    BullModule.registerQueue(
      { name: 'webhook' },
      { name: 'outbound' },
      { name: 'media' },
    ),
  ],
  controllers: [ManagementController],
})
export class ManagementModule {}
