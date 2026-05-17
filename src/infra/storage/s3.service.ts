import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { Readable } from 'stream';

@Injectable()
export class S3Service {
  private readonly logger = new Logger(S3Service.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  constructor(private configService: ConfigService) {
    const region = this.configService.get<string>('S3_REGION');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY_ID');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_ACCESS_KEY');
    this.bucket = this.configService.get<string>('S3_BUCKET_NAME') || 'missing-bucket';

    if (!region || !accessKeyId || !secretAccessKey || !this.bucket) {
      this.logger.warn('S3 configuration is incomplete. Media uploads will fail.');
    }

    this.s3Client = new S3Client({
      region: region || 'us-east-1',
      credentials: {
        accessKeyId: accessKeyId || 'MISSING',
        secretAccessKey: secretAccessKey || 'MISSING',
      },
    });
  }

  async uploadStream(
    stream: Readable,
    key: string,
    contentType: string,
  ): Promise<string> {
    try {
      const upload = new Upload({
        client: this.s3Client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: stream,
          ContentType: contentType,
        },
      });

      await upload.done();
      
      const region = this.configService.get<string>('S3_REGION');
      return `https://${this.bucket}.s3.${region}.amazonaws.com/${key}`;
    } catch (error) {
      this.logger.error(`Failed to upload stream to S3: ${error.message}`);
      throw error;
    }
  }
}
