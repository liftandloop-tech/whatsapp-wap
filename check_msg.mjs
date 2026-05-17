import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin';

async function checkMessage() {
    await mongoose.connect(MONGO_URI);
    const MessageSchema = new mongoose.Schema({}, { strict: false });
    const Message = mongoose.model('Message', MessageSchema, 'messages');
    
    const msg = await Message.findById('6a00a2c9163c4444ebde55f7');
    console.log('Message Status:', msg.status);
    console.log('Provider ID:', msg.providerMessageId);

    const CampaignSchema = new mongoose.Schema({}, { strict: false });
    const Campaign = mongoose.model('Campaign', CampaignSchema, 'campaigns');
    const campaign = await Campaign.findById('6a00a2c9163c4444ebde55f5');
    console.log('Campaign Status:', campaign.status);
    console.log('Total Recipients:', campaign.totalRecipients);
    
    await mongoose.disconnect();
}

checkMessage();
