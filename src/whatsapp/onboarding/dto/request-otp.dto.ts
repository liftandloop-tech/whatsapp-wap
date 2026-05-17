import { IsString, IsNotEmpty, IsEnum } from 'class-validator';

export enum OtpMethod {
  SMS = 'SMS',
  VOICE = 'VOICE',
}

export class RequestOtpDto {
  @IsString()
  @IsNotEmpty()
  phoneNumberId: string;

  @IsEnum(OtpMethod)
  method: OtpMethod;
}
