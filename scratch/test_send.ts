import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { WhatsappMessageProvider } from '../src/whatsapp/providers/whatsapp-message.provider';
import { TemplateCacheService } from '../src/whatsapp/services/template-cache.service';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const provider = app.get(WhatsappMessageProvider);
  const templateModel = app.get('TemplateModel');

  const numbers = ['916266114115', '918236094605', '916265423859'];
  const clientId = 15;
  const templateName = 'fathers_day_special';

  console.log(`Searching for template: ${templateName}...`);
  const template = await templateModel.findOne({ clientId, name: templateName }).lean();
  
  if (!template) {
    console.error(`Template ${templateName} not found!`);
    await app.close();
    return;
  }

  for (const phone of numbers) {
    console.log(`Sending template message to ${phone}...`);
    try {
      const result = await provider.sendTemplateMessage({
        phone,
        clientId,
        template,
        variables: ['Customer'],
      });
      console.log(`Result for ${phone}:`, JSON.stringify(result, null, 2));
    } catch (err) {
      console.error(`Failed for ${phone}:`, err.message);
    }
  }

  await app.close();
}

bootstrap().catch(err => {
  console.error('Test send failed:', err);
  process.exit(1);
});
