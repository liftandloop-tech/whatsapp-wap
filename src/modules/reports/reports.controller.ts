import { Controller, Get, Post, Param } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { TemplateSyncService } from '../whatsapp/template-sync.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Controller()
export class LegacyBridgeController {
  constructor(
    private reportsService: ReportsService,
    private templateSyncService: TemplateSyncService,
    private prisma: PrismaService,
  ) {}

  // 1. Dashboard Stats Bridge
  @Get('whatsapp/reports/dashboard-stats/:idOrClientId')
  async getDashboardStats(@Param('idOrClientId') idOrClientId: string) {
    return this.reportsService.getDashboardStats(idOrClientId);
  }

  // 2. Performance Stats Bridge
  @Get('whatsapp/reports/performance-stats/:idOrClientId')
  async getPerformanceStats(@Param('idOrClientId') idOrClientId: string) {
    return this.reportsService.getPerformanceStats(idOrClientId);
  }

  // 3. Internal Client Phones Bridge
  @Get('internal/whatsapp/client/:idOrClientId')
  async getClientPhones(@Param('idOrClientId') idOrClientId: string) {
    return this.reportsService.getClientPhones(idOrClientId);
  }

  // 4. Template List Bridge
  @Get('whatsapp/templates/:idOrClientId')
  async getTemplates(@Param('idOrClientId') idOrClientId: string) {
    // Resolve tenantId if it's a clientId
    const tenantId = await this.reportsService.resolveTenantId(idOrClientId);
    
    const templates = await this.prisma.messageTemplate.findMany({
      where: { tenantId },
      include: { components: true },
      orderBy: { name: 'asc' },
    });
    return { success: true, data: templates };
  }

  // 5. Template Sync Bridge
  @Post('whatsapp/templates/sync/:idOrClientId')
  async syncTemplates(@Param('idOrClientId') idOrClientId: string) {
    try {
      const tenantId = await this.reportsService.resolveTenantId(idOrClientId);
      await this.templateSyncService.syncTemplates(tenantId);
      return { success: true, message: 'Sync complete' };
    } catch (e) {
      return { success: false, error: e.message, stack: e.stack };
    }
  }

  // 6. Inbox Conversations Bridge (Legacy)
  @Get('whatsapp/inbox/conversations/:idOrClientId')
  async getInboxConversations(@Param('idOrClientId') idOrClientId: string) {
    const tenantId = await this.reportsService.resolveTenantId(idOrClientId);
    
    const conversations = await this.prisma.conversation.findMany({
      where: { tenantId },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        messages: {
          orderBy: { metaTimestamp: 'desc' },
          take: 1,
        }
      }
    });

    return {
      success: true,
      data: conversations.map(c => ({
        _id: c.waId, // Legacy expects waId as _id
        lastMessage: c.messages[0] ? {
          _id: c.messages[0].id,
          body: c.messages[0].textContent,
          type: c.messages[0].type.toLowerCase(),
          timestamp: c.messages[0].metaTimestamp,
          to: c.waId,
        } : null
      }))
    };
  }
}
