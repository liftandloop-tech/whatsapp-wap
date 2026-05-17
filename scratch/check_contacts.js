const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const msg = await prisma.message.findFirst({
    where: { type: 'CONTACTS' },
    orderBy: { createdAt: 'desc' }
  });
  console.log(JSON.stringify(msg, null, 2));
  console.log('type of externalMetadata:', typeof msg.externalMetadata);
}

check().finally(() => prisma.$disconnect());
