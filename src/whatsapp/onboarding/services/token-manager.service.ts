import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import Redis from 'ioredis';
import { TokenManager } from '../interfaces/token-manager.interface';
import {
  WabaAccount,
  WabaAccountDocument,
} from '../schemas/waba-account.schema';
import { OnboardingState } from '../onboarding-state.enum';
import { v4 as uuidv4 } from 'uuid';

interface CachedToken {
  accessToken: string;
  expiresAt: number;
  refreshAt: number;
}

@Injectable()
export class TokenManagerServiceImpl implements TokenManager {
  private readonly logger = new Logger(TokenManagerServiceImpl.name);
  private readonly memoryCache = new Map<string, CachedToken>();
  private readonly REFRESH_BUFFER_MS = 10 * 60 * 1000; // 10 minutes
  private readonly LOCK_TTL_SEC = 10;

  constructor(
    @Inject('REDIS_CLIENT') private readonly redis: Redis,
    @InjectModel(WabaAccount.name)
    private readonly wabaAccountModel: Model<WabaAccountDocument>,
  ) {}

  async getValidToken(wabaAccountId: string): Promise<string> {
    // 1. In-Memory Fast Path
    const local = this.memoryCache.get(wabaAccountId);
    if (local && local.refreshAt > Date.now()) {
      return local.accessToken;
    }

    // 2. Redis Cache Check
    const cached = await this.getFromRedis(wabaAccountId);
    if (cached && cached.refreshAt > Date.now()) {
      this.updateMemoryCache(wabaAccountId, cached);
      return cached.accessToken;
    }

    // 3. Double-Checked Locking
    const lockKey = `waba_token_lock:${wabaAccountId}`;
    const lockValue = uuidv4();

    const acquired = await this.redis.set(
      lockKey,
      lockValue,
      'EX',
      this.LOCK_TTL_SEC,
      'NX',
    );
    if (!acquired) {
      // Wait and retry once
      await new Promise((res) => setTimeout(res, 1000));
      return this.getValidToken(wabaAccountId);
    }

    try {
      // 4. Check status again after acquiring lock
      const reCheck = await this.getFromRedis(wabaAccountId);
      if (reCheck && reCheck.refreshAt > Date.now()) {
        return reCheck.accessToken;
      }

      // 5. Refresh Logic
      const tokenData = await this.refreshAndStoreToken(wabaAccountId);
      return tokenData.accessToken;
    } finally {
      // 6. Safe Lock Release
      const currentLock = await this.redis.get(lockKey);
      if (currentLock === lockValue) {
        await this.redis.del(lockKey);
      }
    }
  }

  async refreshToken(wabaAccountId: string): Promise<void> {
    this.logger.log(`Forcing token refresh for WABA Account: ${wabaAccountId}`);
    await this.refreshAndStoreToken(wabaAccountId);
  }

  async invalidateToken(wabaAccountId: string): Promise<void> {
    this.logger.warn(`Invalidating token for WABA Account: ${wabaAccountId}`);
    await this.redis.del(`waba_token:${wabaAccountId}`);
    this.memoryCache.delete(wabaAccountId);
  }

  /**
   * Idempotency check: Set a result if key doesn't exist, or return existing.
   */
  async getOrSetIdempotentResponse<T>(
    key: string,
    ttlSec: number,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const redisKey = `idempotency:${key}`;
    const cached = await this.redis.get(redisKey);
    if (cached) {
      this.logger.debug(`Idempotency hit for key: ${key}`);
      return JSON.parse(cached);
    }

    const result = await fetcher();
    await this.redis.set(redisKey, JSON.stringify(result), 'EX', ttlSec);
    return result;
  }

  private async getFromRedis(
    wabaAccountId: string,
  ): Promise<CachedToken | null> {
    const data = await this.redis.get(`waba_token:${wabaAccountId}`);
    return data ? JSON.parse(data) : null;
  }

  private updateMemoryCache(wabaAccountId: string, token: CachedToken) {
    this.memoryCache.set(wabaAccountId, token);
  }

  private async refreshAndStoreToken(
    wabaAccountId: string,
  ): Promise<CachedToken> {
    const startTime = Date.now();
    try {
      // Find account in DB
      const account = await this.wabaAccountModel.findById(wabaAccountId);
      if (!account) throw new Error(`WabaAccount not found: ${wabaAccountId}`);

      // Perform refresh (In a real BSP app, we would call Meta's OAuth exchange)
      // For now, we assume the token in the DB is our source, and we might verify it.
      // If we had a refresh_token flow, it would go here.

      const tokenData: CachedToken = {
        accessToken: account.accessToken,
        expiresAt: account.tokenExpiresAt
          ? account.tokenExpiresAt.getTime()
          : Date.now() + 3600 * 1000,
        refreshAt: account.tokenExpiresAt
          ? account.tokenExpiresAt.getTime() - this.REFRESH_BUFFER_MS
          : Date.now() + 3600 * 1000 - this.REFRESH_BUFFER_MS,
      };

      // Update Redis
      const ttl = Math.ceil((tokenData.expiresAt - Date.now()) / 1000);
      if (ttl > 0) {
        await this.redis.set(
          `waba_token:${wabaAccountId}`,
          JSON.stringify(tokenData),
          'EX',
          ttl,
        );
      }

      this.updateMemoryCache(wabaAccountId, tokenData);

      this.logger.log({
        event: 'TOKEN_REFRESH_SUCCESS',
        wabaAccountId,
        latencyMs: Date.now() - startTime,
      });

      return tokenData;
    } catch (error: any) {
      this.logger.error({
        event: 'TOKEN_REFRESH_FAILED',
        wabaAccountId,
        error: error.message,
      });

      // Escalation: If we can't refresh, move to FAILED_PERMANENT
      await this.wabaAccountModel.findByIdAndUpdate(wabaAccountId, {
        status: OnboardingState.FAILED_PERMANENT,
        lastError: {
          code: 'REFRESH_FAILED',
          message: error.message,
          timestamp: new Date(),
        },
      });

      throw error;
    }
  }
}
