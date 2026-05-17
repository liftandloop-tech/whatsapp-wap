import { Body, Controller, Delete, Get, Param, Post } from '@nestjs/common';
import { WhatsappTemplateService } from '../services/whatsapp-template.service';
import { CreateTemplateDto } from '../dto/create-template.dto';

@Controller('whatsapp')
export class TemplateController {
  constructor(
    private readonly whatsappTemplateService: WhatsappTemplateService,
  ) {}

  // CREATE TEMPLATE
  @Post('templates')
  createTemplate(@Body() payload: CreateTemplateDto) {
    return this.whatsappTemplateService.createTemplate(payload);
  }

  // DELETE TEMPLATE
  @Delete('templates/:id')
  deleteTemplate(@Param('id') id: string) {
    return this.whatsappTemplateService.deleteTemplate(id);
  }

  // UPDATE TEMPLATE
  @Post('templates/update')
  updateTemplate(@Body() payload: CreateTemplateDto) {
    return this.whatsappTemplateService.updateTemplate(payload);
  }

  // GET BY CLIENT
  @Get('templates/:clientId')
  getTemplates(@Param('clientId') clientId: string) {
    return this.whatsappTemplateService.getTemplatesByClient(Number(clientId));
  }

  // ✅ MANUAL SYNC (FOR POSTMAN / PROXY)
  @Post('templates/sync/:clientId')
  async syncTemplates(@Param('clientId') clientId: string) {
    console.log(`\n[!!!] POSTMAN PING: Manual sync received for Client ${clientId}\n`);
    await this.whatsappTemplateService.syncTemplatesFromMeta(Number(clientId));

    const templates = await this.whatsappTemplateService.getTemplatesByClient(
      Number(clientId),
    );

    return {
      success: true,
      message: 'Templates synced successfully',
      data: templates?.data || [],
    };
  }
}
