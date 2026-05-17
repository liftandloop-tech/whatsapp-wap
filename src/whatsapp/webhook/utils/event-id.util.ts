import { createHash } from 'crypto';

/**
 * 🔑 Event ID Utility
 *
 * Builds the two idempotency keys used throughout the template webhook pipeline.
 */

/**
 * Composite event identity key — used as BullMQ jobId (transient dedup).
 *
 * Format: `{wabaId}:{templateName}:{language}:{event}:{timestamp}`
 *
 * Includes timestamp so distinct events for the same template
 * (e.g. REJECTED → APPROVED) are never collapsed into one key.
 */
export function buildEventId(
  wabaId: string,
  templateName: string,
  language: string,
  event: string,
  timestamp: number | string,
): string {
  return `${wabaId}:${templateName}:${language}:${event}:${timestamp}`;
}

/**
 * sha256 of the raw payload object — used as DB-level dedup guard (permanent).
 *
 * BullMQ jobId dedup expires when the job is removed.
 * If Meta replays the exact same payload later, the eventHash catches it.
 */
export function buildEventHash(rawPayload: object): string {
  return createHash('sha256').update(JSON.stringify(rawPayload)).digest('hex');
}
