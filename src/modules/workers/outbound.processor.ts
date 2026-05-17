import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job, UnrecoverableError } from 'bullmq';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { TraceLogger } from '../../infra/observability/trace.logger';
import { RateLimiterService } from '../../infra/observability/rate-limiter.service';
import axios from 'axios';
import { Agent } from 'https';

const LEGACY_PLACEHOLDER = 'LEGACY_CREDENTIALS_LINKED';

@Processor('outbound', { concurrency: 5 })
export class OutboundProcessor extends WorkerHost {
  private readonly httpsAgent = new Agent({ rejectUnauthorized: false, keepAlive: true });
  private readonly legacyBackendUrl =
    process.env.BACKEND_INTERNAL_URL || 'http://localhost:3300/api/internal/whatsapp';
  private readonly internalSecret =
    process.env.INTERNAL_SYNC_SECRET || 'sync_987654321';

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsAppService,
    private logger: TraceLogger,
    private rateLimiter: RateLimiterService,
  ) {
    super();
    this.logger.setContext(OutboundProcessor.name);
  }

  /**
   * Resolve the real Meta access token.
   * When WabaAccount.accessToken is the legacy placeholder, bridge via
   * waba_credentials (same Postgres DB) to get the real token.
   */
  private async resolveAccessToken(wabaAccount: any): Promise<string> {
    if (wabaAccount.accessToken !== LEGACY_PLACEHOLDER) {
      return wabaAccount.accessToken;
    }

    this.logger.log(`[LEGACY_CRED] Resolving real token via legacy bridge for wabaId=${wabaAccount.wabaId}`);

    // Look up clientId from the shared waba_credentials table (same DB)
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
    const { messageId, conversationId, to, text, phoneNumberId, _metadata } = job.data;
    const { tenantId, traceId } = _metadata;

    this.logger.setTraceMetadata({ traceId, tenantId, messageId });
    this.logger.log(`Processing outbound dispatch (${job.name})`);

    try {
      // 1. Backpressure: Tenant Throttling (e.g., 20 msgs per second per tenant)
      await this.rateLimiter.consume(`outbound:${tenantId}`, 1, { points: 20, duration: 1 });

      // 2. Fetch credentials and message state
      const [wabaAccount, currentMessage] = await Promise.all([
        this.prisma.wabaAccount.findFirst({ where: { tenantId } }),
        this.prisma.message.findUnique({ where: { id: messageId }, select: { wamid: true } }),
      ]);

      if (!wabaAccount) {
        throw new UnrecoverableError(`No WABA account found for tenant ${tenantId}`);
      }

      // Idempotency: If already has wamid, skip send
      if (currentMessage?.wamid) {
        this.logger.warn(`Message ${messageId} already has wamid (${currentMessage.wamid}), skipping dispatch`);
        return { status: 'skipped_duplicate', wamid: currentMessage.wamid };
      }

      // 3. Resolve actual access token (handles legacy credential bridge)
      const accessToken = await this.resolveAccessToken(wabaAccount);

      let result: { wamid: string };

      // 4. Route by event type or data content
      const isTemplate = job.name === 'message.template_send' || job.data.eventType === 'message.template_send';
      const isMedia = job.name === 'message.media_send' || job.data.eventType === 'message.media_send' || (job.data.type && job.data.type !== 'text');

      if (isTemplate) {
        const { templateName, languageCode, variables } = job.data;
        
        const components: any[] = [];
        if (variables && Object.keys(variables).length > 0) {
          components.push({
            type: 'body',
            parameters: Object.keys(variables).sort().map(key => ({
              type: 'text',
              text: variables[key],
            })),
          });
        }

        result = await this.whatsappService.sendTemplateMessage(
          phoneNumberId,
          accessToken,
          to,
          templateName,
          languageCode,
          components,
        );
      } else if (isMedia) {
        const { type, mediaId, caption, filename } = job.data;
        result = await this.whatsappService.sendMediaMessage(
          phoneNumberId,
          accessToken,
          to,
          type.toLowerCase() as any,
          mediaId,
          caption,
          filename,
        );

      } else {
        result = await this.whatsappService.sendTextMessage(
          phoneNumberId,
          accessToken,
          to,
          text,
        );
      }



      this.logger.setTraceMetadata({ wamid: result.wamid });
      this.logger.log(`Successfully dispatched to Meta provider`);

      // 5. Update message with wamid
      await this.prisma.message.update({
        where: { id: messageId },
        data: { wamid: result.wamid },
      });

      // 6. Append status event
      await this.prisma.messageStatusEvent.create({
        data: {
          messageId,
          status: 'SENT',
          metaTimestamp: new Date(),
        },
      });

      return { status: 'success', wamid: result.wamid };
    } catch (error) {
      this.logger.error(`Error processing outbound job: ${error.message}`, error.stack);
      if (this.isPermanentError(error)) {
        this.logger.error(`Permanent failure: ${error.message}`);
        
        await this.prisma.messageStatusEvent.create({
          data: {
            messageId,
            status: 'FAILED',
            metaTimestamp: new Date(),
            rawPayload: error.response?.data || { error: error.message },
          },
        }).catch(() => {});

        throw new UnrecoverableError(error.message);
      }

      this.logger.warn(`Transient failure, will retry: ${error.message}`);
      throw error;
    }
  }

  private isPermanentError(error: any): boolean {
    if (error instanceof UnrecoverableError) return true;
    
    const code = error.response?.data?.error?.code;

    // Meta Permanent Error Codes
    const permanentCodes = [
      100, // Invalid parameter
      190, // Access token expired/revoked
      131030, // Recipient not in session (24h window violation)
      131026, // Message too long
      132001, // Template not found
      135000, // Generic user error
      131047, // Re-engagement message without template
    ];

    return permanentCodes.includes(code);
  }
}
