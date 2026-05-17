import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Redis from 'ioredis';
import { Template } from '../schemas/template.schema';
import { PrismaService } from '../../infra/prisma/prisma.service';

@Injectable()
export class TemplateCacheService {
  private readonly logger = new Logger(TemplateCacheService.name);

  private readonly TTL = 300; // 5 minutes
  private readonly KEY_PREFIX = 'wa:tpl:';

  // 🔒 In-memory locks to prevent cache stampede
  private readonly inFlightFetches = new Map<string, Promise<any>>();

  constructor(
    @InjectModel(Template.name)
    private readonly templateModel: Model<Template>,
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 🔥 Main entry point for Hydration
   */
  async getTemplate(templateId: string): Promise<any> {
    const cacheKey = this.KEY_PREFIX + templateId;

    // 1. Try Redis
    const cached = await this.redis.get(cacheKey);

    if (cached) {
      this.logger.debug(`Cache HIT → ${templateId}`);
      return JSON.parse(cached);
    }

    this.logger.debug(`Cache MISS → ${templateId}`);

    // 2. Prevent stampede
    if (this.inFlightFetches.has(templateId)) {
      this.logger.debug(`Waiting on in-flight fetch → ${templateId}`);
      return this.inFlightFetches.get(templateId);
    }

    // 3. Create single fetch promise
    const fetchPromise = this.fetchAndCache(templateId, cacheKey);

    this.inFlightFetches.set(templateId, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this.inFlightFetches.delete(templateId);
    }
  }

  /**
   * 🧱 Fetch from DB + store in Redis
   */
  private async fetchAndCache(templateId: string, cacheKey: string) {
    let template;

    // 1. Try MongoDB First (Legacy)
    if (Types.ObjectId.isValid(templateId)) {
      template = await this.templateModel.findById(templateId).lean();
    }

    // 2. Try PostgreSQL if not found (Modern)
    if (!template) {
      const pgTemplate = await this.prisma.messageTemplate.findUnique({
        where: { id: templateId },
        include: { components: true },
      });

      if (pgTemplate) {
        // Hydrate to match expected provider structure
        template = {
          _id: pgTemplate.id,
          name: pgTemplate.name,
          language: pgTemplate.language,
          category: pgTemplate.category,
          components: pgTemplate.components.map((c: any) => ({
            type: c.type,
            format: c.format,
            text: c.text,
            mediaUrl: c.mediaUrl,
            mediaId: c.mediaId,
            example: null, // Basic stub
          })),
        };
      }
    }

    if (!template) {
      throw new Error(`UNRECOVERABLE: Template not found: ${templateId}`);
    }

    // 2. Serialize safely
    const serialized = JSON.stringify(template);

    // 3. Store in Redis with TTL
    await this.redis.set(cacheKey, serialized, 'EX', this.TTL);

    this.logger.debug(`Cached template → ${templateId}`);

    return template;
  }
}
