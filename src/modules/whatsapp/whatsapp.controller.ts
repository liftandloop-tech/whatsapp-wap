import {
  Controller,
  Post,
  Get,
  Req,
  Res,
  Query,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { WhatsAppService } from './whatsapp.service';
import { CryptoUtils } from '../../shared/utils/crypto.utils';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';

@Controller('whatsapp')
export class WhatsAppController {
  private readonly logger = new Logger(WhatsAppController.name);

  constructor(
    private readonly whatsappService: WhatsAppService,
    private readonly configService: ConfigService,
    @InjectQueue('webhook') private readonly webhookQueue: Queue,
  ) {}

  /**
   * Meta Webhook Verification (GET)
   */
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
  ) {
    const verifyToken = this.configService.get<string>(
      'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
    );

    if (mode === 'subscribe' && token === verifyToken) {
      this.logger.log('✅ Webhook Verified');
      return challenge;
    }

    this.logger.warn('❌ Webhook Verification Failed');
    throw new UnauthorizedException('Verification failed');
  }

  /**
   * Meta Webhook Ingestion (POST)
   */
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(@Req() req: Request) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const appSecret = this.configService.get<string>('META_APP_SECRET');

    if (!appSecret) {
      this.logger.error('META_APP_SECRET is not configured');
      throw new UnauthorizedException('Server configuration error');
    }

    // We use rawBody provided by NestJS (enabled in main.ts)
    const rawBody = (req as any).rawBody?.toString();

    if (!rawBody) {
      this.logger.error('Missing rawBody for signature verification');
      throw new UnauthorizedException('Missing payload');
    }

    // 1. Verify Signature
    const isValid = CryptoUtils.verifySignature(rawBody, signature, appSecret);
    if (!isValid) {
      this.logger.warn('Invalid signature received');
      throw new UnauthorizedException('Invalid signature');
    }

    const payload = JSON.parse(rawBody);
    const traceId = uuidv4();

    // 2. Log Raw Event (Audit Trail)
    const eventHash = CryptoUtils.generateEventHash(payload);

    try {
      const savedEvent = await this.whatsappService.logWebhookEvent(
        payload,
        'META_WEBHOOK',
        eventHash,
        traceId,
      );

      // 3. Enqueue for asynchronous processing (BullMQ)
      await this.webhookQueue.add(
        'process_meta_webhook',
        {
          eventId: savedEvent.id,
          traceId: traceId,
        },
        {
          jobId: eventHash, // Deduplication at queue level too
          attempts: 5,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        },
      );

      this.logger.log(
        `[${traceId}] Webhook event ingested and queued: ${savedEvent.id}`,
      );
      return { status: 'received', eventId: savedEvent.id, traceId };
    } catch (error) {
      // Handle duplicate hash errors (P2002 in Prisma)
      if (error.code === 'P2002') {
        this.logger.warn('Duplicate webhook event received, skipping');
        return { status: 'duplicate' };
      }
      throw error;
    }
  }
}
