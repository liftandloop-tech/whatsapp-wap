import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://root:L%26L%402025@31.97.231.122:5434/wap?authSource=admin';

const MessageSchema = new mongoose.Schema({}, { strict: false });
const MessageModel = mongoose.model('Message', MessageSchema, 'messages');

async function main() {
  await mongoose.connect(MONGO_URI);
  const clientId = 15;

  const stats = await MessageModel.aggregate([
    { $match: { clientId } },
    {
      $group: {
        _id: '$clientId',
        submitted: { $sum: 1 },
        delivered: {
          $sum: {
            $cond: [
              { $eq: [ { $ifNull: ["$failureReason", ""] }, "" ] },
              1,
              0
            ]
          }
        },
        failed: {
          $sum: {
            $cond: [
              { $ne: [ { $ifNull: ["$failureReason", ""] }, "" ] },
              1,
              0
            ]
          }
        }
      }
    }
  ]);
  console.log("Simplified Aggregation results:", stats);
}

main().catch(console.error).finally(() => mongoose.disconnect());
