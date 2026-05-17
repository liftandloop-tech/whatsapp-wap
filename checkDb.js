const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.webhookEvent.findMany({
    orderBy: { receivedAt: 'desc' },
    take: 5
  });
  console.log('Latest Webhook Events:', events);
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
