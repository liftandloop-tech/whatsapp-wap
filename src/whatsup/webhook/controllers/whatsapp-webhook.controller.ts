import { Body, Controller, Get, HttpStatus, Post, Query, Res } from "@nestjs/common";
import { WhatsappWebhookService } from "../services/whatsapp-webhook.service";
import type { Response } from "express";
import { WHATSAPP_WEBHOOK_VERIFY_REASON } from "../constants/whatsapp-webhook-verify-reasons.constant";
import { WhatsappWebhookDto } from "../dto/whatsapp-webhook.dto";



@Controller("whatsapp/webhook")
export class WhatsappWebhookController {

    constructor(
        private readonly whatsappWebhookService: WhatsappWebhookService
    ) { }


    @Get()
    verifyWebhook(
        @Query("hub.mode") mode: string,
        @Query("hub.verify_token") token: string,
        @Query("hub.challenge") challenge: string,
        @Res() res: Response
    ) {

        const result = this.whatsappWebhookService.verifyWebhook(mode, token, challenge);

        if (!result.success) {
            const reason = result.reason;
            if (reason === WHATSAPP_WEBHOOK_VERIFY_REASON.MISSING_DATA) {
                return res.status(HttpStatus.BAD_REQUEST).send(reason);
            }
            return res.status(HttpStatus.FORBIDDEN).send(reason);
        }

        return res.status(HttpStatus.OK).send(result.challenge);
    }


    @Post()
    receiveWebhook(
        @Body() payload: WhatsappWebhookDto,
        @Res() res: Response
    ) {
        this.whatsappWebhookService.handleWebhook(payload);
    }
}