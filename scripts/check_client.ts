
import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient();
  const creds = await prisma.waba_credentials.findUnique({
    where: { clientId: 15 },
  });
  console.log('Credentials for Client 15:', JSON.stringify(creds, null, 2));
  
  if (creds?.wabaId) {
    const wabaAccount = await prisma.wabaAccount.findUnique({
      where: { wabaId: creds.wabaId },
    });
    console.log('WABA Account:', JSON.stringify(wabaAccount, null, 2));
    
    if (wabaAccount) {
      const templates = await prisma.messageTemplate.findMany({
        where: { tenantId: wabaAccount.tenantId },
      });
      console.log('Templates Count:', templates.length);
    }
  }
  
  await prisma.$disconnect();
}

main();
