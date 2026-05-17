/**
 * Distributed Messaging Infrastructure: Constants
 *
 * Provides a centralized registry for all the Redis-based queue engines,
 * job names, and shared messaging identifiers.
 */

export const WHATSAPP_QUEUE_IDS = {
  BULK: 'whatsapp-bulk',
  TRANSACTIONAL: 'whatsapp-transactional',
  TEMPLATE_WEBHOOK: 'template-webhook-processing',
  REFUND: 'whatsapp-refund',
};

export const WHATSAPP_JOB_NAMES = {
  SEND_TEMPLATE: 'send-template-message',
  SEND_OTP: 'send-otp-message',
  PROCESS_TEMPLATE_WEBHOOK: 'process-template-webhook',
  REFUND: 'refund',
};

export const WHATSAPP_QUEUE_SETTINGS = {
  REDIS_PREFIX: 'wa_service:',
  CONNECTION_NAME: 'whatsapp-bull',
  STALLED_INTERVAL: 30000,
  LOCK_DURATION: 30000,
};
