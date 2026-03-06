import { Injectable } from "@nestjs/common";
import { MessageLogReportRequestDto } from "../dto/message-log-report-request.dto";
import { MessageLog } from "src/whatsup/schemas/message-log.schema";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";


@Injectable()
export class MessageLogReportService {

    constructor(
        @InjectModel(MessageLog.name)
        private readonly messageLogModel: Model<MessageLog>
    ) { }


    async getMessageLogsReport(payload: MessageLogReportRequestDto) {
        try {
            if (!payload.dateRange?.start || !payload.dateRange?.end) {
                throw new Error("Missing date range");
            }

            const start = new Date(payload.dateRange.start);
            const end = new Date(payload.dateRange.end);

            if (isNaN(start.getTime()) || isNaN(end.getTime())) {
                throw new Error("Invalid date format");
            }

            const page = payload.page || 1;
            const limit = payload.limit || 50;
            const skip = (page - 1) * limit;

            const pipeline = this.buildAggregationPipeline(start, end, limit, skip);

            const data = await this.messageLogModel.aggregate(pipeline);

            return {
                success: true,
                message: "Whatsapp message logs shown successfully.",
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
                message: "Failed to fetch Whatsapp message logs",
                status: 500,
                error: err.message
            };
        }
    }



    private buildAggregationPipeline(start: Date, end: Date, limit: number, skip: number) {
        const pipeline = [
            {
                $match: {
                    createdAt: {
                        $gte: start,
                        $lte: end
                    }
                }
            },

            {
                $project: {
                    _id: 1,
                    messageId: 1,
                    campaignId: 1,
                    templateId: 1,
                    providerMessageId: 1,
                    providerTemplateId: 1,
                    campaignName: 1,
                    templateName: 1,
                    sender: 1,
                    receiver: 1,
                    route: 1,
                    country: 1,
                    submittedAt: 1,
                    failedAt: 1,
                    error: 1,
                    errorCode: 1,
                    errorType: 1,
                    createdAt: 1,
                    updatedAt: 1,
                    status: 1
                }
            },

            { $sort: { createdAt: -1 as -1 } },
            { $skip: skip },
            { $limit: limit }

        ];
        return pipeline;
    }
}