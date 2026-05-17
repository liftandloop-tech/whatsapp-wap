import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { Prisma, OutboxState } from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Cron, CronExpression } from '@nestjs/schedule';

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);
  private isProcessing = false;

  constructor(
    private prisma: PrismaService,
    private eventEmitter: EventEmitter2,
  ) {}

  /**
   * Record an event in the outbox.
   * MUST be called within a Prisma transaction to ensure atomicity.
   */
  async recordEvent(
    eventType: string,
    payload: any,
    tx: Prisma.TransactionClient,
    options: { tenantId: string; traceId?: string; aggregateId?: string; aggregateType?: string },
  ) {
    return tx.outboxEvent.create({
      data: {
        eventType,
        payload: payload as any,
        tenantId: options.tenantId,
        traceId: options.traceId,
        aggregateId: options.aggregateId,
        aggregateType: options.aggregateType,
        state: 'PENDING', // Use string literal for enum if import fails
      },
    });
  }

  /**
   * Process and publish pending events from the outbox.
   * Runs every second to ensure low latency.
   */
  @Cron(CronExpression.EVERY_SECOND)
  async publishPending() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const pendingEvents = await this.prisma.outboxEvent.findMany({
        where: { state: 'PENDING' },
        take: 50,
        orderBy: { createdAt: 'asc' },
      });

      for (const event of pendingEvents) {
        try {
          // Publish to internal event bus (EventEmitter2)
          this.logger.log(`[${event.traceId}] Publishing outbox event: ${event.eventType}`);
          await this.eventEmitter.emitAsync(event.eventType, {
            ...event.payload as any,
            eventType: event.eventType,
            _metadata: {
              outboxId: event.id,
              traceId: event.traceId,
              tenantId: event.tenantId,
            },
          });


          // Mark as published
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              state: 'PUBLISHED',
              publishedAt: new Date(),
            },
          });
        } catch (error) {
          this.logger.error(`[${event.traceId}] Failed to publish outbox event ${event.id}: ${error.message}`);
          
          await this.prisma.outboxEvent.update({
            where: { id: event.id },
            data: {
              state: 'FAILED',
              attempts: { increment: 1 },
              lastError: error.message,
            },
          });
        }
      }
    } finally {
      this.isProcessing = false;
    }
  }
}
