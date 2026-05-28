import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin';

async function checkMessage() {
    await mongoose.connect(MONGO_URI);
    const MessageSchema = new mongoose.Schema({}, { strict: false });
    const Message = mongoose.model('Message', MessageSchema, 'messages');
    
    const msg = await Message.findById('6a0e529982dbadf6b1135b09');
    if (msg) {
        console.log('--- MESSAGE DETAILS ---');
        console.log('ID:', msg._id);
        console.log('Status:', msg.status);
        console.log('Failure Reason:', msg.failureReason);
        console.log('Retry Count:', msg.retryCount);
        console.log('Updated At:', msg.updatedAt);
    } else {
        console.log('Message not found!');
    }

    const CampaignSchema = new mongoose.Schema({}, { strict: false });
    const Campaign = mongoose.model('Campaign', CampaignSchema, 'campaigns');
    const campaign = await Campaign.findById('6a0e529982dbadf6b1135b01');
    if (campaign) {
        console.log('\n--- CAMPAIGN DETAILS ---');
        console.log('Campaign ID:', campaign._id);
        console.log('Campaign Name:', campaign.name);
        console.log('Status:', campaign.status);
    } else {
        console.log('Campaign not found!');
    }
    
    await mongoose.disconnect();
}

checkMessage();
