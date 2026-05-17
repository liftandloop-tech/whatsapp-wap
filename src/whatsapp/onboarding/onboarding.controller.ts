import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Inject,
  HttpCode,
  HttpStatus,
  Query,
} from '@nestjs/common';
import type { OnboardingService } from './interfaces/onboarding.interface';
import { EmbeddedSignupDto } from './dto/signup.dto';
import { AddPhoneDto } from './dto/add-phone.dto';
import { RequestOtpDto } from './dto/request-otp.dto';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { RegisterDto } from './dto/register.dto';

@Controller('whatsapp/onboarding')
export class OnboardingController {
  constructor(
    @Inject('ONBOARDING_SERVICE')
    private readonly onboardingService: OnboardingService,
  ) {}

  @Post('embedded-signup')
  @HttpCode(HttpStatus.OK)
  async embeddedSignup(@Body() dto: EmbeddedSignupDto) {
    await this.onboardingService.startEmbeddedSignup(dto);
    return {
      success: true,
      message: 'OAuth handshake successful. Account initiated.',
    };
  }

  @Post('add-number')
  async addNumber(@Body() dto: AddPhoneDto) {
    await this.onboardingService.addPhoneNumber(dto);
    return { success: true, message: 'Phone number attached to WABA pool.' };
  }

  @Post('request-otp')
  @HttpCode(HttpStatus.OK)
  async requestOtp(@Body() dto: RequestOtpDto) {
    await this.onboardingService.requestOtp(dto);
    return { success: true, message: 'OTP requested via ' + dto.method };
  }

  @Post('verify-otp')
  @HttpCode(HttpStatus.OK)
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.onboardingService.verifyOtp(dto);
    return { success: true, message: 'OTP verified successfully.' };
  }

  @Post('register')
  @HttpCode(HttpStatus.OK)
  async register(@Body() dto: RegisterDto) {
    await this.onboardingService.registerNumber(dto);
    return {
      success: true,
      message: 'Registration request submitted to Meta.',
    };
  }

  @Get('status/:phoneNumberId')
  async getStatus(
    @Param('phoneNumberId') phoneNumberId: string,
    @Query('wabaId') wabaId: string,
  ) {
    // This could call a specialized status-check method in the service
    return { success: true, phoneNumberId, wabaId, status: 'CHECK_WEBHOOKS' };
  }
}
