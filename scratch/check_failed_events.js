const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const events = await prisma.messageStatusEvent.findMany({
    where: { status: 'FAILED' },
    orderBy: { metaTimestamp: 'desc' },
    take: 3
  });
  console.log(JSON.stringify(events, null, 2));
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
