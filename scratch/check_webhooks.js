
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 5,
  });

  console.log("Last 5 Webhook Events in Prisma:");
  for (const event of events) {
    console.log(`\nID: ${event.id} | Created: ${event.createdAt}`);
    console.log(JSON.stringify(event.payload, null, 2));
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
