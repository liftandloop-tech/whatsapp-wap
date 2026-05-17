import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

@Injectable()
export class LocalStorageService implements OnModuleInit {
  private readonly logger = new Logger(LocalStorageService.name);
  private readonly uploadRoot = join(process.cwd(), 'uploads');
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    const port = this.configService.get<number>('PORT', 3000);
    // In production, this would be the actual domain
    this.baseUrl = this.configService.get<string>('BASE_URL', `http://localhost:${port}`);
  }

  onModuleInit() {
    if (!existsSync(this.uploadRoot)) {
      this.logger.log(`Creating upload directory at ${this.uploadRoot}`);
      mkdirSync(this.uploadRoot, { recursive: true });
    }
  }

  async uploadStream(
    stream: Readable,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      const filePath = join(this.uploadRoot, key);
      const dir = dirname(filePath);

      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }

      this.logger.log(`Saving file to local storage: ${filePath}`);
      const writeStream = createWriteStream(filePath);
      
      await pipeline(stream, writeStream);

      // Return the URL to access this file via the static server
      return `${this.baseUrl}/uploads/${key}`;

    } catch (error) {
      this.logger.error(`Failed to save file to local storage: ${error.message}`);
      throw error;
    }
  }

  async uploadBuffer(
    buffer: Buffer,
    key: string,
    contentType: string,
  ): Promise<string> {
    const stream = Readable.from(buffer);
    return this.uploadStream(stream, key, contentType);
  }

}

