import axios from 'axios';
import { WabaCredentialService } from '../services/waba-credential.service';
import { Injectable, Logger } from '@nestjs/common';
import { LocalStorageService } from '../../infra/storage/local-storage.service';
import FormData = require('form-data');


@Injectable()
export class WhatsappMediaProvider {
  private readonly logger = new Logger(WhatsappMediaProvider.name);
  private readonly baseUrl =
    process.env.WHATSAPP_API_BASE_URL || 'https://graph.facebook.com';
  private readonly version = process.env.WHATSAPP_VERSION || 'v25.0';

  constructor(
    private readonly credentialService: WabaCredentialService,
    private readonly storageService: LocalStorageService,
  ) {}

  /**
   * 📤 Resumable Upload for Template Assets
   * Meta requires a 'handle' (h) for template headers, which is different from standard message media IDs.
   */
  async uploadTemplateAsset(
    clientId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
  ) {
    try {
      const creds = await this.credentialService.getCredentials(clientId);
      const appId = process.env.META_APP_ID;

      if (!appId) {
        throw new Error('META_APP_ID is not configured in environment');
      }

      // Step 1: Initialize the upload session
      const initUrl = `${this.baseUrl}/${this.version}/${appId}/uploads`;
      const initRes = await axios.post(
        initUrl,
        null,
        {
          params: {
            file_length: fileBuffer.length,
            file_type: mimeType,
            access_token: creds.accessToken,
          },
        },
      );

      const sessionId = initRes.data.id;
      this.logger.debug(`[TEMPLATE_ASSET_UPLOAD] Session initialized: ${sessionId}`);

      // Step 2: Upload the binary data
      const uploadUrl = `${this.baseUrl}/${this.version}/${sessionId}`;
      const uploadRes = await axios.post(uploadUrl, fileBuffer, {
        headers: {
          Authorization: `OAuth ${creds.accessToken}`,
          'file-name': fileName,
        },
      });

      // The 'h' handle is what Meta needs for 'header_handle' in templates
      return uploadRes.data.h;
    } catch (err: any) {
      this.logger.error(
        `[TEMPLATE_ASSET_UPLOAD_FAILURE] client=${clientId}: ${err?.message}`,
        err?.response?.data,
      );
      throw err;
    }
  }

  /**
   * Uploads media to Meta's servers for use in messages or templates.
   * @param clientId The client's unique identifier to resolve credentials.
   * @param fileBuffer The binary data of the file.
   * @param fileName The name of the file (e.g. 'offer.pdf').
   * @param mimeType The MIME type of the file.
   * @param type Optional flag, if 'TEMPLATE' it will also generate a Meta Handle.
   */
  async uploadMedia(
    clientId: number,
    fileBuffer: Buffer,
    fileName: string,
    mimeType: string,
    type?: string,
  ) {
    try {
      const isTemplate = type?.toUpperCase() === 'TEMPLATE';
      const creds = await this.credentialService.getCredentials(clientId);
      const url = `${this.baseUrl}/${this.version}/${creds.phoneNumberId}/media`;

      // 🧹 Sanitize filename to avoid URL issues
      const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');

      this.logger.log(
        `[MEDIA_UPLOAD] client=${clientId} -> phone=${creds.phoneNumberId} file=${sanitizedFileName} isTemplate=${isTemplate}`,
      );

      // 📂 STRUCTURED STORAGE: templates/images, templates/videos, etc.
      let localKey: string;
      if (isTemplate) {
        let subDir = 'others';
        if (mimeType.includes('gif')) {
          subDir = 'gifs';
        } else if (mimeType.startsWith('image/')) {
          subDir = 'images';
        } else if (mimeType.startsWith('video/')) {
          subDir = 'videos';
        } else if (
          mimeType.includes('pdf') ||
          mimeType.includes('msword') ||
          mimeType.includes('document') ||
          mimeType.includes('text/plain')
        ) {
          subDir = 'documents';
        }
        localKey = `templates/${subDir}/${Date.now()}_${sanitizedFileName}`;
      } else {
        localKey = `outbound/${clientId}/${Date.now()}_${sanitizedFileName}`;
      }

      const localUrl = await this.storageService.uploadBuffer(
        fileBuffer,
        localKey,
        mimeType,
      );

      let handle: string | undefined;
      let mediaId: string | undefined;

      // 📤 Step 3: Dispatch to Meta (Concurrent if template)
      const uploadPromises: Promise<any>[] = [];

      // Always get a Media ID (required for sending messages)
      const form = new FormData();
      form.append('file', fileBuffer, {
        filename: fileName,
        contentType: mimeType,
      });
      form.append('messaging_product', 'whatsapp');

      uploadPromises.push(
        axios.post(url, form, {
          headers: {
            ...form.getHeaders(),
            Authorization: `Bearer ${creds.accessToken}`,
          },
        }).then(res => {
          mediaId = res.data.id;
        })
      );

      // If it's for a template, also get a Resumable Upload Handle
      if (isTemplate) {
        uploadPromises.push(
          this.uploadTemplateAsset(
            clientId,
            fileBuffer,
            fileName,
            mimeType,
          ).then(h => {
            handle = h;
          })
        );
      }

      await Promise.all(uploadPromises);
      this.logger.log(`[MEDIA_UPLOAD_SUCCESS] client=${clientId}: mediaId=${mediaId}, handle=${handle}`);

      return {
        success: true,
        data: {
          id: mediaId || handle,
          handle: handle,
          mediaId: mediaId,
          localUrl,
        },
      };
    } catch (err: any) {
      const metaError = err?.response?.data?.error;
      if (metaError?.code === 190 || metaError?.code === 200) {
        await this.credentialService.reportAuthFailure(clientId);
      }

      this.logger.error(
        `[MEDIA_UPLOAD_FAILURE] client=${clientId}: ${err?.message}`,
        err?.response?.data,
      );
      return {
        success: false,
        error:
          err?.response?.data ||
          err?.message ||
          'Failed to upload media to Meta',
      };
    }
  }
}
