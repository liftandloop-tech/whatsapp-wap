import IORedis from 'ioredis';
import { Queue } from 'bullmq';

const REDIS_URI = 'redis://default:Swakora2026@31.97.231.122:5435/0';

async function checkJobs() {
    console.log('Connecting to Redis...');
    const redisConnection = new IORedis(REDIS_URI, {
        maxRetriesPerRequest: null
    });

    const bulkQueue = new Queue('whatsapp-bulk', {
        connection: redisConnection,
        prefix: 'wa_service'
    });

    const jobId = '6a0e529982dbadf6b1135b09';
    const job = await bulkQueue.getJob(jobId);

    if (job) {
        console.log('Found Job in Redis:', {
            id: job.id,
            name: job.name,
            state: await job.getState(),
            failedReason: job.failedReason,
            finishedOn: job.finishedOn,
            processedOn: job.processedOn,
        });
    } else {
        console.log('No job found in Redis with ID:', jobId);
    }

    await bulkQueue.close();
    await redisConnection.quit();
}

checkJobs();
