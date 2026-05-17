const { MongoClient } = require('mongodb');

async function checkMessages() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('wap');
    const messages = await db.collection('messages').find({ clientId: 15 }).sort({ createdAt: -1 }).limit(3).toArray();
    
    console.log(JSON.stringify(messages, null, 2));
  } finally {
    await client.close();
  }
}

checkMessages();
