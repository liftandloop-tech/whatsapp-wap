import { Injectable, NotFoundException } from '@nestjs/common';
import { CampaignReportRequestDto } from '../dto/campaign-report-request.dto';
import { Model, Types } from 'mongoose';
import { Campaign } from '../../schemas/campaign.schema';
import { InjectModel } from '@nestjs/mongoose';
import { MessageLog } from '../../schemas/message-log.schema';
import { Message } from '../../schemas/message.schema';
import { PrismaService } from '../../../infra/prisma/prisma.service';

@Injectable()
export class CampaignReportService {
  constructor(
    @InjectModel(Campaign.name)
    private readonly campaignModel: Model<Campaign>,

    @InjectModel(MessageLog.name)
    private readonly messageLogModel: Model<MessageLog>,

    @InjectModel(Message.name)
    private readonly messageModel: Model<Message>,

    private readonly prisma: PrismaService,
  ) {}

  // 1. GET ALL Campaigns Report (with stats)
  async getCampaignsReport(payload: CampaignReportRequestDto) {
    try {
      if (!payload.dateRange?.start || !payload.dateRange?.end) {
        throw new Error('Missing date range');
      }

      const start = new Date(payload.dateRange.start);
      const end = new Date(payload.dateRange.end);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        throw new Error('Invalid date format');
      }

      const page = Number(payload.page) || 1;
      const limit = Number(payload.limit) || 50;
      const skip = (page - 1) * limit;

      const pipeline = this.buildAggregationPipeline(start,end,limit,skip);
      const data = await this.campaignModel.aggregate(pipeline);

      return {
        success: true,
        message: 'Campaigns report fetched successfully',
        status: 200,
        data: {
          data,
          page,
          limit,
        },
      };
    } catch (err) {
      return {
        success: false,
        message: 'Failed to fetch campaigns report',
        status: 500,
        error: err.message,
      };
    }
  }

  // 2. GET Single Campaign Summary
  async getCampaignSummary(campaignId: string) {
    if (!Types.ObjectId.isValid(campaignId)) {
      throw new Error('Invalid Campaign ID format');
    }

    const id = new Types.ObjectId(campaignId);

    // Fetch Campaign
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) throw new NotFoundException('Campaign not found');

    // Aggregate Stats from Messages collection (Live status)
    const stats = await this.messageModel.aggregate([
      { $match: { campaignId: id } },
      {
        $group: {
          _id: null,
          sent: { $sum: 1 },
          delivered: {
            $sum: {
              $cond: [
                { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0
              ]
            }
          },
          read: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                    { $eq: [ "$status", "read" ] }
                  ]
                },
                1,
                0
              ]
            }
          },
          failed: {
            $sum: {
              $cond: [
                { $ne: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0
              ]
            }
          },
        }
      }
    ]);

    const summary = {
      total: campaign.totalRecipients || 0,
      sent: stats[0]?.sent || 0,
      delivered: stats[0]?.delivered || 0,
      read: stats[0]?.read || 0,
      failed: stats[0]?.failed || 0,
    };

    // Failure Insights from MessageLogs
    const failures = await this.messageLogModel.aggregate([
      { $match: { campaignId: id, status: 'failed' } },
      { $group: { _id: '$error', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 3 },
    ]);

    return {
      success: true,
      data: {
        campaign,
        metrics: {
          ...summary,
          deliveryRate:
            summary.sent > 0
              ? ((summary.delivered / summary.sent) * 100).toFixed(2)
              : '0.00',
          readRate:
            summary.delivered > 0
              ? ((summary.read / summary.delivered) * 100).toFixed(2)
              : '0.00',
        },
        failureInsights: failures.map((f) => ({
          reason: f._id || 'Unknown Error',
          count: f.count,
        })),
      },
    };
  }

  // 3. GET Dashboard Stats (Aggregate for Client)
  async getDashboardStats(clientId: number) {
    const stats = await this.messageModel.aggregate([
      { $match: { clientId } },
      {
        $group: {
          _id: null,
          submission: { $sum: 1 },
          delivered: {
            $sum: {
              $cond: [
                { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0,
              ],
            },
          },
          failed: {
            $sum: {
              $cond: [
                { $ne: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0,
              ],
            },
          },
        },
      },
    ]);

    const counts = {
      submission: stats[0]?.submission || 0,
      delivered: stats[0]?.delivered || 0,
      failed: stats[0]?.failed || 0,
    };

    return {
      success: true,
      data: counts,
    };
  }

  // 4. GET Performance Trend (Last 6 Months)
  async getPerformanceStats(clientId: number) {
    const sixMonthsAgo = new Date();
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

    const logs = await this.messageModel.aggregate([
      { $match: { clientId, createdAt: { $gte: sixMonthsAgo } } },
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          Submitted: { $sum: 1 },
          Delivered: {
            $sum: {
              $cond: [
                { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0,
              ],
            },
          },
          Failed: {
            $sum: {
              $cond: [
                { $ne: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0,
              ],
            },
          },
        },
      },
      { $sort: { '_id.year': 1 as const, '_id.month': 1 as const } },
    ]);

    const chartData = logs.map((l) => ({
      name: `${l._id.year}-${String(l._id.month).padStart(2, '0')}`,
      Submitted: l.Submitted,
      Delivered: l.Delivered,
      Failed: l.Failed,
    }));

    return {
      success: true,
      data: chartData,
    };
  }

  // 5. GET Sub Account Stats Raw (for Proxy)
  async getSubAccountStats(clientIdsStr?: string) {
    let matchStage: any = {};
    if (clientIdsStr) {
      const clientIds = clientIdsStr.split(',').map(id => Number(id)).filter(id => !isNaN(id));
      if (clientIds.length > 0) {
        matchStage.clientId = { $in: clientIds };
      }
    }

    const stats = await this.messageModel.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: '$clientId',
          queued: { $sum: { $cond: [{ $eq: ['$status', 'queued'] }, 1, 0] } },
          processing: { $sum: { $cond: [{ $eq: ['$status', 'processing'] }, 1, 0] } },
          submitted: { $sum: 1 },
          delivered: {
            $sum: {
              $cond: [
                { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0
              ]
            }
          },
          read: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                    { $ne: ['$readAt', null] },
                    { $gt: ['$readAt', ''] }
                  ]
                },
                1,
                0
              ]
            }
          },
          failed: {
            $sum: {
              $cond: [
                { $ne: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                1,
                0
              ]
            }
          },
          system_failed: { $sum: { $cond: [{ $eq: ['$status', 'dead'] }, 1, 0] } },
        }
      }
    ]);

    return {
      success: true,
      data: stats
    };
  }

  // 6. GET Daily Stats (Grouped by Date)
  async getDailyStats(clientId: number, query: any) {
    try {
      const matchStage: any = { clientId: clientId };
      
      const stats = await this.messageModel.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            Submitted: { $sum: 1 },
            Delivered: {
              $sum: {
                $cond: [
                  { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                  1,
                  0,
                ],
              },
            },
            Read: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                      { $eq: ['$status', 'read'] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            Failed: {
              $sum: {
                $cond: [
                  { $ne: [ { $ifNull: ["$failureReason", ""] }, "" ] },
                  1,
                  0,
                ],
              },
            },
          },
        },
        { $sort: { _id: -1 as const } },
      ]);

      // Fetch transactions from Prisma to calculate actual cost
      let txByDate: Record<string, number> = {};
      try {
        const txs = await this.prisma.transaction.findMany({
          where: {
            clientId,
            status: 'SUCCESS',
            type: { in: ['DEBIT', 'REFUND'] },
          },
          select: {
            amount: true,
            type: true,
            createdAt: true,
          },
        });

        for (const tx of txs) {
          const dateStr = tx.createdAt.toISOString().split('T')[0];
          // DEBIT amounts are stored as negative (e.g. -0.82), so Math.abs gives the cost.
          // REFUND amounts are stored as positive (e.g. +0.82), so we subtract it back.
          const contribution =
            tx.type === 'DEBIT' ? Math.abs(tx.amount) : -Math.abs(tx.amount);
          txByDate[dateStr] = (txByDate[dateStr] || 0) + contribution;
        }
      } catch (dbErr) {
        console.error('Failed to query transactions for daily stats:', dbErr.message);
      }

      return stats.map((s) => {
        const dateStr = s._id;
        let actualPrice = txByDate[dateStr];
        if (actualPrice === undefined) {
          // Fallback: estimate based on submitted count (e.g. default marketing rate of 0.82)
          actualPrice = s.Submitted * 0.82;
        }

        if (actualPrice < 0) {
          actualPrice = 0;
        }

        return {
          date: dateStr,
          submitted: s.Submitted,
          delivered: s.Delivered,
          read: s.Read,
          failed: s.Failed,
          autoReply: 0,
          agentReply: 0,
          price: Number(actualPrice.toFixed(2)),
        };
      });
    } catch (err) {
      throw new Error('Failed to fetch daily stats: ' + err.message);
    }
  }

  // ====================build pipeline =================================================

  private buildAggregationPipeline(
    start: Date,
    end: Date,
    limit: number,
    skip: number,
  ) {
    const pipeline = [
      {
        $match: {
          createdAt: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: 'templates',
          localField: 'templateId',
          foreignField: '_id',
          as: 'temp',
        },
      },
      {
        $lookup: {
          from: 'messages',
          localField: '_id',
          foreignField: 'campaignId',
          as: 'msg',
        },
      },
      {
        $lookup: {
          from: 'messagelogs',
          localField: '_id',
          foreignField: 'campaignId',
          as: 'msglog',
        },
      },
      {
        $addFields: {
          submitted: { $size: '$msg' },
          dlr_awaited: {
            $size: {
              $filter: {
                input: '$msg',
                as: 'm',
                cond: {
                  $and: [
                    { $eq: ['$$m.status', 'sent'] },
                    { $eq: ['$$m.deliveredAt', null] },
                    { $gt: ['$$m.sentAt', null] },
                  ],
                },
              },
            },
          },
          delivered: {
            $size: {
              $filter: {
                input: '$msg',
                as: 'm',
                cond: {
                  $and: [
                    { $eq: ['$$m.status', 'sent'] },
                    { $ne: ['$$m.sentAt', null] },
                    { $gt: ['$$m.deliveredAt', null] },
                    { $eq: ['$$m.readAt', null] },
                  ],
                },
              },
            },
          },
          read: {
            $size: {
              $filter: {
                input: '$msg',
                as: 'm',
                cond: {
                  $and: [
                    { $eq: ['$$m.status', 'sent'] },
                    { $ne: ['$$m.sentAt', null] },
                    { $gt: ['$$m.deliveredAt', null] },
                    { $gt: ['$$m.readAt', null] },
                  ],
                },
              },
            },
          },
          failed: {
            $size: {
              $filter: {
                input: '$msglog',
                as: 'ml',
                cond: {
                  $and: [
                    { $eq: ['$$ml.status', 'failed'] },
                    { $eq: ['$$ml.errorType', 'meta'] },
                  ],
                },
              },
            },
          },
          system_failed: {
            $size: {
              $filter: {
                input: '$msglog',
                as: 'ml',
                cond: {
                  $and: [
                    { $eq: ['$$ml.status', 'failed'] },
                    { $eq: ['$$ml.errorType', 'system'] },
                  ],
                },
              },
            },
          },
        },
      },
      {
        $addFields: {
          created: '$createdAt',
          modified: '$updatedAt',
          name: '$name',
          sender: '$from',
          scheduledAt: '$scheduleAt',
          totalNumbers: '$totalRecipients',
          route: { $arrayElemAt: ['$temp.route', 0] },
          templateId: { $arrayElemAt: ['$temp.providerTemplateId', 0] },
        },
      },
      {
        $project: {
          _id: 1,
          created: 1,
          modified: 1,
          name: 1,
          sender: 1,
          scheduledAt: 1,
          totalNumbers: 1,
          route: 1,
          templateId: 1,
          submitted: 1,
          delivered: 1,
          failed: 1,
          read: 1,
          system_failed: 1,
          dlr_awaited: 1,
          status: 1,
        },
      },
      { $sort: { created: -1 as const } },
      { $skip: skip },
      { $limit: limit },
    ];
    return pipeline;
  }

  async getFailedMessages(clientId: number) {
    return this.messageModel
      .find({
        clientId,
        failureReason: { $exists: true, $nin: [null, ''] }
      })
      .select('to failedAt failureReason content createdAt')
      .sort({ failedAt: -1, createdAt: -1 })
      .limit(100)
      .exec();
  }
}
