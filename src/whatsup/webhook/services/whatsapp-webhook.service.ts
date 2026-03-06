import { Injectable } from "@nestjs/common";
import { WHATSAPP_WEBHOOK_VERIFY_REASON } from "../constants/whatsapp-webhook-verify-reasons.constant";
import { WhatsappWebhookDto } from "../dto/whatsapp-webhook.dto";



@Injectable()
export class WhatsappWebhookService {

    private readonly verifyToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

    // Webhook verification
    verifyWebhook(mode: string, token: string, challenge: string) {

        if (!mode || !token || !challenge) {
            return {
                success: false,
                reason: WHATSAPP_WEBHOOK_VERIFY_REASON.MISSING_DATA
            }
        }

        if (mode !== "subscribe") {
            return {
                success: false,
                reason: WHATSAPP_WEBHOOK_VERIFY_REASON.INVALID_MODE
            }
        }

        if (token !== this.verifyToken) {
            return {
                success: false,
                reason:  WHATSAPP_WEBHOOK_VERIFY_REASON.INVALID_VERIFY_TOKEN
            }
        }

        return {
            success: true,
            challenge
        }
    }


    // handle webhook - update message delivery, template status
    handleWebhook(payload: WhatsappWebhookDto) {

    }

}