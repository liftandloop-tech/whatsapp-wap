import mongoose from 'mongoose';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const MONGO_URI = 'mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin';
const REDIS_URI = 'redis://default:Swakora2026@31.97.231.122:5435/0';

async function retryMessage() {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    
    const MessageSchema = new mongoose.Schema({}, { strict: false });
    const Message = mongoose.model('Message', MessageSchema, 'messages');
    
    const msg = await Message.findById('6a0e529982dbadf6b1135b09');
    if (!msg) {
        console.error('Message 6a0e529982dbadf6b1135b09 not found!');
        await mongoose.disconnect();
        return;
    }
    
    console.log('Found Message:', {
        id: msg._id,
        status: msg.status,
        to: msg.to,
        variables: msg.variables,
        campaignId: msg.campaignId,
        failureReason: msg.failureReason
    });

    const CampaignSchema = new mongoose.Schema({}, { strict: false });
    const Campaign = mongoose.model('Campaign', CampaignSchema, 'campaigns');
    const campaign = await Campaign.findById(msg.campaignId);
    if (!campaign) {
        console.error('Campaign not found for message!');
        await mongoose.disconnect();
        return;
    }
    
    console.log('Found Campaign:', {
        id: campaign._id,
        name: campaign.name,
        templateId: campaign.templateId,
        status: campaign.status
    });

    console.log('Connecting to Redis...');
    const redisConnection = new IORedis(REDIS_URI, {
        maxRetriesPerRequest: null
    });

    // Create BullMQ Queue instance
    const bulkQueue = new Queue('whatsapp-bulk', {
        connection: redisConnection,
        prefix: 'wa_service' // matches REDIS_PREFIX: 'wa_service:' in whatsapp-queue.settings
    });

    console.log('Resetting message status in MongoDB to "queued" and clearing failureReason...');
    await Message.updateOne(
        { _id: msg._id },
        { 
            $set: { 
                status: 'queued',
                failureReason: null,
                retryCount: 0,
                updatedAt: new Date()
            } 
        }
    );

    const existingJob = await bulkQueue.getJob(msg._id.toString());
    if (existingJob) {
        console.log(`Found existing job in state "${await existingJob.getState()}". Removing it from Redis...`);
        await existingJob.remove();
        console.log('Existing job removed.');
    }

    console.log('Adding job to BullMQ queue "whatsapp-bulk"...');
    const payload = {
        messageId: msg._id.toString(),
        phone: msg.to,
        templateId: campaign.templateId.toString(),
        variables: msg.variables,
        campaignId: campaign._id.toString(),
        createdAt: Date.now(),
        correlationId: 'manual-retry-' + Date.now(),
        queueType: 'bulk'
    };

    const job = await bulkQueue.add(
        'send-template-message', // WHATSAPP_JOB_NAMES.SEND_TEMPLATE
        payload,
        {
            jobId: msg._id.toString(), // Message-level idempotency
            attempts: 3,
            backoff: { type: 'exponential', delay: 2000 },
            timeout: 15000,
        }
    );

    console.log('Successfully enqueued job in BullMQ!', {
        jobId: job.id,
        name: job.name
    });

    // Close connections
    await bulkQueue.close();
    await redisConnection.quit();
    await mongoose.disconnect();
    console.log('Done!');
}

retryMessage().catch(err => {
    console.error('Error during retry execution:', err);
});
