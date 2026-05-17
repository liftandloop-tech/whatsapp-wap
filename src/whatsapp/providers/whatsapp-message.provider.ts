import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import axios from 'axios';
import { buildComponents } from '../utils/build-components';
import { WabaCredentialService } from '../services/waba-credential.service';

@Injectable()
export class WhatsappMessageProvider {
  private readonly logger = new Logger(WhatsappMessageProvider.name);

  private readonly baseUrl =
    process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com';
  private readonly version = process.env.WHATSAPP_VERSION || 'v25.0';

  constructor(private readonly credentialService: WabaCredentialService) {}

  getCredentialService(): WabaCredentialService {
    return this.credentialService;
  }

  async sendTemplateMessage({
    phone,
    clientId,
    template,
    variables,
    mediaId,
  }: {
    phone: string;
    clientId: number;
    template: any;
    variables: string[];
    mediaId?: string;
  }): Promise<any> {
    try {
      // 1. Resolve Dynamic Credentials (Auth Layer Phase 2)
      const creds = await this.credentialService.getCredentials(clientId);

      // 2. Construct the Meta Payload
      const components = buildComponents(
        {
          ...template,
          components: (template.components || []).map((c) => {
            const isHeader = c.type?.toUpperCase() === 'HEADER';
            return {
              ...c,
              mediaId: isHeader ? (mediaId || c.mediaId) : c.mediaId,
            };
          }),
        },
        variables,
      );

      const payload = {
        messaging_product: 'whatsapp',
        to: phone,
        type: 'template',
        template: {
          name: template.name,
          language: {
            code: template.language || 'en',
          },
          components,
        },
      };

      // 3. Dispatch to Meta Node
      const url = `${this.baseUrl}/${this.version}/${creds.phoneNumberId}/messages`;

      this.logger.debug(
        `[DISPATCH] client=${clientId} -> ${phone} | pid=${creds.phoneNumberId}`,
      );

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const wamid: string | undefined = response.data?.messages?.[0]?.id;

      return {
        success: true,
        wamid,
        response: response.data,
      };
    } catch (error: any) {
      await this.handleMetaError(clientId, error);

      throw error;
    }
  }

  async sendMessage(message: any, languageCode: string): Promise<any> {
    try {
      const { to, clientId, variables, campaignId } = message;
      const template = campaignId.templateId;

      const res = await this.sendTemplateMessage({
        phone: to,
        clientId,
        template: {
          ...template,
          language: languageCode,
        },
        variables,
        mediaId: message.mediaId,
      });

      return {
        success: true,
        providerMessageId: res.wamid,
      };
    } catch (error: any) {
      const metaError = error?.response?.data?.error;
      return {
        success: false,
        failure: {
          error: metaError?.message || error.message,
          errorType: 'provider',
          errorCode: metaError?.code?.toString() || 'PROVIDER_ERROR',
        },
      };
    }
  }

  private async handleMetaError(clientId: number, error: any) {
    const metaError = error?.response?.data?.error;
    if (!metaError) return;

    const code = metaError.code;
    const subcode = metaError.error_subcode;

    //  CATEGORY: AUTHENTICATION REVOKED (Code 190/200)
    if (code === 190 || code === 200 || subcode === 463 || subcode === 467) {
      this.logger.error(
        `[AUTH_REVOKED] Client ${clientId}: Invalid OAuth token detected.`,
      );
      await this.credentialService.reportAuthFailure(clientId);
      throw new Error('UNRECOVERABLE: Meta Authentication Revoked');
    }

    //  CATEGORY: POLICY & CONTENT (e.g. 131031 Template Mismatch, 131030 Receiver blocked)
    if (
      [131031, 131030, 132001, 132005].includes(code) ||
      [33, 100].includes(code)
    ) {
      this.logger.error(
        `[POLICY_FATAL] Client ${clientId}: Permanent Meta rejection [${code}]: ${metaError.message}`,
      );
      throw new Error(`UNRECOVERABLE: Policy violation - ${metaError.message}`);
    }

    this.logger.error(
      `Meta API Error [${code}]: ${metaError.message}`,
      metaError,
    );
  }

  static isRetriable(error: any): boolean {
    const metaError = error?.response?.data?.error;
    if (!metaError) return true; // Default to retry for unknown errors (network, timeout)

    const code = metaError.code;
    // Transient codes: 4 (Rate Limited), 131001 (Internal), 131056 (Cloud API temporary)
    const transientCodes = [4, 131001, 131056, 132007];

    return transientCodes.includes(code);
  }
}
