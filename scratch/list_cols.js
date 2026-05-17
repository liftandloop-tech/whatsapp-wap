const { MongoClient } = require('mongodb');

async function listCols() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('wap');
    const cols = await db.listCollections().toArray();
    console.log(cols.map(c => c.name));
  } finally {
    await client.close();
  }
}

listCols();
