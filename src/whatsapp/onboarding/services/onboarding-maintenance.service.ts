import { Inject, Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import {
  WabaAccount,
  WabaAccountDocument,
} from '../schemas/waba-account.schema';
import { OnboardingState } from '../onboarding-state.enum';
import type { MetaApiService } from '../interfaces/meta-api.interface';

@Injectable()
export class OnboardingMaintenanceService {
  private readonly logger = new Logger(OnboardingMaintenanceService.name);
  private readonly REFRESH_THRESHOLD_DAYS = 7;

  constructor(
    @InjectModel(WabaAccount.name)
    private readonly wabaAccountModel: Model<WabaAccountDocument>,
    @Inject('META_API_SERVICE') private readonly metaApi: MetaApiService,
  ) {}

  /**
   * 🔁 Automated Token Refresh (Phase 1A: Maintenance)
   * Runs daily at midnight to refresh tokens expiring within 7 days.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleTokenRefresh() {
    this.logger.log('[Maintenance] Checking for expiring WABA tokens...');

    const thresholdDate = new Date();
    thresholdDate.setDate(
      thresholdDate.getDate() + this.REFRESH_THRESHOLD_DAYS,
    );

    // Find accounts with tokens expiring soon
    const expiringAccounts = await this.wabaAccountModel.find({
      tokenExpiresAt: { $lte: thresholdDate },
      status: { $nin: [OnboardingState.FAILED_PERMANENT] },
    });

    this.logger.log(
      `[Maintenance] Found ${expiringAccounts.length} tokens requiring refresh.`,
    );

    for (const account of expiringAccounts) {
      try {
        const refreshed = await this.metaApi.refreshToken(account.accessToken);

        await this.wabaAccountModel.updateOne(
          { _id: account._id },
          {
            $set: {
              accessToken: refreshed.accessToken,
              tokenExpiresAt: new Date(Date.now() + refreshed.expiresIn * 1000),
            },
          },
        );

        this.logger.log(
          `[Maintenance] Successfully refreshed token for WABA ${account.wabaId}`,
        );
      } catch (error: any) {
        this.logger.error(
          `[Maintenance] Failed to refresh WABA ${account.wabaId}: ${error.message}`,
        );

        // If it's an OAuth error (Auth code expired), mark as REAUTH_REQUIRED
        if (
          error.message.includes('OAUTH') ||
          error.message.includes('access token')
        ) {
          await this.wabaAccountModel.updateOne(
            { _id: account._id },
            { $set: { status: OnboardingState.FAILED_TEMP } },
          );
        }
      }
    }
  }

  /**
   * 📲 Health & Quality Monitor (Phase 1B: Scaling)
   * Checks phone number quality ratings hourly to trigger adaptive throttling.
   */
  @Cron(CronExpression.EVERY_HOUR)
  async monitorPhoneQuality() {
    const activeAccounts = await this.wabaAccountModel.find({
      status: OnboardingState.LIVE,
      phoneNumberId: { $exists: true },
    });

    for (const account of activeAccounts) {
      if (!account.phoneNumberId) continue;

      try {
        const status = await this.metaApi.getPhoneStatus(
          account.wabaId,
          account.phoneNumberId,
        );

        // If quality rating changed to RED, log a warning and potentially sync to dashboard
        if (status.quality_rating === 'RED') {
          this.logger.warn(
            `[HEALTH_ALERT] WABA ${account.wabaId} number ${account.phoneNumber} has RED quality rating!`,
          );
        }

        await this.wabaAccountModel.updateOne(
          { _id: account._id },
          {
            $set: {
              rawMetaStatus: status.status,
              'metadata.qualityRating': status.quality_rating,
            },
          },
        );
      } catch (error: any) {
        this.logger.error(
          `[Maintenance] Quality check failed for ${account.wabaId}: ${error.message}`,
        );
      }
    }
  }
}
