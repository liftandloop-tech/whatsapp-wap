import { Injectable } from '@nestjs/common';
import { WhatsappAutomationProvider } from '../providers/whatsapp-automation.provider';

@Injectable()
export class WhatsappAutomationService {
  constructor(
    private readonly automationProvider: WhatsappAutomationProvider,
  ) {}

  async getSettings(clientId: number) {
    const response =
      await this.automationProvider.getAutomationSettings(clientId);
    return {
      success: true,
      data: response.data || response,
    };
  }

  async updateSettings(clientId: number, payload: any) {
    const response = await this.automationProvider.updateAutomationSettings(
      clientId,
      payload,
    );
    return {
      success: true,
      data: response,
    };
  }
}
