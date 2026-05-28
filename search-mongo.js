const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin';

async function search() {
  console.log("Connecting to MongoDB...");
  await mongoose.connect(MONGO_URI);
  console.log("Connected to MongoDB successfully!");

  const db = mongoose.connection.db;
  const collections = await db.listCollections().toArray();
  console.log(`Found ${collections.length} collections. Searching...`);

  for (const colInfo of collections) {
    const colName = colInfo.name;
    const col = db.collection(colName);
    
    const cursor = col.find({});
    let count = 0;
    while (await cursor.hasNext()) {
      const doc = await cursor.next();
      const docStr = JSON.stringify(doc).toLowerCase();
      if (docStr.includes("schoolerp")) {
        console.log(`\nMatch found in Collection: [${colName}]`);
        console.log(JSON.stringify(doc, null, 2));
        count++;
      }
    }
  }

  console.log("\nSearch complete.");
  await mongoose.disconnect();
  process.exit(0);
}

search().catch(err => {
  console.error(err);
  process.exit(1);
});
