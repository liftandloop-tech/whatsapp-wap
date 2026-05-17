const { MongoClient } = require('mongodb');

async function checkWabaAccounts() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('wap');
    const accounts = await db.collection('wabaaccounts').find({ clientId: 15 }).toArray();
    
    console.log(JSON.stringify(accounts, null, 2));
  } finally {
    await client.close();
  }
}

checkWabaAccounts();
