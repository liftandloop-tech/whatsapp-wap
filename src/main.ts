import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';

// src/main.ts
async function bootstrap() {
  // Add the 'logger' option here 👇
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    cors: {
      origin: (origin, callback) => {
        if (
          !origin ||
          origin.endsWith('.swakora.tech') ||
          origin.includes('localhost')
        ) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
      allowedHeaders: 'Content-Type,Accept,Authorization,x-internal-secret',
    },
    logger: ['error', 'warn', 'log'],
    rawBody: true,
  });

  // 🔒 Private Network Access (CORS Loopback) Support
  // This allows public sites (like app.swakora.tech) to access localhost/private IPs
  app.use((req, res, next) => {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Private-Network', 'true');
    }
    next();
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Serve local media uploads
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    index: false,
    redirect: false,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port, () => `🚀 Server running on http://localhost:${port}`);
}
bootstrap();
