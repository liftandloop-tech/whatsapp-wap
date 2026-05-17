const { MongoClient } = require('mongodb');

async function checkClient() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('wap');
    const credentials = await db.collection('wabacredentials').findOne({ clientId: 15 });
    
    console.log(JSON.stringify(credentials, null, 2));
  } finally {
    await client.close();
  }
}

checkClient();
