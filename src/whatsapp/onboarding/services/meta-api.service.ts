import { Inject, Injectable } from '@nestjs/common';
import axios from 'axios';
import {
  MetaApiService,
  TokenResponse,
  AddPhoneParams,
  RequestOtpParams,
  VerifyOtpParams,
  RegisterParams,
  PhoneStatus,
  MetaRequestOptions,
} from '../interfaces/meta-api.interface';
import type { TokenManager } from '../interfaces/token-manager.interface';
import { MetaApiExecutor } from '../meta-api.executor';

@Injectable()
export class MetaApiServiceImpl implements MetaApiService {
  private readonly executor: MetaApiExecutor;

  constructor(
    @Inject('TOKEN_MANAGER')
    private readonly tokenManager: TokenManager,
  ) {
    this.executor = new MetaApiExecutor(this.tokenManager);
  }

  async exchangeCodeForToken(code: string): Promise<TokenResponse> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;
    const redirectUri = process.env.META_REDIRECT_URI;

    if (!appId || !appSecret) {
      throw new Error(
        'CONFIG_MISSING: META_APP_ID or META_APP_SECRET not set in environment',
      );
    }

    try {
      // 1. Initial Exchange (Short-lived token)
      const response = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/${process.env.WHATSAPP_VERSION || 'v25.0'}/oauth/access_token`,
        {
          params: {
            client_id: appId,
            client_secret: appSecret,
            redirect_uri: redirectUri,
            code,
          },
        },
      );

      const shortLivedToken = response.data.access_token;

      // 2. Exchange for Long-lived User Token (Production Standard)
      const longLivedResponse = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/${process.env.WHATSAPP_VERSION || 'v25.0'}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: shortLivedToken,
          },
        },
      );

      return {
        accessToken: longLivedResponse.data.access_token,
        expiresIn: longLivedResponse.data.expires_in, // typically ~5184000 (60 days)
      };
    } catch (error: any) {
      throw new Error(
        `OAUTH_EXCHANGE_FAILED: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async getWabaDetails(
    token: string,
  ): Promise<{ wabaId: string; businessId: string; phoneNumbers: any[] }> {
    try {
      // 3. Inspect Token to find User ID / App ID context
      const debugResponse = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/debug_token`,
        {
          params: {
            input_token: token,
            access_token: `${process.env.META_APP_ID}|${process.env.META_APP_SECRET}`,
          },
        },
      );

      const userId = debugResponse.data.data.user_id;

      // 4. Fetch Assigned WABAs for this user
      const wabaResponse = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/${process.env.WHATSAPP_VERSION || 'v25.0'}/${userId}/assigned_whatsapp_business_accounts`,
        {
          params: {
            fields: 'id,name,currency,timezone_id,business,permissions',
          },
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      const accounts = wabaResponse.data.data;
      if (!accounts || accounts.length === 0) {
        throw new Error(
          'NO_WABA_FOUND: User has no WhatsApp Business Accounts assigned',
        );
      }

      // 5. Select the primary WABA (usually the one just created) and validate permissions
      const waba = accounts[0];
      this.validatePermissions(waba);

      // 6. Fetch Phone Numbers associated with this WABA ID
      const phoneResponse = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/${process.env.WHATSAPP_VERSION || 'v25.0'}/${waba.id}/phone_numbers`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );

      return {
        wabaId: waba.id,
        businessId: waba.business?.id || '',
        phoneNumbers: phoneResponse.data.data || [],
      };
    } catch (error: any) {
      throw new Error(
        `WABA_DISCOVERY_FAILED: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async refreshToken(token: string): Promise<TokenResponse> {
    const appId = process.env.META_APP_ID;
    const appSecret = process.env.META_APP_SECRET;

    if (!appId || !appSecret) {
      throw new Error('CONFIG_MISSING: META_APP_ID or META_APP_SECRET not set');
    }

    try {
      // Exchange long-lived token for new long-lived token (extends expiry)
      const response = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/${process.env.WHATSAPP_VERSION || 'v25.0'}/oauth/access_token`,
        {
          params: {
            grant_type: 'fb_exchange_token',
            client_id: appId,
            client_secret: appSecret,
            fb_exchange_token: token,
          },
        },
      );

      return {
        accessToken: response.data.access_token,
        expiresIn: response.data.expires_in,
      };
    } catch (error: any) {
      throw new Error(
        `TOKEN_REFRESH_FAILED: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  async fetchTemplates(wabaId: string, token: string): Promise<any[]> {
    try {
      const response = await axios.get(
        `${process.env.WHATSAPP_API_BASE_URL}/${process.env.WHATSAPP_VERSION || 'v25.0'}/${wabaId}/message_templates`,
        {
          headers: { Authorization: `Bearer ${token}` },
        },
      );
      return response.data.data || [];
    } catch (error: any) {
      throw new Error(
        `FETCH_TEMPLATES_FAILED: ${error.response?.data?.error?.message || error.message}`,
      );
    }
  }

  private validatePermissions(waba: any): void {
    const required = ['MESSAGING', 'MANAGE_TEMPLATES', 'MANAGE_PHONE'];
    const permissions = waba.permissions || [];

    const missing = required.filter((p) => !permissions.includes(p));
    if (missing.length > 0) {
      throw new Error(
        `INSUFFICIENT_PERMISSIONS: Missing access to ${missing.join(', ')}. Please re-onboard with full permissions.`,
      );
    }
  }

  async addPhoneNumber(
    params: AddPhoneParams,
    options?: MetaRequestOptions,
  ): Promise<{ id: string }> {
    return this.executor.execute(
      {
        method: 'POST',
        url: `/${params.wabaId}/phone_numbers`,
        data: {
          phone_number: params.phoneNumber,
        },
        wabaId: params.wabaId,
      },
      options,
    );
  }

  async requestOtp(
    params: RequestOtpParams,
    options?: MetaRequestOptions,
  ): Promise<void> {
    return this.executor.execute(
      {
        method: 'POST',
        url: `/${params.phoneNumberId}/request_code`,
        data: {
          code_method: params.method,
          language: 'en_US', // Default
        },
        wabaId: params.wabaId,
      },
      options,
    );
  }

  async verifyOtp(
    params: VerifyOtpParams,
    options?: MetaRequestOptions,
  ): Promise<void> {
    return this.executor.execute(
      {
        method: 'POST',
        url: `/${params.phoneNumberId}/verify_code`,
        data: {
          code: params.code,
        },
        wabaId: params.wabaId,
      },
      options,
    );
  }

  async registerNumber(
    params: RegisterParams,
    options?: MetaRequestOptions,
  ): Promise<void> {
    return this.executor.execute(
      {
        method: 'POST',
        url: `/${params.phoneNumberId}/register`,
        data: {
          messaging_product: 'whatsapp',
          pin: params.pin,
        },
        wabaId: params.wabaId,
      },
      options,
    );
  }

  async getPhoneStatus(
    wabaId: string,
    phoneNumberId: string,
    options?: MetaRequestOptions,
  ): Promise<PhoneStatus> {
    return this.executor.execute(
      {
        method: 'GET',
        url: `/${phoneNumberId}`,
        params: {
          fields: 'status,quality_rating',
        },
        wabaId,
      },
      options,
    );
  }
}
