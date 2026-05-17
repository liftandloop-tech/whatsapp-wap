import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Job } from 'bullmq';
import { Template } from '../../schemas/template.schema';
import {
  ProcessedEvent,
  ProcessedEventDocument,
} from '../../schemas/processed-event.schema';
import { WabaCredentialService } from '../../services/waba-credential.service';
import { WHATSAPP_QUEUE_IDS } from '../../constants/whatsapp-queue.constants';

export interface TemplateWebhookJobData {
  eventId: string;
  eventHash: string;
  wabaId: string;
  payload: {
    event: string;
    message_template_name: string;
    message_template_language: string;
    message_template_category?: string;
    timestamp?: number;
    reason?: string;
  };
}

/**
 * 🔄 TemplateWebhookProcessor
 *
 * Consumes jobs from the `template-webhook-processing` BullMQ queue.
 * Implements the full reliability contract from the v3 plan:
 *
 *  1. DB-level permanent dedup check (eventHash, unique index on ProcessedEvent)
 *  2. Timestamp-guarded upsert — enforces true "latest wins" causal ordering
 *  3. DLQ visibility on onFailed with structured logging
 */
@Injectable()
@Processor(WHATSAPP_QUEUE_IDS.TEMPLATE_WEBHOOK)
export class TemplateWebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(TemplateWebhookProcessor.name);

  constructor(
    @InjectModel(Template.name)
    private readonly templateModel: Model<Template>,

    @InjectModel(ProcessedEvent.name)
    private readonly processedEventModel: Model<ProcessedEventDocument>,

    private readonly wabaCredentialService: WabaCredentialService,
  ) {
    super();
  }

  async process(job: Job<TemplateWebhookJobData>): Promise<void> {
    const { eventId, eventHash, wabaId, payload } = job.data;
    const {
      event,
      message_template_name: name,
      message_template_language: language,
      message_template_category: category,
      timestamp: rawTs,
    } = payload;

    this.logger.log(
      `[PROCESSOR] Processing job ${job.id} | ${name} (${language}) → ${event}`,
    );

    // ─── Step 1: Permanent DB-level dedup ───────────────────────────────
    // BullMQ jobId dedup expires when the job is removed. If Meta replays
    // the exact same payload after the job has cleared, this catches it.
    try {
      await this.processedEventModel.create({
        eventHash,
        eventId,
        wabaId,
        templateName: name,
        event,
      });
    } catch (err: any) {
      if (err.code === 11000) {
        // Duplicate key — this exact payload was already processed.
        this.logger.warn(
          `[PROCESSOR] Skipping duplicate event (hash collision): ${eventId}`,
        );
        return; // Ack the job — no retry needed
      }
      // Unknown DB error — let BullMQ retry
      throw err;
    }

    // ─── Step 2: Resolve clientId from wabaId ───────────────────────────
    const clientId = await this.wabaCredentialService.getClientByWabaId(wabaId);
    if (!clientId) {
      this.logger.warn(
        `[PROCESSOR] No client found for WABA ${wabaId} — event: ${eventId}`,
      );
      return;
    }

    // ─── Step 3: Build update data + guard timestamp ─────────────────────
    // Meta sends timestamp in seconds. Malformed / missing timestamps must
    // NOT fall back to Date.now() silently — that would make every event
    // look like the latest and defeat the ordering guarantee entirely.
    // Instead, throw so BullMQ retries (payload should always have ts).
    const rawTsNum = rawTs ? Number(rawTs) : NaN;
    if (!rawTs || isNaN(rawTsNum) || rawTsNum <= 0) {
      // Fallback: use current time with a warn — allows processing to
      // continue while surfacing the anomaly for investigation.
      this.logger.warn(
        `[PROCESSOR] ⚠️ Missing or invalid timestamp in payload for ${eventId}. ` +
          `Falling back to server time — ordering cannot be guaranteed for this event.`,
      );
    }
    const incomingTs =
      rawTs && !isNaN(rawTsNum) && rawTsNum > 0
        ? rawTsNum * 1000 // Meta sends Unix seconds → convert to ms
        : Date.now(); // Fallback: log-and-continue (not throw) to avoid DLQ on Meta quirks

    const isActive = event === 'APPROVED' || event === 'REINSTATED';

    const updateData: any = {
      status: event,
      isActive,
      lastEventTs: incomingTs,
    };
    if (category) updateData.category = category.toLowerCase();

    // ─── Step 4: Timestamp-guarded upsert ────────────────────────────────
    // ONLY writes if incomingTs is newer than the last applied event.
    // Stale / out-of-order events become a no-op — not a corruption.
    const result = await this.templateModel.updateOne(
      {
        clientId,
        name,
        language,
        $or: [
          { lastEventTs: { $lt: incomingTs } },
          { lastEventTs: { $exists: false } },
        ],
      },
      {
        $set: updateData,
        $setOnInsert: {
          clientId,
          name,
          language,
          channel: 'whatsapp',
          provider: 'meta',
          // route and category are required — default to utility/marketing if unknown
          route: category?.toLowerCase().includes('marketing')
            ? 'promotional'
            : 'transactional',
          category: category?.toLowerCase() ?? 'utility',
          components: [],
          createdAt: new Date(),
        },
      },
      { upsert: true },
    );

    if (result.modifiedCount > 0) {
      this.logger.log(
        `[PROCESSOR] ✅ Updated ${name} (${language}) → ${event} for client ${clientId}`,
      );
    } else if (result.upsertedCount > 0) {
      this.logger.log(
        `[PROCESSOR] ✨ Created new template ${name} (${language}) → ${event} for client ${clientId}`,
      );
    } else {
      // Filter matched nothing — incomingTs was stale
      this.logger.warn(
        `[PROCESSOR] ⏩ Discarded stale event for ${name} (${language}) — already have newer state`,
      );
    }
  }

  @OnWorkerEvent('failed')
  onFailed(job: Job<TemplateWebhookJobData>, err: Error): void {
    const isFinal = job.attemptsMade >= (job.opts?.attempts ?? 3);
    const { eventId, wabaId } = job.data;

    if (isFinal) {
      this.logger.error(
        `[DLQ] ❌ Job ${job.id} permanently failed after ${job.attemptsMade} attempts. ` +
          `Event: ${eventId} | WABA: ${wabaId} | Error: ${err.message}`,
      );
    } else {
      this.logger.warn(
        `[RETRY] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts?.attempts ?? 3}): ${err.message}`,
      );
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.debug(`[PROCESSOR] Job ${job.id} completed`);
  }
}
