import {
  IsString,
  IsOptional,
  IsEnum,
  IsDateString,
  IsObject,
} from 'class-validator';
import { OnboardingState } from '../onboarding/onboarding-state.enum';

export class CreateWabaAccountDto {
  @IsString()
  clientId: string;

  @IsString()
  businessId: string;

  @IsString()
  wabaId: string;

  @IsString()
  accessToken: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsEnum(OnboardingState)
  status?: OnboardingState;

  @IsOptional()
  tokenExpiresAt?: Date;

  @IsOptional()
  @IsObject()
  metadata?: {
    displayName?: string;
    category?: string;
    qualityRating?: string;
  };
}
