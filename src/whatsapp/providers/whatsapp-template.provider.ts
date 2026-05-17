import axios from 'axios';
import { Template } from '../schemas/template.schema';
import { WabaCredentialService } from '../services/waba-credential.service';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class WhatsappTemplateProvider {
  private readonly logger = new Logger(WhatsappTemplateProvider.name);
  private readonly baseUrl =
    process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com';
  private readonly version = process.env.WHATSAPP_VERSION || 'v25.0';

  constructor(private readonly credentialService: WabaCredentialService) {}

  /**
   * 🤖 Auto-Example Generator
   * Generates dummy values for {{1}}, {{2}} etc. to satisfy Meta's strict validation
   * if the user/frontend didn't provide them.
   * Meta requires placeholders to be sequential and starts from 1.
   */
  private getAutoExamples(text: string): string[] {
    const matches = text.match(/{{[^}]+}}/g);
    if (!matches) return [];

    const result: string[] = [];
    for (let i = 1; i <= matches.length; i++) {
      result.push(`Value_${i}`);
    }

    return result;
  }

  private buildMetaTemplatePayload(template: Template, oldTemplate?: any) {
    const componentsToProcess = Array.isArray(template.components) 
      ? template.components 
      : (template as any).toObject?.().components || [];

    const oldComponents = Array.isArray(oldTemplate?.components)
      ? oldTemplate.components
      : oldTemplate?.toObject?.().components || [];

    const metaComponentsMap: Record<string, any> = {};
    const buttons: any[] = [];

    for (const comp of componentsToProcess) {
      const type = comp.type?.toUpperCase();
      if (!type) continue;

      if (template.category?.toUpperCase() === 'AUTHENTICATION') {
        if (type === 'BODY') {
          const hasSecurity = comp.add_security_recommendation || (comp.text && comp.text.toLowerCase().includes('security'));
          metaComponentsMap['BODY'] = {
            type: 'BODY',
            add_security_recommendation: !!hasSecurity,
          };
          continue;
        }
        if (type === 'FOOTER') {
          let expMinutes = comp.code_expiration_minutes || 5;
          if (comp.text && comp.text.includes('expire after')) {
            const match = comp.text.match(/(\d+)\s*min/);
            if (match) expMinutes = Number(match[1]);
          }
          metaComponentsMap['FOOTER'] = {
            type: 'FOOTER',
            code_expiration_minutes: Number(expMinutes),
          };
          continue;
        }
      }

      // 🔘 Handle Buttons (Quick Replies, URLs, Phone)
      if (type === 'BUTTON' || type === 'BUTTONS') {
        const extracted = Array.isArray(comp.buttons) 
          ? comp.buttons 
          : (comp.text ? [comp] : []);

        buttons.push(
          ...extracted
            .filter(b => b.text || b.type === 'OTP' || b.type === 'COPY_CODE')
            .map((b) => {
              const btnType = (b.type || b.sub_type || 'QUICK_REPLY').toUpperCase();
              let btnExample = b.example;

              if (!btnExample && btnType === 'URL' && b.url?.includes('{{')) {
                btnExample = [b.url.replace(/{{[^}]+}}/g, 'val')];
              }

              let cleanText = b.text
                ? b.text
                    .replace(/[\n\r]/g, ' ')
                    .replace(
                      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
                      '',
                    )
                    .trim()
                : undefined;

              if (template.category?.toUpperCase() === 'AUTHENTICATION') {
                const otpRes: any = {
                  type: 'OTP',
                  otp_type: (b.otp_type || b.type).toUpperCase(),
                };
                if (cleanText) otpRes.text = cleanText;
                if (b.autofill_text) otpRes.autofill_text = b.autofill_text;
                if (b.supported_apps) {
                  otpRes.supported_apps = b.supported_apps;
                } else if (b.package_name && b.signature_hash) {
                  otpRes.supported_apps = [
                    {
                      package_name: b.package_name,
                      signature_hash: b.signature_hash,
                    },
                  ];
                }
                if (otpRes.otp_type === 'ZERO_TAP') otpRes.zero_tap_terms_accepted = true;
                if (btnExample) otpRes.example = btnExample;

                if (btnType === 'QUICK_REPLY') {
                  return {
                    type: 'QUICK_REPLY',
                    text: cleanText,
                  };
                }
                return otpRes;
              }

              return {
                type: btnType === 'BUTTONS' ? 'QUICK_REPLY' : btnType,
                text: cleanText,
                url: b.url,
                phone_number: b.phone_number,
                example: btnExample,
              };
            }),
        );
        continue;
      }

      const mappedComp: Record<string, any> = {
        type: type,
      };

      if (comp.text) {
        let sanitizedText = comp.text;

        // 🛡️ Meta Restriction: Header and Footer cannot have newlines, emojis, or formatting
        if (type === 'HEADER' || type === 'FOOTER') {
          sanitizedText = sanitizedText
            .replace(/[\n\r]/g, ' ') 
            .replace(/[\*\_~\`]/g, '')
            .replace(
              /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu,
              '',
            );
        }

        // Normalize all variable placeholders (e.g. {{ name }}, {{ 1 }}) to strictly sequential {{1}}, {{2}} etc.
        let varIndex = 1;
        sanitizedText = sanitizedText.replace(/{{[^}]+}}/g, () => `{{${varIndex++}}}`);

        mappedComp.text = sanitizedText;

        // ✨ Auto-Inject Examples for Variables (Required by Meta)
        if (sanitizedText.includes('{{')) {
          const examples = this.getAutoExamples(sanitizedText);
          if (examples.length > 0) {
            if (type === 'BODY') {
              mappedComp.example = { body_text: [examples] };
            } else if (type === 'HEADER') {
              mappedComp.example = { header_text: [examples[0]] };
            }
          }
        }
      }

      if (comp.format) {
        const format = comp.format.toUpperCase();
        mappedComp.format = format;

        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(format)) {
          const handle =
            comp.example?.header_handle?.[0] ||
            comp.header_handle ||
            comp.mediaId ||
            'DUMMY_HANDLE';

          mappedComp.example = {
            header_handle: [handle],
          };
        }
      }

      // If component already had an example, let it override unless we just generated one
      if (comp.example && !mappedComp.example) {
        mappedComp.example = comp.example;
      }
      if (!mappedComp.example) {
        const oldComp = oldComponents.find((c: any) => c.type?.toUpperCase() === type);
        if (oldComp?.example) {
          mappedComp.example = oldComp.example;
        }
      }

      metaComponentsMap[type] = mappedComp;
    }

    // 🏗️ Enforce Order: HEADER -> BODY -> FOOTER -> BUTTONS
    const orderedComponents: any[] = [];
    if (metaComponentsMap['HEADER']) orderedComponents.push(metaComponentsMap['HEADER']);
    
    // Body is REQUIRED
    if (metaComponentsMap['BODY']) {
      orderedComponents.push(metaComponentsMap['BODY']);
    } else {
      throw new Error('Template BODY component is required for Meta WhatsApp templates.');
    }

    if (metaComponentsMap['FOOTER']) orderedComponents.push(metaComponentsMap['FOOTER']);

    if (buttons.length > 0) {
      orderedComponents.push({
        type: 'BUTTONS',
        buttons: buttons,
      });
    }

    const payload: any = {
      name: template.name,
      language: template.language,
      category: template.category.toUpperCase(),
      components: orderedComponents,
    };

    if (template.ttlSeconds) {
      payload.message_send_ttl_seconds = template.ttlSeconds;
    }

    this.logger.debug(`[META_PAYLOAD] ${JSON.stringify(payload)}`);
    return payload;
  }

  async createTemplate(template: Template) {
    try {
      const creds = await this.credentialService.getCredentials(
        template.clientId,
      );

      if (!creds.wabaId) {
        throw new Error(`WABA ID not found for client ${template.clientId}`);
      }

      const payload = this.buildMetaTemplatePayload(template);
      const url = `${this.baseUrl}/${this.version}/${creds.wabaId}/message_templates`;

      this.logger.log(
        `[TEMPLATE_CREATION] client=${template.clientId} -> waba=${creds.wabaId} -> name=${template.name}`,
      );

      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        success: true,
        data: res.data,
      };
    } catch (err: any) {
      const metaError = err?.response?.data?.error;

      if (metaError) {
        await this.handleMetaError(template.clientId, err);
      }

      this.logger.error(
        `[TEMPLATE_FAILURE] client=${template.clientId} | Error: ${JSON.stringify(err?.response?.data || err.message)}`,
      );

      return {
        success: false,
        error:
          err?.response?.data || err?.message || 'Failed to create template',
      };
    }
  }

  async fetchAllTemplates(clientId: number) {
    try {
      const creds = await this.credentialService.getCredentials(clientId);
      const allTemplates: any[] = [];
      let url = `${this.baseUrl}/${this.version}/${creds.wabaId}/message_templates?limit=100`;

      while (url) {
        this.logger.log(
          `[TEMPLATE_PULL] Fetching page: ${url.split('message_templates')[1] || 'initial'}`,
        );
        const res = await axios.get(url, {
          headers: {
            Authorization: `Bearer ${creds.accessToken}`,
          },
        });

        if (res.data?.data) {
          allTemplates.push(...res.data.data);
        }

        // Check for next page
        url = res.data?.paging?.next || null;
      }

      this.logger.log(
        `[TEMPLATE_PULL] Successfully fetched total ${allTemplates.length} templates for client ${clientId}`,
      );
      return allTemplates;
    } catch (err: any) {
      const metaError = err?.response?.data?.error;

      if (metaError) {
        await this.handleMetaError(clientId, err);
      }

      this.logger.error(
        `[TEMPLATE_SYNC_FAILURE] client=${clientId}`,
        err?.response?.data || err.message,
      );

      return [];
    }
  }

  async updateTemplate(template: Template, oldTemplate?: any) {
    try {
      const creds = await this.credentialService.getCredentials(
        template.clientId,
      );

      if (!creds.wabaId) {
        throw new Error(`WABA ID not found for client ${template.clientId}`);
      }

      let templateId = (template as any).templateId || (template as any).providerTemplateId;
      if (!templateId || isNaN(Number(templateId))) {
        const allMeta = await this.fetchAllTemplates(template.clientId);
        let matched = allMeta.find(t => t.name === template.name && t.language === template.language);
        if (!matched) {
          matched = allMeta.find(t => t.name === template.name);
        }
        if (matched && matched.id) {
          templateId = matched.id;
        }
      }

      if (!templateId || isNaN(Number(templateId))) {
        return await this.createTemplate(template);
      }

      const payload = this.buildMetaTemplatePayload(template, oldTemplate);
      delete (payload as any).name;
      delete (payload as any).language;
      delete (payload as any).category;

      const url = `${this.baseUrl}/${this.version}/${templateId}`;

      this.logger.log(
        `[TEMPLATE_UPDATE] client=${template.clientId} -> templateId=${templateId}`,
      );

      const res = await axios.post(url, payload, {
        headers: {
          Authorization: `Bearer ${creds.accessToken}`,
          'Content-Type': 'application/json',
        },
      });

      return {
        success: true,
        data: res.data,
      };
    } catch (err: any) {
      const metaError = err?.response?.data?.error;

      if (metaError) {
        await this.handleMetaError(template.clientId, err);
      }

      this.logger.error(
        `[TEMPLATE_UPDATE_FAILURE] client=${template.clientId} | Error: ${JSON.stringify(err?.response?.data || err.message)}`,
      );

      return {
        success: false,
        error:
          err?.response?.data || err?.message || 'Failed to update template',
      };
    }
  }


  private async handleMetaError(clientId: number, error: any) {
    const metaError = error?.response?.data?.error;
    if (!metaError) return;

    const code = metaError.code;
    const subcode = metaError.error_subcode;
    const detailedMsg = metaError.error_user_msg || metaError.message || JSON.stringify(metaError);

    //  CATEGORY: AUTHENTICATION REVOKED (Code 190/200) or BANNED/MISSING (Code 100, Subcode 33)
    if (
      code === 190 ||
      code === 200 ||
      subcode === 463 ||
      subcode === 467 ||
      (code === 100 && subcode === 33)
    ) {
      this.logger.error(
        `[AUTH_FATAL] Client ${clientId}: ${detailedMsg}`,
      );
      await this.credentialService.reportAuthFailure(clientId);
      throw new Error(
        `UNRECOVERABLE: Meta Account Invalid or Banned - ${detailedMsg}`,
      );
    }

    //  CATEGORY: POLICY & CONTENT
    if (
      [131031, 131030, 132001, 132005].includes(code) ||
      [33, 100].includes(code)
    ) {
      this.logger.error(
        `[POLICY_FATAL] Client ${clientId}: Permanent Meta rejection [${code}]: ${detailedMsg}`,
      );
      throw new Error(`Meta Rejection: ${detailedMsg}`);
    }

    this.logger.error(
      `Meta API Error [${code}]: ${detailedMsg}`,
      metaError,
    );
  }

  static isRetriable(error: any): boolean {
    const metaError = error?.response?.data?.error;
    if (!metaError) return true;

    const code = metaError.code;
    const transientCodes = [4, 131001, 131056, 132007];
    return transientCodes.includes(code);
  }
}
