import axios from "axios";
import { Template } from "../schemas/template.schema1";



export class WhatsappTemplateProvider {

    private readonly baseUrl = process.env.WHATSAPP_API_BASE_URL;
    private readonly version = process.env.WHATSAPP_VERSION;
    private readonly wabaId = process.env.WABA_ID;
    private readonly token = process.env.WHATSAPP_TOKEN;


    private buildMetaTemplatePayload(template: Template) {
        const components: Array<Record<string, any>> = [];

        if (template.components.header?.text) {
            components.push({
                type: "HEADER",
                format: "TEXT",
                text: template.components.header.text
            });
        }

        if (!template.components.body) {
            throw new Error("Template BODY is required for WhatsApp templates");
        }

        components.push({
            type: "BODY",
            text: template.components.body
        });

        if (template.components.footer) {
            components.push({
                type: "FOOTER",
                text: template.components.footer
            });
        }

        if (template.components.buttons?.length) {
            components.push({
                type: "BUTTONS",
                buttons: template.components.buttons.map(btn => {
                    switch (btn.type) {
                        case "URL":
                            return {
                                type: "URL",
                                text: btn.text,
                                url: btn.url
                            };

                        case "PHONE_NUMBER":
                            return {
                                type: "PHONE_NUMBER",
                                text: btn.text,
                                phone_number: btn.phoneNumber
                            };

                        default:
                            return {
                                type: "QUICK_REPLY",
                                text: btn.text
                            };
                    }
                })
            });
        }

        return {
            name: template.name,
            language: template.language,
            category: template.category.toUpperCase(),  
            components
        };
    }


    createTemplate = async (template: Template) => {
        try {
            if (!this.baseUrl || !this.wabaId || !this.token || !this.version) {
                throw new Error("WhatsApp provider env vars are missing");
            }

            const meta_template_payload = this.buildMetaTemplatePayload(template);

            const url = `${this.baseUrl}/${this.version}/${this.wabaId}/message_templates`;

            const res = await axios.post(url, meta_template_payload, {
                headers: {
                    Authorization: `Bearer ${this.token}`,
                    "Content-Type": "application/json"
                }
            });
            console.log("Templates created successfully by Meta..", res.data);
            return {
                success: true,
                data: res.data
            }
        }
        catch (err: any) {
            console.log("Templates creation failed by Meta.. ", err?.response?.data || err?.message);
            return {
                success: false,
                error: err?.response?.data || err?.message || "Failed to create template by meta"
            }
        }
    }
}