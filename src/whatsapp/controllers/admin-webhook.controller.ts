import {
  Controller,
  Post,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { WHATSAPP_QUEUE_IDS } from '../constants/whatsapp-queue.constants';

/**
 * 🔁 Admin Webhook Replay Controller
 *
 * Provides DLQ replay endpoints for the template-webhook-processing queue.
 * Without replay, a DLQ is just a graveyard — this turns it into a recovery system.
 *
 * Endpoints:
 *   POST /whatsapp/admin/replay/template-webhook/:jobId  — replay single failed job
 *   POST /whatsapp/admin/replay/template-webhook         — bulk replay all failed jobs
 *
 * ⚠️  Secure this with an internal auth guard before exposing outside localhost.
 */
@Controller('whatsapp/admin/replay')
export class AdminWebhookController {
  private readonly logger = new Logger(AdminWebhookController.name);

  constructor(
    @InjectQueue(WHATSAPP_QUEUE_IDS.TEMPLATE_WEBHOOK)
    private readonly templateWebhookQueue: Queue,
  ) {}

  /**
   * Replay a single failed job by BullMQ job ID.
   * The job must still exist in the failed set (removeOnFail must be false).
   */
  @Post('template-webhook/:jobId')
  @HttpCode(HttpStatus.OK)
  async replaySingleJob(@Param('jobId') jobId: string) {
    const job = await this.templateWebhookQueue.getJob(jobId);

    if (!job) {
      throw new NotFoundException(
        `Job ${jobId} not found in queue. It may have been cleaned.`,
      );
    }

    await job.retry();
    this.logger.log(
      `[REPLAY] Retried job ${jobId} (event: ${job.data?.eventId})`,
    );

    return {
      success: true,
      message: `Job ${jobId} has been re-queued for processing`,
      eventId: job.data?.eventId,
    };
  }

  /**
   * Bulk replay all failed jobs in the template webhook queue.
   * Useful after a prolonged DB outage or processor bug fix.
   */
  @Post('template-webhook')
  @HttpCode(HttpStatus.OK)
  async replayAllFailed(@Query('status') status: string = 'failed') {
    const validStatuses = ['failed', 'delayed'];
    if (!validStatuses.includes(status)) {
      return {
        success: false,
        message: `Invalid status. Use: ${validStatuses.join(', ')}`,
      };
    }

    const jobs =
      status === 'failed'
        ? await this.templateWebhookQueue.getFailed()
        : await this.templateWebhookQueue.getDelayed();

    if (jobs.length === 0) {
      return { success: true, message: `No ${status} jobs found`, replayed: 0 };
    }

    let replayed = 0;
    const errors: string[] = [];

    for (const job of jobs) {
      try {
        await job.retry();
        replayed++;
      } catch (err: any) {
        errors.push(`Job ${job.id}: ${err.message}`);
        this.logger.error(
          `[REPLAY] Failed to retry job ${job.id}: ${err.message}`,
        );
      }
    }

    this.logger.log(
      `[REPLAY] Bulk replay complete: ${replayed}/${jobs.length} re-queued`,
    );

    return {
      success: true,
      total: jobs.length,
      replayed,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Get DLQ stats — how many jobs are in each state.
   */
  @Post('template-webhook/stats')
  @HttpCode(HttpStatus.OK)
  async getQueueStats() {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      this.templateWebhookQueue.getWaitingCount(),
      this.templateWebhookQueue.getActiveCount(),
      this.templateWebhookQueue.getCompletedCount(),
      this.templateWebhookQueue.getFailedCount(),
      this.templateWebhookQueue.getDelayedCount(),
    ]);

    return {
      queue: WHATSAPP_QUEUE_IDS.TEMPLATE_WEBHOOK,
      waiting,
      active,
      completed,
      failed,
      delayed,
    };
  }
}
