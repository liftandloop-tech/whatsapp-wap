export class RateLimitError extends Error {
  public readonly phoneNumberId: string;
  public readonly retryAfterMs: number;

  constructor(phoneNumberId: string, retryAfterMs: number) {
    super(`Rate limit exceeded for ${phoneNumberId}`);
    this.phoneNumberId = phoneNumberId;
    this.retryAfterMs = retryAfterMs;
  }
}
