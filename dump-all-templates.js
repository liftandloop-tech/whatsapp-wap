const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  console.log("Fetching all MessageTemplates...");
  const templates = await prisma.messageTemplate.findMany({
    include: {
      components: true
    }
  });
  console.log(`Found ${templates.length} templates.`);
  console.log(JSON.stringify(templates, null, 2));

  process.exit(0);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
