import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseInterceptors,
  UploadedFile,
  Body,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import * as express from 'express';
import { join } from 'path';
import { existsSync } from 'fs';
import { FileInterceptor } from '@nestjs/platform-express';
import { WhatsappMediaService } from '../services/whatsapp-media.service';

@Controller('whatsapp/media')
export class MediaController {
  constructor(private readonly mediaService: WhatsappMediaService) {}

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(
    @UploadedFile() file: any,
    @Body('clientId') clientId: string,
    @Body('type') type: string,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    if (!clientId) {
      throw new BadRequestException('clientId is required');
    }

    return this.mediaService.uploadMediaForClient(Number(clientId), file, type);
  }

  /**
   * 🖼️ Static File Proxy
   * Serves files from the /uploads directory. 
   * This is necessary because the default NestJS static serving might not match the proxied BASE_URL.
   */
  @Get('uploads/*')
  async serveFile(@Param('0') path: string, @Res() res: express.Response) {
    const filePath = join(process.cwd(), 'uploads', path);
    
    if (!existsSync(filePath)) {
      throw new NotFoundException(`File not found: ${path}`);
    }

    return res.sendFile(filePath);
  }
}
