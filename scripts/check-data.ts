import { MongoClient } from 'mongodb';

async function test() {
    const uri = 'mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin';
    const client = new MongoClient(uri);
    try {
        await client.connect();
        const db = client.db();
        const collection = db.collection('messages');
        
        console.log("Total Documents:", await collection.countDocuments());
        
        // Group by clientId and count delivered
        const stats = await collection.aggregate([
            {
                $group: {
                    _id: '$clientId',
                    total: { $sum: 1 },
                    submitted: { $sum: { $cond: [{ $in: ['$status', ['sent', 'delivered', 'read']] }, 1, 0] } },
                    delivered: { $sum: { $cond: [{ $ne: ['$deliveredAt', null] }, 1, 0] } },
                    read: { $sum: { $cond: [{ $ne: ['$readAt', null] }, 1, 0] } },
                    dead: { $sum: { $cond: [{ $eq: ['$status', 'dead'] }, 1, 0] } }
                }
            }
        ]).toArray();
        
        console.log("Stats by ClientId:", JSON.stringify(stats, null, 2));
        
        // Check a sample where deliveredAt is not null
        const sample = await collection.find({ deliveredAt: { $ne: null } }).limit(1).toArray();
        console.log("Sample Delivered Doc:", JSON.stringify(sample, null, 2));
        
    } catch (e) {
        console.error(e);
    } finally {
        await client.close();
    }
}

test();
