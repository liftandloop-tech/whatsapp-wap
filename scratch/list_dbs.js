const { MongoClient } = require('mongodb');

async function listDbs() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const admin = client.db().admin();
    const dbs = await admin.listDatabases();
    console.log(dbs);
  } finally {
    await client.close();
  }
}

listDbs();
