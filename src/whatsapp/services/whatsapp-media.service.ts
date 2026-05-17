import { Injectable, Logger } from '@nestjs/common';
import { WhatsappMediaProvider } from '../providers/whatsapp-media.provider';

@Injectable()
export class WhatsappMediaService {
  private readonly logger = new Logger(WhatsappMediaService.name);

  constructor(private whatsappMediaProvider: WhatsappMediaProvider) {}

  async uploadMediaForClient(clientId: number, file: any, type?: string) {
    try {
      const result = await this.whatsappMediaProvider.uploadMedia(
        clientId,
        file.buffer,
        file.originalname,
        file.mimetype,
        type,
      );

      if (!result.success || !result.data) {
        return {
          success: false,
          message: "Media upload failed at Meta's end",
          error: result.error || 'Missing response data from Meta',
        };
      }

      return {
        success: true,
        message: 'Media uploaded successfully to Meta',
        data: {
          mediaId: result.data.mediaId,
          handle: result.data.handle,
          localUrl: result.data.localUrl,
        },

      };
    } catch (error: any) {
      this.logger.error(`Error in WhatsappMediaService: ${error.message}`);
      return {
        success: false,
        message: 'Internal server error during media upload',
        error: error.message,
      };
    }
  }
}
