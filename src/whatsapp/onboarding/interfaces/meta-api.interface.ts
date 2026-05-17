export interface TokenResponse {
  accessToken: string;
  expiresIn: number;
}

export interface AddPhoneParams {
  wabaId: string;
  phoneNumber: string;
}

export interface RequestOtpParams {
  wabaId: string;
  phoneNumberId: string;
  method: 'SMS' | 'VOICE';
}

export interface VerifyOtpParams {
  wabaId: string;
  phoneNumberId: string;
  code: string;
}

export interface RegisterParams {
  wabaId: string;
  phoneNumberId: string;
  pin: string;
}

export interface PhoneStatus {
  id: string;
  status: string;
  quality_rating: string;
}

export interface MetaRequestOptions {
  retryCount?: number;
  idempotencyKey?: string;
  requestId?: string;
}

export interface MetaApiService {
  exchangeCodeForToken(code: string): Promise<TokenResponse>;
  getWabaDetails(
    token: string,
  ): Promise<{ wabaId: string; businessId: string; phoneNumbers?: any[] }>;
  addPhoneNumber(
    params: AddPhoneParams,
    options?: MetaRequestOptions,
  ): Promise<{ id: string }>;
  requestOtp(
    params: RequestOtpParams,
    options?: MetaRequestOptions,
  ): Promise<void>;
  verifyOtp(
    params: VerifyOtpParams,
    options?: MetaRequestOptions,
  ): Promise<void>;
  registerNumber(
    params: RegisterParams,
    options?: MetaRequestOptions,
  ): Promise<void>;
  getPhoneStatus(
    wabaId: string,
    phoneNumberId: string,
    options?: MetaRequestOptions,
  ): Promise<PhoneStatus>;
  refreshToken(token: string): Promise<TokenResponse>;
  fetchTemplates(wabaId: string, token: string): Promise<any[]>;
}
