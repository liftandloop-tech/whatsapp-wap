import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { WhatsappAutomationService } from '../services/whatsapp-automation-native.service';

@Controller('whatsapp/automation/native')
export class AutomationNativeController {
  constructor(private readonly automationService: WhatsappAutomationService) {}

  @Get('settings')
  async getSettings(@Query('clientId') clientId: string) {
    return this.automationService.getSettings(Number(clientId));
  }

  @Post('settings')
  async updateSettings(
    @Query('clientId') clientId: string,
    @Body() payload: any,
  ) {
    return this.automationService.updateSettings(Number(clientId), payload);
  }
}
