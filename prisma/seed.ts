import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding WABA infrastructure...');

  // 1. Create Tenant
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'test-tenant' },
    update: {},
    create: {
      name: 'Test Tenant',
      slug: 'test-tenant',
    },
  });
  console.log(`✅ Tenant created: ${tenant.id}`);

  // 2. Create WabaAccount
  const waba = await prisma.wabaAccount.upsert({
    where: { wabaId: 'WHATSAPP_BUSINESS_ACCOUNT_ID' },
    update: {},
    create: {
      tenantId: tenant.id,
      wabaId: 'WHATSAPP_BUSINESS_ACCOUNT_ID',
      businessName: 'Test Business',
      accessToken: 'test-access-token',
    },
  });
  console.log(`✅ WABA Account created: ${waba.id}`);

  // 3. Create PhoneNumber
  const phone = await prisma.phoneNumber.upsert({
    where: { phoneNumberId: '1234567890' },
    update: {},
    create: {
      wabaAccountId: waba.id,
      phoneNumberId: '1234567890',
      displayNumber: '+16505551111',
      verifiedName: 'Swakora Test',
    },
  });
  console.log(`✅ Phone Number created: ${phone.id}`);

  console.log('🚀 Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
