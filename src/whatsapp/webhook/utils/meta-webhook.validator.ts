import * as crypto from 'crypto';

export class MetaWebhookValidator {
  /**
   * Verifies the authenticity of a Meta Webhook request.
   * Requires the RAW body string.
   */
  static verifySignature(
    rawBody: string,
    signature: string,
    appSecret: string,
  ): boolean {
    if (!signature || !appSecret) return false;

    // Signature format: sha256=abcdef123...
    const [algorithm, actualHex] = signature.split('=');
    if (algorithm !== 'sha256' || !actualHex) return false;

    const expectedHex = crypto
      .createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex');

    // Time-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(expectedHex),
      Buffer.from(actualHex),
    );
  }
}
