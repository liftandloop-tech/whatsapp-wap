import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { WhatsappProfileService } from '../services/whatsapp-profile.service';

@Controller('whatsapp/profile')
export class ProfileController {
  constructor(private readonly profileService: WhatsappProfileService) {}

  @Get()
  async getProfile(@Query('clientId') clientId: string) {
    return this.profileService.getProfile(Number(clientId));
  }

  @Post()
  async updateProfile(
    @Query('clientId') clientId: string,
    @Body() payload: any,
  ) {
    return this.profileService.updateProfile(Number(clientId), payload);
  }
}
