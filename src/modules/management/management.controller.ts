import { Controller, Get, Post, Body, Query, Param } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Controller('management')
export class ManagementController {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('webhook') private webhookQueue: Queue,
    @InjectQueue('outbound') private outboundQueue: Queue,
    @InjectQueue('media') private mediaQueue: Queue,
  ) {}

  @Get('health/queues')
  async getQueueStatus() {
    return {
      webhook: await this.webhookQueue.getJobCounts(),
      outbound: await this.outboundQueue.getJobCounts(),
      media: await this.mediaQueue.getJobCounts(),
    };
  }

  @Get('failures/provider')
  async getProviderFailures(
    @Query('tenantId') tenantId?: string,
    @Query('limit') limit = 50,
  ) {
    return this.prisma.messageStatusEvent.findMany({
      where: {
        status: 'FAILED',
        message: tenantId ? { tenantId } : undefined,
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        message: {
          include: {
            conversation: true
          }
        },
      },
    });
  }

  @Get('failures/jobs')
  async getFailedJobs(@Query('queue') queueName: string) {
    const queue = this.getQueueByName(queueName);
    const failed = await queue.getFailed();
    return failed.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      stacktrace: job.stacktrace,
      timestamp: job.timestamp,
    }));
  }

  @Post('jobs/retry')
  async retryJob(
    @Body('queue') queueName: string,
    @Body('jobId') jobId: string,
  ) {
    const queue = this.getQueueByName(queueName);
    const job = await queue.getJob(jobId);
    if (job) {
      await job.retry();
      return { status: 'retrying', jobId };
    }
    return { status: 'not_found' };
  }

  private getQueueByName(name: string): Queue {
    switch (name) {
      case 'webhook': return this.webhookQueue;
      case 'outbound': return this.outboundQueue;
      case 'media': return this.mediaQueue;
      default: throw new Error(`Unknown queue: ${name}`);
    }
  }
}
