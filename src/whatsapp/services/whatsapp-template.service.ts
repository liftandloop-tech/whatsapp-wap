import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { Template } from '../schemas/template.schema';
import Redis from 'ioredis';
import { WhatsappTemplateProvider } from '../providers/whatsapp-template.provider';
import { CreateTemplateDto } from '../dto/create-template.dto';
import { TEMPLATE_STATUS } from '../constants/template.constants';
import axios from 'axios';

import { WabaCredentialService } from './waba-credential.service';
import { LocalStorageService } from '../../infra/storage/local-storage.service';
import { WhatsappMediaProvider } from '../providers/whatsapp-media.provider';

@Injectable()
export class WhatsappTemplateService implements OnModuleInit {
  private readonly logger = new Logger(WhatsappTemplateService.name);

  constructor(
    @InjectModel(Template.name)
    private templateModel: Model<Template>,

    private whatsappTemplateProvider: WhatsappTemplateProvider,

    private wabaCredentialService: WabaCredentialService,

    private storageService: LocalStorageService,

    private whatsappMediaProvider: WhatsappMediaProvider,

    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {}

  /**
   * 🧹 One-Time Migration: Drop legacy global unique index on 'name'.
   * Templates must be unique per (clientId, name, language), not globally by name.
   * Running this at startup is safe — it's a no-op if the index doesn't exist.
   */
  async onModuleInit() {
    try {
      await this.templateModel.collection.dropIndex('name_1');
      this.logger.log(
        "[MIGRATION] Dropped legacy unique index 'name_1' on templates collection",
      );
    } catch {
      // Index doesn't exist or already dropped — this is the expected state after first run.
    }
  }

  /**
   * 🕰️ Meta Template Status Syncer
   * Periodically updates local template statuses (APPROVED, REJECTED, etc.) from Meta.
   */
  // @Cron(CronExpression.EVERY_10_MINUTES)
  async syncTemplatesFromMeta(targetClientId?: number) {
    this.logger.log(
      `Starting Bi-directional Template Sync... ${targetClientId ? `(Target: ${targetClientId})` : '(All Clients)'}`,
    );

    let clientIds: number[] = [];
    if (targetClientId) {
      clientIds = [targetClientId];
    } else {
      clientIds = await this.wabaCredentialService.getConnectedClients();
    }

    if (clientIds.length === 0) {
      this.logger.log('No connected clients found or targeted. Skipping sync.');
      return;
    }

    for (const clientId of clientIds) {
      try {
        // 📤 Phase 1: Push "Unpublished" (Pending) Templates to Meta
        // Find local templates that were never successfully submitted (no providerTemplateId)
        const pendingLocal = await this.templateModel.find({
          clientId,
          status: TEMPLATE_STATUS.PENDING,
          providerTemplateId: { $exists: false },
        });

        if (pendingLocal.length > 0) {
          this.logger.log(
            `[SYNC][PUSH] Found ${pendingLocal.length} unpublished templates for client ${clientId}. Attempting Meta submission...`,
          );
          for (const template of pendingLocal) {
            try {
              const metaRes =
                await this.whatsappTemplateProvider.createTemplate(
                  template as any,
                );
              if (metaRes?.success) {
                await this.templateModel.updateOne(
                  { _id: template._id },
                  { $set: { providerTemplateId: metaRes.data?.name } },
                );
                this.logger.log(
                  `[SYNC][PUSH] ✅ Successfully published ${template.name} to Meta`,
                );
              }
            } catch (pushErr: any) {
              this.logger.warn(
                `[SYNC][PUSH] Failed to publish ${template.name}: ${pushErr.message}`,
              );
            }
          }
        }

        // 📥 Phase 2: Pull Status Updates & Reconcile from Meta
        const metaTemplates =
          await this.whatsappTemplateProvider.fetchAllTemplates(clientId);
        this.logger.log(
          `[SYNC][PULL] Fetched ${metaTemplates.length} templates from Meta for client ${clientId}`,
        );

        for (const metaT of metaTemplates) {
          this.logger.log(
            `[SYNC][PULL] Client ${clientId} | Template: ${metaT.name} | Meta Status: ${metaT.status}`,
          );

          const incomingTs = Date.now(); // Sync data is "now" relative to the API call

          // Update existing local record OR create if missing (Reconciliation)
          const upsertFilter: any = {
            clientId,
            name: metaT.name,
            language: metaT.language,
          };
          
          // Only apply timestamp guard for global/background syncs to prevent stale updates
          if (!targetClientId) {
            upsertFilter.$or = [
              { lastEventTs: { $lt: incomingTs } },
              { lastEventTs: { $exists: false } },
            ];
          }
          const upsertPayload = {
            $set: {
              status: metaT.status,
              isActive:
                metaT.status === TEMPLATE_STATUS.APPROVED ||
                metaT.status === 'REINSTATED',
              category: metaT.category?.toLowerCase(),
              providerTemplateId: metaT.name,
              components: await this.processTemplateComponents(clientId, metaT.components),
              lastEventTs: incomingTs,
            },
            $setOnInsert: {
              channel: 'whatsapp',
              provider: 'meta',
              createdAt: new Date(),
            },
          };

          let updateRes: any;
          try {
            updateRes = await this.templateModel.updateOne(
              upsertFilter,
              upsertPayload,
              { upsert: true },
            );
          } catch (upsertErr: any) {
            if (upsertErr.code === 11000) {
              this.logger.warn(
                `[SYNC][RECONCILE] ⚡ E11000 on ${metaT.name} — concurrent write detected, retrying as plain update`,
              );
              const updateFilter: any = {
                clientId,
                name: metaT.name,
                language: metaT.language,
              };
              if (!targetClientId) {
                updateFilter.lastEventTs = { $lt: incomingTs };
              }
              updateRes = await this.templateModel.updateOne(
                updateFilter,
                { $set: upsertPayload.$set },
              );
            } else {
              throw upsertErr;
            }
          }

          if (updateRes.modifiedCount > 0 || updateRes.upsertedCount > 0) {
            this.logger.log(
              `[SYNC][RECONCILE] ✅ ${updateRes.upsertedCount > 0 ? 'Created' : 'Updated'} ${metaT.name} (${metaT.language}) for client ${clientId}`,
            );

            // 🚀 CACHE INVALIDATION: Clear Redis so the next campaign fetch gets the fresh mediaId/status
            const templateId = updateRes.upsertedId || (await this.templateModel.findOne({ clientId, name: metaT.name, language: metaT.language }, { _id: 1 }).lean())?._id;
            if (templateId) {
              const cacheKey = `wa:tpl:${templateId}`;
              await this.redis.del(cacheKey);
              this.logger.debug(`[SYNC][CACHE] 🗑️ Invalidated cache for ${templateId}`);
            }
          } else {
            this.logger.debug(
              `[SYNC][RECONCILE] ⏩ No changes for ${metaT.name} (${metaT.language})`,
            );
          }
        }
      } catch (error: any) {
        this.logger.error(
          `Failed to sync templates for client ${clientId}: ${error.message}`,
        );
      }
    }

    // 🔄 Final Step: Return up-to-date data for the client
    if (targetClientId) {
      const finalTemplates = await this.templateModel
        .find({ clientId: targetClientId })
        .sort({ createdAt: -1 });
      return {
        success: true,
        message: 'Sync complete',
        data: finalTemplates,
      };
    }
  }

  async createTemplate(payload: CreateTemplateDto) {
    try {
      const normalizedCategory = payload.category.trim().toLowerCase();
      const route =
        normalizedCategory === 'marketing' ? 'promotional' : 'transactional';

      const sanitizedName = payload.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      // --- META POLICY VALIDATION ---
      const bodyComponent = payload.components?.find((c: any) => c.type === 'BODY');
      if (bodyComponent && bodyComponent.text) {
        const trimmedBody = bodyComponent.text.trim();
        const endsWithVariable = /\{\{\d+\}\}$/.test(trimmedBody);
        const endsWithEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]$/u.test(trimmedBody);

        if (endsWithVariable || endsWithEmoji) {
          this.logger.warn(`Rejected template '${sanitizedName}' due to Meta policy violation (ends with var/emoji)`);
          return {
            success: false,
            message: 'Template body cannot end with a variable or an emoji due to Meta policies.',
            status: 400,
            error: 'Validation failed on backend',
          };
        }
      }

      const existing = await this.templateModel.findOne({
        clientId: payload.clientId,
        name: sanitizedName,
        language: payload.language,
      });

      if (existing) {
        this.logger.warn(
          `Template already exists locally: ${sanitizedName} (${payload.language})`,
        );
        return {
          success: true,
          message: 'Template already exists',
          status: 200,
          data: { template: existing },
        };
      }

      const template_data = {
        clientId: payload.clientId,
        name: sanitizedName,
        language: payload.language,
        category: normalizedCategory as any,
        route,
        status: payload.status || TEMPLATE_STATUS.PENDING,
        channel: 'whatsapp',
        provider: 'meta',
        components: payload.components,
        dltTemplateId: payload.dltTemplateId,
        isActive: false,
        ttlSeconds: payload.ttlSeconds,
        clickTracking: payload.clickTracking,
      };

      const template = await this.templateModel.create(template_data);

      let metaResponse: any = null;
      try {
        if (template.status !== 'DRAFT') {
          const metaRes = await this.whatsappTemplateProvider.createTemplate(
            template as any,
          );
          metaResponse = metaRes;
          if (metaRes?.success) {
            await this.templateModel.updateOne(
              { _id: template._id },
              { $set: { providerTemplateId: metaRes.data?.id || metaRes.data?.name } },
            );
          } else {
            // ❌ Meta rejected it immediately (validation error etc.)
            // We should ideally NOT return 200 here if it failed Meta validation
            this.logger.warn(
              `Meta submission failed: ${JSON.stringify(metaRes?.error)}`,
            );
            return {
              success: false,
              message: 'Meta rejected the template',
              status: 400,
              error: metaRes?.error || 'Validation failed on Meta side',
            };
          }
        } else {
          this.logger.log(`Skipping Meta submission for DRAFT template: ${template.name}`); 
        }
      } catch (metaError: any) {
        this.logger.error(`Meta sync error: ${metaError?.message}`);
        return {
          success: false,
          message: 'Failed to communicate with Meta',
          status: 500,
          error: metaError?.message,
        };
      }

      return {
        success: true,
        message: 'Template created successfully and submitted to Meta',
        status: 201,
        data: { template, metaResponse },
      };
    } catch (err: any) {
      this.logger.error(err);
      return {
        success: false,
        message: 'Template creation failed',
        status: 500,
        error: err?.message || JSON.stringify(err),
      };
    }
  }

