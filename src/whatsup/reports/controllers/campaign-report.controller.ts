import { Body, Controller, Get, Query } from "@nestjs/common";
import { CampaignReportService } from "../services/campaign-report.service";
import { CampaignReportRequestDto } from "../dto/campaign-report-request.dto";


@Controller("whatsapp/campaigns-report")
export class CampaignReportController {

    constructor(
        private readonly campaignReportService: CampaignReportService
    ){}

    @Get()
    getCampaignsReport( @Query() query: CampaignReportRequestDto ) {
        return this.campaignReportService.getCampaignsReport(query);
    }
}