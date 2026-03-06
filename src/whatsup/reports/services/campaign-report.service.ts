import { Injectable } from "@nestjs/common";
import { CampaignReportRequestDto } from "../dto/campaign-report-request.dto";
import { Model } from "mongoose";
import { Campaign } from "src/whatsup/schemas/campaign.schema";
import { InjectModel } from "@nestjs/mongoose";


@Injectable()
export class CampaignReportService {

    constructor(
        @InjectModel(Campaign.name)
        private readonly campaignModel: Model<Campaign>
    ) { }


    // GET Campaign Report

    async getCampaignsReport(payload: CampaignReportRequestDto) {

        try {
            if (!payload.dateRange?.start || !payload.dateRange?.end) {
                throw new Error("Missing date range");
            }
            
            const start = new Date(payload.dateRange.start);
            const end = new Date(payload.dateRange.end);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                throw new Error("Invalid date format");
            }

            const page = Number(payload.page) || 1;
            const limit = Number(payload.limit) || 50;
            const skip = (page - 1) * limit;

            // Call build Aggregation pipeline
            const pipeline = this.buildAggregationPipeline(start, end, limit, skip);

            const data = await this.campaignModel.aggregate(pipeline);

            console.log("data is = ", data);

            return {
                success: true,
                message: "Campaigns shown successfully",
                status: 200,
                data: {
                    data,
                    page,
                    limit
                }
            };
        }
        catch (err) {
            return {
                success: false,
                message: "Failed to fetch campaigns report",
                status: 500,
                error: err.message
            };
        }
    }


    // ====================build pipeline =================================================


    private buildAggregationPipeline(start: Date,
        end: Date,
        limit: number,
        skip: number
    ) {

        const pipeline = [

            // filter by date range
            {
                $match: {
                    createdAt: {
                        $gte: start,
                        $lte: end
                    }
                }
            },


            // join templates
            {
                $lookup: {
                    from: "templates",
                    localField: "templateId",
                    foreignField: "_id",
                    as: "temp"
                }
            },


            // join messages
            {
                $lookup: {
                    from: "messages",
                    localField: "_id",
                    foreignField: "campaignId",
                    as: "msg"
                }
            },


            // join messagelogs
            {
                $lookup: {
                    from: "messagelogs",
                    localField: "_id",
                    foreignField: "campaignId",
                    as: "msglog"
                }
            },


            // add fields 
            {
                $addFields: {

                    submitted: {
                        $size: "$msg"
                    },

                    dlr_awaited: {
                        $size: {
                            $filter: {
                                input: "$msg",
                                as: "m",
                                cond: {
                                    $and: [
                                        { $eq: ["$$m.status", "sent"] },
                                        { $eq: ["$$m.deliveredAt", null] },
                                        { $gt: ["$$m.sentAt", null] }
                                    ]
                                }
                            }
                        }
                    },

                    delivered: {
                        $size: {
                            $filter: {
                                input: "$msg",
                                as: "m",
                                cond: {
                                    $and: [
                                        { $eq: ["$$m.status", "sent"] },
                                        { $ne: ["$$m.sentAt", null] },
                                        { $gt: ["$$m.deliveredAt", null] },
                                        { $eq: ["$$m.readAt", null] }
                                    ]
                                }
                            }
                        }
                    },

                    read: {
                        $size: {
                            $filter: {
                                input: "$msg",
                                as: "m",
                                cond: {
                                    $and: [
                                        { $eq: ["$$m.status", "sent"] },
                                        { $ne: ["$$m.sentAt", null] },
                                        { $gt: ["$$m.deliveredAt", null] },
                                        { $gt: ["$$m.readAt", null] }
                                    ]
                                }
                            }
                        }
                    },

                    failed: {
                        $size: {
                            $filter: {
                                input: "$msglog",
                                as: "ml",
                                cond: {
                                    $and: [
                                        { $eq: ["$$ml.status", "failed"] },
                                        { $eq: ["$$ml.errorType", "meta"] }
                                    ]
                                }
                            }
                        }
                    },

                    system_failed: {
                        $size: {
                            $filter: {
                                input: "$msglog",
                                as: "ml",
                                cond: {
                                    $and: [
                                        { $eq: ["$$ml.status", "failed"] },
                                        { $eq: ["$$ml.errorType", "system"] }
                                    ]
                                }
                            }
                        }
                    }


                }
            },

            {
                $addFields: {
                    created: "$createdAt",
                    modified: "$updatedAt",
                    name: "$name",
                    sender: "$from",
                    scheduledAt: "$scheduleAt",
                    totalNumbers: "$totalRecipients",
                    route: { $arrayElemAt: ["$temp.route", 0] },
                    templateId: { $arrayElemAt: ["$temp.providerTemplateId", 0] }
                }
            },

            //  build project stage

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
                    status: 1
                }
            },

            { $sort: { created: -1 as -1 } },
            { $skip: skip },
            { $limit: limit }

        ]

        return pipeline;

    }

}

