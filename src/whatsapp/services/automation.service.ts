import { Injectable, Logger } from '@nestjs/common';
import { WhatsappMessageProvider } from '../providers/whatsapp-message.provider';
import axios from 'axios';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(private readonly provider: WhatsappMessageProvider) {}

  /**
   * 🤖 PROCESS INBOUND MESSAGE FOR AUTO-REPLY
   */
  async processInbound(clientId: number, incomingBody: string, phone: string) {
    if (!incomingBody || !clientId) return;

    try {
      // 1. Fetch active rules for this client
      const response = await axios.get(
        `${process.env.BACKEND_INTERNAL_URL}/automation/rules/${clientId}`,
        {
          headers: {
            'x-internal-secret':
              process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
          },
        },
      );

      const rules = response.data?.data || [];
      const normalizedMsg = incomingBody.toLowerCase().trim();

      // 2. Find matching rule
      const match = rules.find((rule) => {
        if (rule.matchType === 'EXACT') {
          return normalizedMsg === rule.keyword;
        } else {
          return normalizedMsg.includes(rule.keyword);
        }
      });

      if (!match) return;

      this.logger.log(
        `[AUTOMATION] Match Found! Rule=${match.id} | Keyword=${match.keyword} | Phone=${phone}`,
      );

      // 3. Dispatch Template Reply
      // Note: We use a separate async flow to avoid blocking webhook processing
      setImmediate(async () => {
        try {
          const credentials = await this.provider
            .getCredentialService()
            .getCredentials(clientId);

          // Double check quality before automated send
          if (credentials.qualityRating === 'RED') {
            this.logger.warn(
              `[AUTOMATION_SKIP] Blocked auto-reply for Client=${clientId} due to RED quality.`,
            );
            return;
          }

          await this.provider.sendTemplateMessage({
            phone,
            clientId,
            template: { name: match.templateId, language: 'en_US' } as any, // Simple auto-reply (assumes en_US)
            variables: [],
          });

          this.logger.log(
            `[AUTOMATION_SUCCESS] Replied to ${phone} with template ${match.templateId}`,
          );
        } catch (err) {
          this.logger.error(
            `[AUTOMATION_DISPATCH_FAILURE] Error sending auto-reply: ${err.message}`,
          );
        }
      });
    } catch (error) {
      this.logger.error(
        `[AUTOMATION_ERROR] Failed to process auto-reply rules: ${error.message}`,
      );
    }
  }
}
