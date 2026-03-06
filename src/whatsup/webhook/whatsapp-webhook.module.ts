import { Module } from "@nestjs/common";
import { WhatsappWebhookController } from "./controllers/whatsapp-webhook.controller";
import { WhatsappWebhookService } from "./services/whatsapp-webhook.service";



@Module({
    imports: [],
    controllers: [
        WhatsappWebhookController
    ],
    providers: [
        WhatsappWebhookService
    ],
})
export class WhatsappWebhookModule {

}