const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const tenants = await prisma.tenant.findMany({ take: 5 });
  console.log('Tenants:', JSON.stringify(tenants, null, 2));
  
  const accounts = await prisma.wabaAccount.findMany({ take: 5 });
  console.log('WabaAccounts:', JSON.stringify(accounts, null, 2));

  const creds = await prisma.waba_credentials.findMany({ take: 5 });
  console.log('Waba Credentials:', JSON.stringify(creds, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
