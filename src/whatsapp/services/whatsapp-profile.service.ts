import { Injectable } from '@nestjs/common';
import { WhatsappProfileProvider } from '../providers/whatsapp-profile.provider';

@Injectable()
export class WhatsappProfileService {
  constructor(private readonly profileProvider: WhatsappProfileProvider) {}

  async getProfile(clientId: number) {
    const response = await this.profileProvider.getProfile(clientId);
    return {
      success: true,
      data: response.data?.[0] || response.data, // Meta sometimes returns an array
    };
  }

  async updateProfile(clientId: number, payload: any) {
    const response = await this.profileProvider.updateProfile(
      clientId,
      payload,
    );
    return {
      success: true,
      data: response,
    };
  }
}
