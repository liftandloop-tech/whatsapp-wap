import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { WabaCredentialService } from '../services/waba-credential.service';

@Injectable()
export class WhatsappFlowsProvider {
  private readonly logger = new Logger(WhatsappFlowsProvider.name);
  private readonly VERSION = process.env.WHATSAPP_VERSION || 'v25.0';

  constructor(private readonly credentialService: WabaCredentialService) {}

  async getFlows(clientId: number) {
    const { accessToken, wabaId } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${wabaId}/flows`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to fetch flows for Client=${clientId}: ${
          error.response?.data?.error?.message || error.message
        }`,
      );
      throw error;
    }
  }

  //  FIXED METHOD
  async createFlow(clientId: number, flow: any) {
    try {
      const id = Number(clientId);

      if (!id || isNaN(id)) {
        throw new Error('clientId is required for flow creation');
      }

      const { accessToken, wabaId } =
        await this.credentialService.getCredentials(id);

      const url = `https://graph.facebook.com/${this.VERSION}/${wabaId}/flows`;

      const payload = {
        name: flow.name,
        categories: flow.categories || [],
      };

      const response = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to create flow for Client=${clientId}: ${
          error.response?.data?.error?.message || error.message
        }`,
      );
      throw error;
    }
  }

  async getFlowDetails(clientId: number, flowId: string) {
    const { accessToken } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${flowId}`;
      const response = await axios.get(url, {
        params: {
          fields: 'id,name,status,categories,validation_errors',
        },
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to fetch flow details for Flow=${flowId}: ${
          error.response?.data?.error?.message || error.message
        }`,
      );
      throw error;
    }
  }

  async deleteFlow(clientId: number, flowId: string) {
    const { accessToken } =
      await this.credentialService.getCredentials(clientId);

    try {
      const url = `https://graph.facebook.com/${this.VERSION}/${flowId}`;
      const response = await axios.delete(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data;
    } catch (error: any) {
      this.logger.error(
        `[Meta API] Failed to delete flow for Flow=${flowId}: ${
          error.response?.data?.error?.message || error.message
        }`,
      );
      throw error;
    }
  }
}
