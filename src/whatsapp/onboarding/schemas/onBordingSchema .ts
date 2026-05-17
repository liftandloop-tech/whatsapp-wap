import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsEnum,
} from 'class-validator';

export class OnboardingDto {
  @IsOptional()
  @IsNumber()
  clientId?: number;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  wabaId?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  phoneNumberId?: string;

  @IsOptional()
  @IsEnum(['SMS', 'VOICE', 'WHATSAPP'])
  method?: 'SMS' | 'VOICE' | 'WHATSAPP';

  @IsOptional()
  @IsString()
  otp?: string;

  @IsOptional()
  @IsString()
  pin?: string;
}
