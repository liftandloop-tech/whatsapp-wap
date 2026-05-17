import { Injectable } from '@nestjs/common';
import { WhatsappFlowsProvider } from '../providers/whatsapp-flows.provider';

@Injectable()
export class WhatsappFlowsService {
  constructor(private readonly flowsProvider: WhatsappFlowsProvider) {}

  async listFlows(clientId: number) {
    const response = await this.flowsProvider.getFlows(clientId);
    return {
      success: true,
      data: response.data || [],
    };
  }

  async createFlow(clientId: number, name: string, categories: string[]) {
    const response = await this.flowsProvider.createFlow(clientId, {
      name,
      categories,
    });
    return {
      success: true,
      data: response,
    };
  }

  async getFlowDetails(clientId: number, flowId: string) {
    const response = await this.flowsProvider.getFlowDetails(clientId, flowId);
    return {
      success: true,
      data: response,
    };
  }

  async deleteFlow(clientId: number, flowId: string) {
    const response = await this.flowsProvider.deleteFlow(clientId, flowId);
    return {
      success: true,
      data: response,
    };
  }
}
