import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Campaign } from '../schemas/campaign.schema';
import { Message } from '../schemas/message.schema';
import axios from 'axios';

@Injectable()
export class CampaignGuardService {
  private readonly logger = new Logger(CampaignGuardService.name);

  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<Campaign>,
    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,
  ) {}

  /**
   * 🏁 Check if a campaign is finished and notify backend
   */
  async checkCompletion(campaignId: string) {
    try {
      // 1. Count remaining non-terminal messages
      const remaining = await this.messageModel.countDocuments({
        campaignId,
        status: { $in: ['queued', 'scheduled', 'processing', 'retry'] },
      });

      if (remaining === 0) {
        this.logger.log(
          `[CAMPAIGN_COMPLETE] Campaign=${campaignId} has no pending messages. Notifying backend.`,
        );

        // 2. Update local state
        await this.campaignModel.updateOne(
          { _id: campaignId },
          { $set: { status: 'completed', completedAt: new Date() } },
        );

        // 3. Sync with Truth Bridge (Backend)
        try {
          await axios.patch(
            `${process.env.BACKEND_INTERNAL_URL}/complete-campaign`,
            {
              campaignId,
            },
            {
              headers: {
                'x-internal-secret':
                  process.env.INTERNAL_SYNC_SECRET || 'sync_987654321',
              },
            },
          );
        } catch (syncErr: any) {
          this.logger.error(
            `[SYNC_FAILURE] Failed to notify backend of completion for Campaign=${campaignId}: ${syncErr.message}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.error(
        `[COMPLETION_CHECK_ERROR] Campaign=${campaignId}: ${err.message}`,
      );
    }
  }
}
