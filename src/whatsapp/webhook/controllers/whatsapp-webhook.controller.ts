import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  Res,
  Logger,
} from '@nestjs/common';
import { WhatsappWebhookService } from '../services/whatsapp-webhook.service';
import type { Response } from 'express';
import { WHATSAPP_WEBHOOK_VERIFY_REASON } from '../constants/whatsapp-webhook-verify-reasons.constant';
import { WhatsappWebhookDto } from '../dto/whatsapp-webhook.dto';
import { Req } from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { Request } from 'express';
import { MetaWebhookValidator } from '../utils/meta-webhook.validator';

@Controller('whatsapp/webhook')
export class WhatsappWebhookController {
  private readonly logger = new Logger(WhatsappWebhookController.name);

  constructor(
    private readonly whatsappWebhookService: WhatsappWebhookService,
  ) {}

  // 🔐 Meta Verification Handshake
  @Get()
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const result = this.whatsappWebhookService.verifyWebhook(
      mode,
      token,
      challenge,
    );

    if (!result.success) {
      const reason = result.reason;
      if (reason === WHATSAPP_WEBHOOK_VERIFY_REASON.MISSING_DATA) {
        return res.status(HttpStatus.BAD_REQUEST).send(reason);
      }
      return res.status(HttpStatus.FORBIDDEN).send(reason);
    }

    return res.status(HttpStatus.OK).send(result.challenge);
  }

  // ✅ Fix #2 — Full webhook implementation with Signature Security
  @Post()
  @HttpCode(200)
  receiveWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: WhatsappWebhookDto,
  ) {
    const signature = req.headers['x-hub-signature-256'] as string;
    const appSecret = process.env.META_APP_SECRET;

    if (appSecret && signature && req.rawBody) {
      const isValid = MetaWebhookValidator.verifySignature(
        req.rawBody.toString(),
        signature,
        appSecret,
      );

      if (!isValid) {
        this.logger.error('[WEBHOOK] Invalid X-Hub-Signature-256');
        return; // Reject silently or log
      }
    }

    // Fire-and-forget: respond to Meta instantly, process in background
    this.whatsappWebhookService.handleWebhook(payload).catch((err) => {
      this.logger.error('[WEBHOOK] Unhandled async error', err?.message);
    });
  }
}
