import { Injectable } from '@nestjs/common';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';

@Injectable()
export class RateLimiterService {
  private limiters: Map<string, RateLimiterMemory> = new Map();

  /**
   * Consume a point for a given tenant/key.
   * Throws an error if limit exceeded.
   */
  async consume(key: string, points = 1, options: { points: number; duration: number } = { points: 10, duration: 1 }) {
    let limiter = this.limiters.get(key);
    
    if (!limiter) {
      limiter = new RateLimiterMemory({
        points: options.points,
        duration: options.duration,
      });
      this.limiters.set(key, limiter);
    }

    try {
      await limiter.consume(key, points);
    } catch (rejRes) {
      const res = rejRes as RateLimiterRes;
      throw new Error(`Rate limit exceeded for ${key}. Retry after ${Math.round(res.msBeforeNext / 1000)}s`);
    }
  }
}