  async updateTemplate(payload: CreateTemplateDto) {
    try {
      const normalizedCategory = payload.category.trim().toLowerCase();
      const route =
        normalizedCategory === 'marketing' ? 'promotional' : 'transactional';

      const sanitizedName = payload.name
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_')
        .replace(/[^a-z0-9_]/g, '');

      // --- META POLICY VALIDATION ---
      const bodyComponent = payload.components?.find((c: any) => c.type === 'BODY');
      if (bodyComponent && bodyComponent.text) {
        const trimmedBody = bodyComponent.text.trim();
        const endsWithVariable = /\{\{\d+\}\}$/.test(trimmedBody);
        const endsWithEmoji = /[\p{Extended_Pictographic}\p{Emoji_Presentation}]$/u.test(trimmedBody);

        if (endsWithVariable || endsWithEmoji) {
          this.logger.warn(`Rejected template update '${sanitizedName}' due to Meta policy violation (ends with var/emoji)`);
          return {
            success: false,
            message: 'Template body cannot end with a variable or an emoji due to Meta policies.',
            status: 400,
            error: 'Validation failed on backend',
          };
        }
      }

      let existing: any = null;
      if (payload.id) {
        existing = await this.templateModel.findById(payload.id);
      }
      if (!existing) {
        existing = await this.templateModel.findOne({
          clientId: payload.clientId,
          name: sanitizedName,
          language: payload.language,
        });
      }

      if (!existing) {
        return {
          success: false,
          message: 'Template not found',
          status: 404,
        };
      }

      const update_data: any = {
        name: sanitizedName,
        category: normalizedCategory as any,
        route,
        components: payload.components,
        dltTemplateId: payload.dltTemplateId,
        status: payload.status || existing.status,
      };

      if (payload.ttlSeconds !== undefined) update_data.ttlSeconds = payload.ttlSeconds;
      if (payload.clickTracking !== undefined) update_data.clickTracking = payload.clickTracking;

      const updated = await this.templateModel.findOneAndUpdate(
        { _id: existing._id },
        { $set: update_data },
        { new: true },
      );

      if (!updated) {
        return {
          success: false,
          message: 'Template not found on update',
          status: 404,
        };
      }

      let metaResponse: any = null;
      try {
        if (updated.status !== 'DRAFT') {
          const metaRes = existing.name !== sanitizedName
            ? await this.whatsappTemplateProvider.createTemplate(updated as any)
            : await this.whatsappTemplateProvider.updateTemplate(updated as any, existing);

          metaResponse = metaRes;
          if (metaRes?.success) {
            await this.templateModel.updateOne(
              { _id: updated._id },
              { $set: { providerTemplateId: metaRes.data?.id || metaRes.data?.name || updated.providerTemplateId } },
            );
          } else {
            return {
              success: false,
              message: 'Meta rejected the template update',
              status: 400,
              error: metaRes?.error || 'Validation failed on Meta side',
            };
          }
        }
      } catch (metaError: any) {
        this.logger.error(`Meta sync error on update: ${metaError?.message}`);
        return {
          success: false,
          message: 'Failed to communicate with Meta',
          status: 500,
          error: metaError?.message,
        };
      }

      return {
        success: true,
        message: 'Template updated successfully',
        status: 200,
        data: { template: updated, metaResponse },
      };
    } catch (error: any) {
      this.logger.error(`Failed to update template: ${error.message}`);
      return {
        success: false,
        message: 'Template update failed',
        status: 500,
        error: error.message,
      };
    }
  }

