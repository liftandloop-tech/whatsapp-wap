import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ProcessingState } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);

  private readonly metaApiVersion = 'v20.0';
  private readonly baseUrl = `https://graph.facebook.com/${this.metaApiVersion}`;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  async logWebhookEvent(
    payload: any,
    eventType: string,
    eventHash?: string,
    traceId?: string,
  ) {
    return this.prisma.webhookEvent.create({
      data: {
        payload,
        eventType,
        metaEventHash: eventHash,
        traceId,
        processingState: ProcessingState.PENDING,
      },
    });
  }

  /**
   * Fetch the direct download URL for a media asset from Meta.
   */
  async getMediaUrl(mediaId: string, accessToken: string): Promise<string> {
    const url = `${this.baseUrl}/${mediaId}`;
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return response.data.url;
    } catch (error) {
      const metaError = error.response?.data?.error;
      this.logger.error(`Failed to fetch media URL for ${mediaId}: ${metaError?.message || error.message} (Code: ${metaError?.code})`);
      throw error;
    }

  }

  async sendTextMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    text: string,
  ): Promise<{ wamid: string }> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: { body: text },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { wamid: response.data.messages[0].id };
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp message to ${to}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  async sendTemplateMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    templateName: string,
    languageCode: string,
    components: any[],
  ): Promise<{ wamid: string }> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    const payload = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'template',
      template: {
        name: templateName,
        language: { code: languageCode },
        components,
      },
    };

    try {
      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { wamid: response.data.messages[0].id };
    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp template ${templateName} to ${to}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  /**
   * Stream media content from the provided Meta download URL.
   */
  async getMediaStream(url: string, accessToken: string): Promise<{ stream: Readable; mimeType: string; size: number }> {
    try {
      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        responseType: 'stream',
      });


      return {
        stream: response.data,
        mimeType: response.headers['content-type'],
        size: parseInt(response.headers['content-length'] || '0', 10),
      };
    } catch (error) {
      this.logger.error(`Failed to stream media from Meta: ${error.message}`);
      throw error;
    }
  }

  async sendMediaMessage(
    phoneNumberId: string,
    accessToken: string,
    to: string,
    type: 'image' | 'audio' | 'document' | 'video',
    mediaId: string,
    caption?: string,
    filename?: string,
  ): Promise<{ wamid: string }> {
    const url = `${this.baseUrl}/${phoneNumberId}/messages`;
    const mediaPayload: any = { id: mediaId };
    
    // Meta API constraints:
    // - 'caption' is supported for image, video, document (NOT audio)
    // - 'filename' is ONLY supported for document
    if (caption && type !== 'audio') {
      mediaPayload.caption = caption;
    }
    
    if (filename && type === 'document') {
      mediaPayload.filename = filename;
    }

    const payload: any = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: type,
      [type]: mediaPayload,
    };


    try {
      this.logger.log(`Sending WhatsApp ${type} message to ${to} (mediaId: ${mediaId})`);
      this.logger.debug(`Payload: ${JSON.stringify(payload)}`);

      const response = await axios.post(url, payload, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      return { wamid: response.data.messages[0].id };

    } catch (error) {
      this.logger.error(
        `Failed to send WhatsApp ${type} message to ${to}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }
}

