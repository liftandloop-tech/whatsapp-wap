import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDate,
  IsMongoId,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class RecipientDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  vars?: string[];
}

export class CreateCampaignDto {
  @IsNumber()
  @IsNotEmpty()
  clientId: number;

  @IsString()
  @IsNotEmpty()
  templateId: string; // CUID or ObjectId

  @IsString()
  @IsNotEmpty()
  from: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  recipients: RecipientDto[];

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  mediaId?: string;

  @IsBoolean()
  @IsNotEmpty()
  isSplit: boolean;

  @IsNumber()
  @ValidateIf((o) => o.isSplit === true)
  @Min(1)
  batchSize?: number;

  @IsNumber()
  @ValidateIf((o) => o.isSplit === true)
  @Min(0)
  intervalSeconds?: number;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  scheduleAt: Date;

  @IsString()
  @IsNotEmpty()
  status: string;

  @IsString()
  @IsOptional()
  country?: string;
}
