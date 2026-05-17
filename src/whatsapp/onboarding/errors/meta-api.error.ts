import { ErrorType } from './onboarding.error';

export interface MetaErrorPayload {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiError extends Error {
  constructor(
    public message: string,
    public code: number,
    public type: ErrorType,
    public subcode?: number,
    public fbtraceId?: string,
  ) {
    super(message);
    this.name = 'MetaApiError';
  }
}

export class MetaApiErrorMapper {
  static map(payload: MetaErrorPayload): MetaApiError {
    const { message, code, error_subcode, fbtrace_id } = payload;

    // 1. Authentication Failures (190)
    if (code === 190 || error_subcode === 463 || error_subcode === 467) {
      return new MetaApiError(
        message,
        code,
        ErrorType.REQUIRES_USER_ACTION,
        error_subcode,
        fbtrace_id,
      );
    }

    // 2. Throttling / Rate Limits (131030, 4, 17, 32)
    if ([1310429, 131030, 4, 17, 32].includes(code)) {
      return new MetaApiError(
        message,
        code,
        ErrorType.RETRYABLE,
        error_subcode,
        fbtrace_id,
      );
    }

    // 3. Validation / Bad Request (100)
    if (code === 100) {
      return new MetaApiError(
        message,
        code,
        ErrorType.NON_RETRYABLE,
        error_subcode,
        fbtrace_id,
      );
    }

    // Default to Non-Retryable for safety
    return new MetaApiError(
      message,
      code,
      ErrorType.NON_RETRYABLE,
      error_subcode,
      fbtrace_id,
    );
  }
}
