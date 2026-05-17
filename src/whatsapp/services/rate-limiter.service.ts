import { Injectable, Logger, Inject } from '@nestjs/common';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { RateLimitError } from '../errors/rate-limit.error';

@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  private limiter: RateLimiterRedis;

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redis: Redis,
  ) {
    this.limiter = new RateLimiterRedis({
      storeClient: this.redis,
      keyPrefix: 'wa:throttle',
      points: 80, // Baseline: 80 msgs/sec per phone number
      duration: 1, // Measured per second
      blockDuration: 0, // Do not hard block; rely on BullMQ backpressure
    });
  }

  /**
   * 📡 Perform Pre-dispatch Throttle
   * Ensures we stay within Meta Cloud API throughput tiers per unique sender.
   */
  async consume(phoneNumberId: string): Promise<void> {
    try {
      // Per-sender isolation
      await this.limiter.consume(phoneNumberId, 1);
    } catch (error: any) {
      this.logger.warn(
        `[THROTTLE_ACTIVE] Phone=${phoneNumberId} | Retrying in ${error.msBeforeNext}ms`,
      );

      throw new RateLimitError(phoneNumberId, error?.msBeforeNext || 500);
    }
  }
}
