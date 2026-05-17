import { Logger } from '@nestjs/common';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { TokenManager } from './interfaces/token-manager.interface';
import { MetaApiErrorMapper } from './errors/meta-api.error';
import { MetaApiRetryStrategy } from './meta-api.retry.strategy';
import { ErrorType } from './errors/onboarding.error';

export interface MetaRequestOptions {
  retryCount?: number;
  idempotencyKey?: string;
  requestId?: string;
}

export class MetaApiExecutor {
  private readonly logger = new Logger(MetaApiExecutor.name);
  private readonly httpClient: AxiosInstance;

  constructor(private readonly tokenManager: TokenManager) {
    this.httpClient = axios.create({
      baseURL:
        process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com/v25.0',
      timeout: 10000,
    });
  }

  async execute<T>(
    config: AxiosRequestConfig & { wabaId: string },
    options: MetaRequestOptions = {},
    attempt = 0,
  ): Promise<T> {
    const requestId = options.requestId || `req_${Date.now()}`;
    const { wabaId, ...axiosConfig } = config;

    try {
      // 1. Inject Valid Token
      const token = await this.tokenManager.getValidToken(wabaId);

      this.logger.debug(
        `[META_API] Initiating request | op=${config.method} ${config.url} | waba=${wabaId} | attempt=${attempt} | requestId=${requestId}`,
      );

      const response = await this.httpClient.request({
        ...axiosConfig,
        headers: {
          ...axiosConfig.headers,
          Authorization: `Bearer ${token}`,
          'X-Idempotency-Key': options.idempotencyKey,
        },
      });

      return response.data;
    } catch (error: any) {
      const metaError = error.response?.data?.error
        ? MetaApiErrorMapper.map(error.response.data.error)
        : error;

      // 2. Handle Token Expiry (190)
      if (metaError.code === 190 && attempt < 1) {
        this.logger.warn(
          `[META_API] Token expired for WABA ${wabaId}. Invalidating and retrying once...`,
        );
        await this.tokenManager.invalidateToken(wabaId);
        return this.execute(config, options, attempt + 1);
      }

      // 3. Handle Retries
      if (MetaApiRetryStrategy.shouldRetry(metaError, attempt)) {
        const delay = MetaApiRetryStrategy.getNextDelay(attempt);
        this.logger.warn(
          `[META_API] Request failed (retryable). Retrying in ${delay}ms... | waba=${wabaId} | error=${metaError.message}`,
        );
        await new Promise((res) => setTimeout(res, delay));
        return this.execute(config, options, attempt + 1);
      }

      // 4. Log and Rethrow
      this.logger.error(
        `[META_API] Request failed (terminal) | op=${config.method} ${config.url} | waba=${wabaId} | error=${metaError.message}`,
      );
      throw metaError;
    }
  }
}