  async deleteTemplate(id: string) {
    try {
      const deleted = await this.templateModel.findByIdAndDelete(id);
      if (!deleted) {
        return {
          success: false,
          message: 'Template not found',
          status: 404,
        };
      }
      return {
        success: true,
        message: 'Template deleted successfully',
        status: 200,
      };
    } catch (error: any) {
      this.logger.error(`Failed to delete template: ${error.message}`);
      return {
        success: false,
        message: 'Failed to delete template',
        status: 500,
        error: error.message,
      };
    }
  }

  async getTemplatesByClient(clientId: number) {
    try {
      const templates = await this.templateModel
        .find({ clientId })
        .sort({ createdAt: -1 });
      return {
        success: true,
        data: templates,
      };
    } catch (error: any) {
      return {
        success: false,
        message: 'Failed to fetch templates',
        error: error.message,
      };
    }
  }

  /**
   * 🖼️ Process Template Components
   * Downloads header images/videos to local storage to ensure long-term accessibility.
   */
  private async processTemplateComponents(clientId: number, components: any[]) {
    if (!components) return components;

    for (const comp of components) {
      if (comp.type === 'HEADER' && ['IMAGE', 'VIDEO', 'DOCUMENT'].includes(comp.format)) {
        const handleUrl = comp.example?.header_handle?.[0];
        if (handleUrl && handleUrl.startsWith('http')) {
          try {
            this.logger.log(`[SYNC][MEDIA] Downloading header ${comp.format} for template...`);
            
            const response = await axios.get(handleUrl, { responseType: 'arraybuffer' });
            const buffer = Buffer.from(response.data);
            const contentType = response.headers['content-type'];
            
            // Generate a stable local path
            const extension = contentType.split('/')[1] || 'png';
            const fileName = `template_header_${Date.now()}.${extension}`;
            const subDir = comp.format.toLowerCase() === 'image' ? 'images' : 
                          comp.format.toLowerCase() === 'video' ? 'videos' : 'documents';
            
            const localKey = `templates/${subDir}/${fileName}`;
            const localUrl = await this.storageService.uploadBuffer(buffer, localKey, contentType);
            
            // Add localUrl to the component so both UI and Dispatch can use it
            comp.mediaUrl = localUrl;

            // 🚀 UPLOAD TO META: This gives us a media_id.
            // When sending the template, we'll use this ID instead of the link.
            // This bypasses Cloudflare 403 blocks for scraper bots like Meta.
            try {
              const metaMediaRes = await this.whatsappMediaProvider.uploadMedia(
                clientId,
                buffer,
                fileName,
                contentType,
                'TEMPLATE', // 👈 PASSING TYPE SO IT GETS A PERSISTENT HANDLE IF NEEDED
              );
              if (metaMediaRes.success && metaMediaRes.data?.mediaId) {
                comp.mediaId = metaMediaRes.data.mediaId;
                this.logger.log(`[SYNC][MEDIA] 🚀 Meta media_id generated: ${comp.mediaId}`);
              }
            } catch (metaUploadErr: any) {
              this.logger.warn(`[SYNC][MEDIA] Meta upload failed (non-critical): ${metaUploadErr.message}`);
            }

            this.logger.log(`[SYNC][MEDIA] ✅ Cached header ${comp.format} to: ${localUrl}`);
          } catch (err: any) {
            this.logger.warn(`[SYNC][MEDIA] Failed to cache header media: ${err.message}`);
          }
        }
      }
    }
    return components;
  }
}
