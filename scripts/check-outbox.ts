import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const events = await prisma.outboxEvent.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' },
  });
  console.table(events.map(e => ({
    id: e.id,
    type: e.eventType,
    state: e.state,
    published: e.publishedAt
  })));
}

main().finally(() => prisma.$disconnect());
