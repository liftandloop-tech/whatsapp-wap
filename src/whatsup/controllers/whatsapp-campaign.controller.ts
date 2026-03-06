import { Body, Controller, Post } from "@nestjs/common";
import { CreateCampaignDto } from "../dto/create-campaign.dto";
import { WhatsappCampaignService } from "../services/whatsapp-campaign.service";



@Controller('whatsapp')
export class CampaignController {
    constructor(private readonly whatsappCampaignService : WhatsappCampaignService) {}

    @Post("campaigns")
    createCampaign(@Body() payload: CreateCampaignDto) {
        return this.whatsappCampaignService.createCampaign(payload);
    }

}    