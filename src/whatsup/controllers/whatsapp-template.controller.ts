import {Body, Controller, Get, Post} from "@nestjs/common";
import { WhatsappTemplateService } from "../services/whatsapp-template.service";
import { CreateTemplateDto } from "../dto/create-template.dto1";




@Controller('whatsapp')
export class TemplateController {

    constructor(private readonly whatsappTemplateService : WhatsappTemplateService) {}


    @Post("templates")
    createTemplate(@Body() payload: CreateTemplateDto) {
        return this.whatsappTemplateService.createTemplate(payload);
    }


}