import { EmbeddedSignupDto } from '../dto/signup.dto';
import { AddPhoneDto } from '../dto/add-phone.dto';
import { RequestOtpDto } from '../dto/request-otp.dto';
import { VerifyOtpDto } from '../dto/verify-otp.dto';
import { RegisterDto } from '../dto/register.dto';

export interface OnboardingService {
  /**
   * Orchestrates the embedded signup flow (oauth callback).
   */
  startEmbeddedSignup(dto: EmbeddedSignupDto): Promise<void>;

  /**
   * Adds a phone number to a specific WABA.
   */
  addPhoneNumber(dto: AddPhoneDto): Promise<void>;

  /**
   * Requests an OTP (SMS/Voice) from Meta.
   */
  requestOtp(dto: RequestOtpDto): Promise<void>;

  /**
   * Verifies the OTP code with Meta.
   */
  verifyOtp(dto: VerifyOtpDto): Promise<void>;

  /**
   * Registers/Activates the number for messaging.
   */
  registerNumber(dto: RegisterDto): Promise<void>;

  /**
   * Synchronizes state based on webhook events.
   */
  handleWebhookEvent(payload: any): Promise<void>;
}
