import { Injectable, OnModuleInit } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { Message } from "../schemas/message.schema";
import { MESSAGE_STATUS } from "../constants/message.constants";
import { WhatsappMessageProvider } from "../providers/whatsapp-message.provider";
import { MessageLog } from "../schemas/message-log.schema";

@Injectable()
export class MessageWorker implements OnModuleInit {

    constructor(
        @InjectModel(Message.name)
        private readonly messageModel: Model<Message>,
        @InjectModel(MessageLog.name)
        private readonly messageLogModel: Model<MessageLog>,
        private readonly whatsappMessageProvider: WhatsappMessageProvider
    ) { }

    onModuleInit() {
        this.startWorkers();
    }

    // ===================== WORKER START =====================

    private startWorkers() {
        const WORKERS = Number(process.env.WORKERS) || 2;

        for (let i = 0; i < WORKERS; i++) {
            this.startWorker(i + 1);
        }
    }

    private async startWorker(workerId: number) {
        console.log(`Worker ${workerId} started`);

        const BATCH_SIZE = Number(process.env.WORKER_BATCH_SIZE);

        while (true) {
            const messages = await this.lockMessages(workerId, BATCH_SIZE);

            if (messages.length === 0) {
                await this.sleep(500);
                continue;
            }

            await Promise.all(
                messages.map(msg => this.processMessage(msg, workerId))
            );

            await this.requeueStuckMessages();
        }
    }

    // ===================== MESSAGE LOCK =====================

    /**
     * Atomic message pickup (safe for multiple workers)
     */
    private async lockMessages(workerId: number, limit: number) {
        const now = new Date();

        // Step 1: Find eligible messages
        const messages = await this.messageModel
            .find({
                status: MESSAGE_STATUS.QUEUED,
                availableAt: { $lte: now }
            })
            .sort({ availableAt: 1 })
            .limit(limit)
            .lean();

        if (messages.length === 0) return [];

        const messageIds = messages.map(msg => msg._id);

        // Step 2: Lock all messages in one update
        await this.messageModel.updateMany(
            { _id: { $in: messageIds }, status: MESSAGE_STATUS.QUEUED },
            {
                $set: {
                    status: MESSAGE_STATUS.PROCESSING,
                    workerId,
                    processingAt: new Date()
                }
            }
        );

        // Step 3: Populate campaign & template data for all messages
        const populatedMessages = await this.messageModel
            .find({ _id: { $in: messageIds } })
            .populate({
                path: "campaignId",
                populate: { path: "templateId" }
            })
            .lean();

        return populatedMessages;
    }

    // ===================== PROCESS MESSAGE =====================

    private async processMessage(message: any, workerId: number) {
        const start = Date.now();
        const languageCode = message.campaignId?.templateId?.language ?? "en";

        console.log(languageCode);
        try {

            const res = await this.whatsappMessageProvider.sendMessage(message, languageCode);

            if (res.success) {
                await this.messageModel.updateOne(
                    { _id: message._id },
                    {
                        $set: {
                            status: MESSAGE_STATUS.SENT,
                            sentAt: new Date(),
                            providerMessageId: res.providerMessageId
                        }
                    }
                );
                console.log(
                    `Worker ${workerId}, Message ${message._id}, Time ${Date.now() - start} ms   sent`
                );
            } else {
                console.log(`Worker ${workerId}, Message ${message._id}, Time ${Date.now() - start} ms   failed`);
                await this.failMessage(message, res.failure);
            }
        } catch (err) {
            console.log(`Worker ${workerId}, Message ${message._id}, Time ${Date.now() - start} ms   failed, ${err.message}`);

            const failure = {
                error: err.message,
                errorType: "system",
                errorCode: "SYSTEM_EXCEPTION"
            };
            await this.failMessage(message, failure);
        }
    }

    // ===================== RETRY LOGIC =====================

    private async failMessage(message: any, failure: any) {
        const MAX_RETRY = Number(process.env.WORKER_MAX_RETRY) || 3;
        const retryCount = (message.retryCount || 0) + 1;

        // move to DEAD after max retries
        if (retryCount > MAX_RETRY) {
            await this.moveToDeadAndLog(message, failure);
            return;
        }

        const BASE_DELAY = 30_000; // 30 seconds for the first retry
        const MAX_DELAY = 5 * 60_000; // 5 minutes max

        let delay = BASE_DELAY * Math.pow(2, retryCount - 1);

        if (delay > MAX_DELAY) {
            delay = MAX_DELAY;
        }


        // ================== UPDATE MESSAGE ==================
        await this.messageModel.updateOne(
            { _id: message._id },
            {
                $set: {
                    status: MESSAGE_STATUS.QUEUED,
                    availableAt: new Date(Date.now() + delay)
                },
                $inc: { retryCount: 1 },
                $unset: { workerId: "", processingAt: "" }
            }
        );
    }

    // ===================Dead message after max retries ========= Dead Message entry into Log ==========================  //

    private async moveToDeadAndLog(message: any, failure: any) {
        // update Message schema
        await this.messageModel.updateOne(
            { _id: message._id },
            {
                $set: {
                    status: MESSAGE_STATUS.DEAD
                }
            }
        );

        let route: string = "transactional";
        const category = message.campaignId.templateId.category;
        if (category === "marketing") {
            route = "promotional";
        }

        // Insert into MessageLog schema
        await this.messageLogModel.create({
            messageId: message._id,
            campaignId: message.campaignId._id ?? message.campaignId,

            templateId: message.campaignId.templateId._id,
            templateName: message.campaignId.templateId.name,

            status: "failed",

            sender: message.from,
            receiver: message.to,

            route,
            country: message.campaignId.country ?? "IN",

            error: failure.error,
            errorType: failure.errorType,
            errorCode: failure.errorCode,

            submittedAt: message.createdAt,
            failedAt: new Date(),

            providerTemplateId: message.campaignId.templateId.providerTemplateId,
            providerMessageId: message.providerMessageId,

            campaignName: message.campaignId.name
        });
    }


    // ===================== CRASH RECOVERY =====================

    /**
       Recover messages stuck in PROCESSING
     */
    private async requeueStuckMessages() {
        const STUCK_TIME = 2 * 60 * 1000; // 2 minutes

        await this.messageModel.updateMany(
            {
                status: MESSAGE_STATUS.PROCESSING,
                processingAt: { $lte: new Date(Date.now() - STUCK_TIME) }
            },
            {
                $set: {
                    status: MESSAGE_STATUS.QUEUED,
                    availableAt: new Date()
                },
                $unset: { workerId: "", processingAt: "" }
            }
        );
    }


    private sleep(ms: number) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
