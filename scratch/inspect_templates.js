const { MongoClient } = require('mongodb');

async function checkTemplates() {
  const uri = "mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin";
  const client = new MongoClient(uri);

  try {
    await client.connect();
    const db = client.db('wap');
    const templates = await db.collection('templates').find({ 'components.type': 'HEADER', 'components.format': 'IMAGE' }).limit(5).toArray();
    
    console.log(JSON.stringify(templates, null, 2));
  } finally {
    await client.close();
  }
}

checkTemplates();
