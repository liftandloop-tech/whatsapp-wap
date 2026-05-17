import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WabaCredentialService } from '../services/waba-credential.service';

@Injectable()
export class WhatsappAutomationProvider {
  private readonly logger = new Logger(WhatsappAutomationProvider.name);
  private readonly VERSION = process.env.WHATSAPP_VERSION || 'v25.0';

  constructor(private readonly credentialService: WabaCredentialService) {}

  async getAutomationSettings(clientId: number) {
    const { accessToken, phoneNumberId } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${phoneNumberId}/conversational_automation`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to fetch automation settings for Client=${clientId}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  async updateAutomationSettings(clientId: number, payload: any) {
    const { accessToken, phoneNumberId } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${phoneNumberId}/conversational_automation`;
      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to update automation settings for Client=${clientId}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }
}
