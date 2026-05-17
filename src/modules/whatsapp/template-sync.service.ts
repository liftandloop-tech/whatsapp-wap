import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { WhatsAppService } from './whatsapp.service';
import { TemplateStatus, TemplateCategory, ComponentType, ComponentFormat } from '@prisma/client';
import axios from 'axios';

@Injectable()
export class TemplateSyncService {
  private readonly logger = new Logger(TemplateSyncService.name);

  constructor(
    private prisma: PrismaService,
    private whatsappService: WhatsAppService,
  ) {}

  async syncTemplates(tenantId: string) {
    this.logger.log(`Syncing templates for tenant: ${tenantId}`);

    const wabaAccount = await this.prisma.wabaAccount.findFirst({
      where: { tenantId },
    });

    if (!wabaAccount) {
      throw new Error(`No WABA account found for tenant ${tenantId}`);
    }

    // Handle Legacy Encrypted Token Bridge
    let accessToken = wabaAccount.accessToken;
    if (accessToken === 'LEGACY_CREDENTIALS_LINKED') {
      const legacyCreds = await this.prisma.waba_credentials.findUnique({
         where: { wabaId: wabaAccount.wabaId }
      });
      if (legacyCreds && legacyCreds.accessTokenEnc && legacyCreds.iv && legacyCreds.encryptionKeyId) {
        try {
          const crypto = require('crypto');
          const KEYS = {
              'kid_2026_01': process.env.VAULT_MASTER_KEY_V1 || 'default-32-char-key-for-vault-26'
          };
          const key = KEYS[legacyCreds.encryptionKeyId];
          if (key) {
            const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), Buffer.from(legacyCreds.iv, 'hex'));
            let decrypted = decipher.update(legacyCreds.accessTokenEnc, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            accessToken = decrypted;
          }
        } catch (e) {
          this.logger.warn(`Failed to decrypt legacy token for ${tenantId}: ${e.message}`);
        }
      }
    }

    // 1. Fetch from Meta
    const metaTemplates = await this.fetchFromMeta(wabaAccount.wabaId, accessToken);

    for (const metaTpl of metaTemplates) {
      await this.prisma.$transaction(async (tx) => {
        // Upsert Template
        const template = await tx.messageTemplate.upsert({
          where: {
            tenantId_name_language: {
              tenantId,
              name: metaTpl.name,
              language: metaTpl.language,
            },
          },
          update: {
            category: this.mapCategory(metaTpl.category),
            status: this.mapStatus(metaTpl.status),
            providerId: metaTpl.id,
          },
          create: {
            tenantId,
            wabaAccountId: wabaAccount.id,
            name: metaTpl.name,
            language: metaTpl.language,
            category: this.mapCategory(metaTpl.category),
            status: this.mapStatus(metaTpl.status),
            providerId: metaTpl.id,
          },
        });

        // Clean and Rebuild Components (Simplified for now)
        await tx.templateComponent.deleteMany({ where: { templateId: template.id } });
        
        for (const comp of (metaTpl.components || [])) {
          await tx.templateComponent.create({
            data: {
              templateId: template.id,
              type: comp.type as ComponentType,
              format: comp.format as ComponentFormat || ComponentFormat.TEXT,
              text: comp.text,
            },
          });
        }
      });
    }

    this.logger.log(`Successfully synced ${metaTemplates.length} templates for tenant ${tenantId}`);
  }

  private async fetchFromMeta(wabaId: string, accessToken: string): Promise<any[]> {
    try {
      const url = `https://graph.facebook.com/v20.0/${wabaId}/message_templates?limit=1000`;
      const response = await axios.get(url, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      return response.data?.data || [];
    } catch (error) {
      this.logger.error(
        `Failed to fetch templates from Meta for WABA ${wabaId}:`,
        error?.response?.data || error.message,
      );
      throw new Error(
        `Meta API error: ${error?.response?.data?.error?.message || error.message}`,
      );
    }
  }

  private mapCategory(metaCategory: string): TemplateCategory {
    const map: Record<string, TemplateCategory> = {
      MARKETING: TemplateCategory.MARKETING,
      UTILITY: TemplateCategory.UTILITY,
      AUTHENTICATION: TemplateCategory.AUTHENTICATION,
    };
    return map[metaCategory] || TemplateCategory.UTILITY;
  }

  private mapStatus(metaStatus: string): TemplateStatus {
    const map: Record<string, TemplateStatus> = {
      APPROVED: TemplateStatus.APPROVED,
      PENDING: TemplateStatus.PENDING,
      REJECTED: TemplateStatus.REJECTED,
      DELETED: TemplateStatus.DELETED,
    };
    return map[metaStatus] || TemplateStatus.PENDING;
  }
}
