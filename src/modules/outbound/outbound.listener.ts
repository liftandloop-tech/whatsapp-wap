import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';

@Injectable()
export class OutboundListener {
  private readonly logger = new Logger(OutboundListener.name);

  constructor(@InjectQueue('outbound') private outboundQueue: Queue) {}

  @OnEvent('message.*')
  async handleMessageSend(payload: any) {
    const { _metadata } = payload;
    const traceId = _metadata?.traceId;
    const eventType = payload.eventType || 'message.send';

    this.logger.log(`[${traceId}] Enqueuing ${eventType} for background dispatch`);

    try {
      await this.outboundQueue.add(eventType, { ...payload, eventType }, {
        jobId: payload.messageId,
        removeOnComplete: true,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
      });
    } catch (error) {
      this.logger.error(`[${traceId}] Failed to enqueue job: ${error.message}`);
    }
  }
}
