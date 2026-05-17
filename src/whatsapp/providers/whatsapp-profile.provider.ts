import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WabaCredentialService } from '../services/waba-credential.service';

@Injectable()
export class WhatsappProfileProvider {
  private readonly logger = new Logger(WhatsappProfileProvider.name);
  private readonly VERSION = process.env.WHATSAPP_VERSION || 'v25.0';

  constructor(private readonly credentialService: WabaCredentialService) {}

  async getProfile(clientId: number) {
    const { accessToken, phoneNumberId } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${phoneNumberId}/whatsapp_business_profile`;
      const response = await axios.get(url, {
        params: {
          fields:
            'about,address,description,email,vertical,websites,profile_picture_url',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to fetch profile for Client=${clientId}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }

  async updateProfile(clientId: number, payload: any) {
    const { accessToken, phoneNumberId } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${phoneNumberId}/whatsapp_business_profile`;
      const response = await axios.post(
        url,
        {
          messaging_product: 'whatsapp',
          ...payload,
        },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to update profile for Client=${clientId}: ${error.response?.data?.error?.message || error.message}`,
      );
      throw error;
    }
  }
}
