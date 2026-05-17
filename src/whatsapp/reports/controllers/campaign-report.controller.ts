import { Body, Controller, Get, Query, Param } from '@nestjs/common';
import { CampaignReportService } from '../services/campaign-report.service';
import { CampaignReportRequestDto } from '../dto/campaign-report-request.dto';

@Controller('whatsapp/reports')
export class CampaignReportController {
  constructor(private readonly campaignReportService: CampaignReportService) {}

  @Get('campaigns')
  getCampaignsReport(@Query() query: CampaignReportRequestDto) {
    return this.campaignReportService.getCampaignsReport(query);
  }

  @Get('campaign-summary/:id')
  getCampaignSummary(@Param('id') id: string) {
    return this.campaignReportService.getCampaignSummary(id);
  }

  @Get('dashboard-stats/:clientId')
  getDashboardStats(@Param('clientId') clientId: string) {
    return this.campaignReportService.getDashboardStats(Number(clientId));
  }

  @Get('performance-stats/:clientId')
  getPerformanceStats(@Param('clientId') clientId: string) {
    return this.campaignReportService.getPerformanceStats(Number(clientId));
  }

  @Get('subaccount-stats-raw')
  getSubAccountStatsRaw(@Query('clientIds') clientIds: string) {
    return this.campaignReportService.getSubAccountStats(clientIds);
  }

  @Get('failed-messages/:clientId')
  getFailedMessages(@Param('clientId') clientId: string) {
    return this.campaignReportService.getFailedMessages(Number(clientId));
  }
}
