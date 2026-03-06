import { Injectable } from "@nestjs/common";
import { WhatsappSendDto } from "../dto/whatsapp-send.dto";
import { Message } from "../schemas/message.schema";
import axios from "axios";


@Injectable()
export class WhatsappMessageProvider {

    private readonly baseUrl = process.env.WHATSAPP_API_BASE_URL;
    private readonly version = process.env.WHATSAPP_VERSION;
    private readonly phoneId = process.env.WHATSAPP_PHONE_ID;
    private readonly token = process.env.WHATSAPP_TOKEN;


    sendMessage = async (message: any, languageCode: string) => {

        try {
            if (!this.baseUrl || !this.phoneId || !this.token || !this.version) {
                throw new Error("WhatsApp provider env vars are missing");
            }

            if (message.type !== "template") {
                throw new Error("Whatsapp Provider only supports template type");
            }

            const dto: WhatsappSendDto = {
                to: message.to,
                templateName: message.content,
                languageCode
                // variables can be added later
            }

            // Meta API payload
            const payload = {
                messaging_product: "whatsapp",
                to: dto.to,
                type: "template",
                template: {
                    name: dto.templateName,
                    language: {
                        code: dto.languageCode
                    }
                    // variables can be added later 
                }
            }

              // Meta api url
            const meta_api_url = `${this.baseUrl}/${this.version}/${this.phoneId}/messages`;

            const res = await axios.post(meta_api_url, payload, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json"
                },
                timeout: 10000
            });
            return {
                success: true,
                providerMessageId: res.data?.messages?.[0]?.id,
                response: res.data
            }
        }
        catch (err: any) {
            console.log(err.message);

            if (err.response) {
                return {
                    success: false,
                    failure: {
                        error: err.response.data?.error?.message || "Meta API error",
                        errorType: "meta",
                        errorCode: err.response.data?.error?.code || "META_ERROR"
                    }
                };
            }
            return {
                success: false,
                failure: {
                    error: err.message,
                    errorType: "system",
                    errorCode: "SYSTEM_EXCEPTION"
                }
            }
        }

    }
}