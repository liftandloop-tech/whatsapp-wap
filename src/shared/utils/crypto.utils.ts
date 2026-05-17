import * as crypto from 'crypto';

export class CryptoUtils {
  /**
   * Verify X-Hub-Signature-256 for Meta Webhooks
   */
  static verifySignature(
    payload: string,
    signature: string,
    appSecret: string,
  ): boolean {
    if (!signature || !appSecret) return false;

    const [algo, hash] = signature.split('=');
    if (algo !== 'sha256') return false;

    const expectedHash = crypto
      .createHmac('sha256', appSecret)
      .update(payload)
      .digest('hex');

    const hashBuffer = Buffer.from(hash || '');
    const expectedBuffer = Buffer.from(expectedHash);

    if (hashBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(hashBuffer, expectedBuffer);
  }

  /**
   * Generate a deterministic hash for a payload to avoid duplicate processing
   */
  static generateEventHash(payload: any): string {
    const str = JSON.stringify(payload);
    return crypto.createHash('sha256').update(str).digest('hex');
  }
}
