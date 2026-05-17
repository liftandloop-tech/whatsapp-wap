import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { LocalStorageService } from '../../infra/storage/local-storage.service';
import { OutboxService } from '../outbox/outbox.service';
import { TraceLogger } from '../../infra/observability/trace.logger';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Agent } from 'https';

const LEGACY_PLACEHOLDER = 'LEGACY_CREDENTIALS_LINKED';

@Processor('media', { concurrency: 2 })
export class MediaProcessor extends WorkerHost {
  private readonly httpsAgent = new Agent({ rejectUnauthorized: false, keepAlive: true });
  private readonly legacyBackendUrl: string;
  private readonly internalSecret: string;

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsAppService,
    private storageService: LocalStorageService,
    private outboxService: OutboxService,
    private logger: TraceLogger,
    private configService: ConfigService,
  ) {
    super();
    this.logger.setContext(MediaProcessor.name);
    this.legacyBackendUrl = this.configService.get<string>('BACKEND_INTERNAL_URL') || 'http://localhost:3300/api/internal/whatsapp';
    this.internalSecret = this.configService.get<string>('INTERNAL_SYNC_SECRET') || 'sync_987654321';
  }

  /**
   * Resolve the real Meta access token.
   */
  private async resolveAccessToken(wabaAccount: any): Promise<string> {
    if (wabaAccount.accessToken !== LEGACY_PLACEHOLDER) {
      return wabaAccount.accessToken;
    }

    this.logger.log(`[LEGACY_CRED] Resolving real token via legacy bridge for wabaId=${wabaAccount.wabaId}`);

    const rows: any[] = await this.prisma.$queryRaw`
      SELECT "clientId" FROM waba_credentials WHERE "wabaId" = ${wabaAccount.wabaId} LIMIT 1
    `;

    if (!rows?.[0]?.clientId) {
      throw new UnrecoverableError(`No legacy clientId found for wabaId=${wabaAccount.wabaId}`);
    }

    const clientId = rows[0].clientId;
    const url = `${this.legacyBackendUrl}/credentials/${clientId}`;

    try {
      const res = await axios.get(url, {
        httpsAgent: this.httpsAgent,
        headers: {
          'Content-Type': 'application/json',
          'x-internal-secret': this.internalSecret,
        },
        timeout: 5000,
      });

      const creds = res.data.data || res.data;
      const token = creds.accessToken;

      if (!token || token === 'VAULTED') {
        throw new UnrecoverableError(`Legacy token is vaulted or missing for clientId=${clientId}`);
      }

      this.logger.log(`[LEGACY_CRED] Resolved real token for clientId=${clientId}`);
      return token;
    } catch (err: any) {
      if (err instanceof UnrecoverableError) throw err;
      throw new UnrecoverableError(
        `Failed to fetch legacy credentials for clientId=${clientId}: ${err.message}`,
      );
    }
  }

  async process(job: Job<any, any, string>): Promise<any> {
    const { messageId, mediaId, tenantId, traceId } = job.data;
    this.logger.setTraceMetadata({ traceId, tenantId, messageId });
    this.logger.log(`Processing media download (mediaId: ${mediaId})`);

    try {
      // 1. Fetch credentials
      const wabaAccount = await this.prisma.wabaAccount.findFirst({
        where: { tenantId },
      });

      if (!wabaAccount) {
        throw new Error(`No WABA account found for tenant ${tenantId}`);
      }

      const accessToken = await this.resolveAccessToken(wabaAccount);

      // 2. Update status to DOWNLOADING
      await this.prisma.message.update({
        where: { id: messageId },
        data: { mediaStatus: 'DOWNLOADING' },
      });

      // 3. Get Download URL from Meta
      const downloadUrl = await this.whatsappService.getMediaUrl(mediaId, accessToken);

      this.logger.log(`Meta media URL retrieved`);

      // 4. Stream from Meta
      const { stream, mimeType, size } = await this.whatsappService.getMediaStream(downloadUrl, accessToken);
      this.logger.log(`Streaming ${size} bytes from Meta...`);

      // 5. Generate S3 Key
      const message = await this.prisma.message.findUnique({
        where: { id: messageId },
        select: { conversationId: true },
      });
      
      const extension = this.getExtensionFromMimeType(mimeType);
      const filename = `${messageId}${extension}`;
      const s3Key = `inbound/${tenantId}/${message?.conversationId}/${filename}`;


      // 6. Upload to Local Storage
      const localUrl = await this.storageService.uploadStream(stream, s3Key, mimeType);

      this.logger.log(`Successfully saved locally: ${localUrl}`);

      // 7. Final Update with Transaction
      await this.prisma.$transaction(async (tx) => {
        const updatedMessage = await tx.message.update({
          where: { id: messageId },
          data: {
            mediaStatus: 'AVAILABLE',
            mediaUrl: localUrl,
            mediaMimeType: mimeType,
            mediaSizeBytes: size,
            mediaFilename: filename,
          },
        });

        // 8. Emit Realtime Event for Media Availability
        await this.outboxService.recordEvent(
          'message.media_updated',
          {
            messageId: updatedMessage.id,
            conversationId: updatedMessage.conversationId,
            mediaUrl: updatedMessage.mediaUrl,
            mediaStatus: 'AVAILABLE',
          },
          tx,
          {
            traceId,
            tenantId,
            aggregateId: messageId,
            aggregateType: 'Message',
          },
        );
      });

      return { status: 'success', localUrl };
    } catch (error) {
      this.logger.error(`Media processing failed: ${error.message}`, error.stack);
      
      await this.prisma.message.update({
        where: { id: messageId },
        data: { mediaStatus: 'FAILED' },
      }).catch(e => this.logger.error(`Failed to update message status to FAILED: ${e.message}`));

      throw error;
    }
  }

  private getExtensionFromMimeType(mimeType: string): string {
    const map: Record<string, string> = {
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/webp': '.webp',
      'video/mp4': '.mp4',
      'audio/mpeg': '.mp3',
      'audio/ogg': '.ogg',
      'audio/amr': '.amr',
      'application/pdf': '.pdf',
    };
    return map[mimeType] || '';
  }
}
