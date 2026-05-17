import {
  Controller,
  Post,
  Param,
  Headers,
  UnauthorizedException,
  Inject,
  Logger,
} from '@nestjs/common';
import Redis from 'ioredis';
import { WhatsappGateway } from '../gateways/whatsapp.gateway';

@Controller('internal')
export class InternalController {
  private readonly logger = new Logger(InternalController.name);
  private readonly internalSecret =
    process.env.INTERNAL_SYNC_SECRET || 'sync_987654321';

  constructor(
    @Inject('REDIS_CLIENT')
    private readonly redisClient: Redis,
    private readonly gateway: WhatsappGateway,
  ) {}

  /**
   * Cache Invalidation & Event Broadcast
   * Triggered by swakora-backend when a user completes Meta Onboarding.
   */
  @Post('cache-invalidate/:clientId')
  async invalidateCache(
    @Param('clientId') clientId: number,
    @Headers('x-internal-secret') providedSecret: string,
  ) {
    // 1. Security Check (Internal Host Inbound Only)
    if (!providedSecret || providedSecret !== this.internalSecret) {
      this.logger.error(
        `[UNAUTHORIZED_INTERNAL_SYNC] Access denied for client ID ${clientId}`,
      );
      throw new UnauthorizedException('Access denied (Internal Sync only)');
    }

    this.logger.log(
      `[VAULT_NOTIFICATION] Resetting cache + broadcasting for client ${clientId}`,
    );

    // 2. Redis Invalidation (Evict stale credentials)
    const cacheKey = `waba_creds:${clientId}`;
    await this.redisClient.del(cacheKey);

    // 3. UI/Frontend Sync (The "Connected" UX Glow)
    // Broadcasts to all user's active sockets (Dashboard, Campaign Manager, etc.)
    this.gateway.emitToClient(clientId, 'waba_connected', {
      clientId,
      timestamp: new Date().toISOString(),
    });

    return {
      success: true,
      invalidated: true,
      message: 'Cache cleared and broadcasted.',
    };
  }
}
