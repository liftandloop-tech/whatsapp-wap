import { IsString, IsNotEmpty, IsPhoneNumber } from 'class-validator';

export class AddPhoneDto {
  @IsString()
  @IsNotEmpty()
  wabaId: string;

  @IsString()
  @IsNotEmpty()
  @IsPhoneNumber()
  phoneNumber: string;

  @IsString()
  @IsNotEmpty()
  clientId: string;
}
