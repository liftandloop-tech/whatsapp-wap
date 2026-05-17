import { MetaApiError } from './errors/meta-api.error';
import { ErrorType } from './errors/onboarding.error';

export interface RetryConfig {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
}

export class MetaApiRetryStrategy {
  private static readonly DEFAULT_CONFIG: RetryConfig = {
    maxAttempts: 3,
    baseDelay: 500,
    maxDelay: 5000,
  };

  static shouldRetry(
    error: any,
    attempt: number,
    config: RetryConfig = this.DEFAULT_CONFIG,
  ): boolean {
    if (attempt >= config.maxAttempts) return false;

    // Retry on network errors
    if (error.isAxiosError && !error.response) return true;

    // Retry on 5xx errors
    if (error.response?.status >= 500) return true;

    // Retry on specific Meta Error types
    if (error instanceof MetaApiError && error.type === ErrorType.RETRYABLE) {
      return true;
    }

    return false;
  }

  static getNextDelay(
    attempt: number,
    config: RetryConfig = this.DEFAULT_CONFIG,
  ): number {
    const delay = config.baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 100; // Add 0-100ms jitter
    return Math.min(delay + jitter, config.maxDelay);
  }
}
