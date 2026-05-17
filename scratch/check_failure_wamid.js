const { MongoClient } = require('mongodb');

async function checkStatusEvents() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('wap');
    // Find the message that failed
    const message = await db.collection('messages').findOne({ to: "918236094605", status: "dead" });
    if (message) {
      console.log("Found failed message:", message.providerMessageId);
      // Status events are in Postgres for this engine version usually, but let's check if they are here
    }
  } finally {
    await client.close();
  }
}

checkStatusEvents();
