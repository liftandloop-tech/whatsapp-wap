const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.webhookEvent.findMany({
    where: {
      receivedAt: {
        gte: new Date(new Date().setHours(0,0,0,0))
      }
    },
    orderBy: { receivedAt: 'desc' }
  });
  console.log(JSON.stringify(events, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
