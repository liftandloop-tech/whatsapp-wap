
import { MongoClient } from 'mongodb';

async function main() {
  const uri = process.env.WHATSAPP_MONGODB_URI || "mongodb://localhost:27017/whatsapp-wap";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db();
    const messages = db.collection('messages');
    
    const lastMessages = await messages.find().sort({ createdAt: -1 }).limit(5).toArray();
    console.log("Last 5 messages in MongoDB:");
    console.log(JSON.stringify(lastMessages, null, 2));

    const campaigns = db.collection('campaigns');
    const lastCampaigns = await campaigns.find().sort({ createdAt: -1 }).limit(1).toArray();
    console.log("\nLast campaign in MongoDB:");
    console.log(JSON.stringify(lastCampaigns, null, 2));

  } catch (err) {
    console.error(err);
  } finally {
    await client.close();
  }
}

main();
