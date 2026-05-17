import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';

export class CreateTemplateDto {
  @IsInt()
  clientId: number;

  @IsString()
  name: string;

  @IsString()
  language: string;

  @IsEnum(['utility', 'marketing', 'authentication', 'UTILITY', 'MARKETING', 'AUTHENTICATION'])
  category: 'utility' | 'marketing' | 'authentication' | 'UTILITY' | 'MARKETING' | 'AUTHENTICATION';

  @IsString()
  route: 'transactional' | 'promotional';

  @IsArray()
  components: any[]; // ✅ IMPORTANT FIX

  @IsOptional()
  @IsString()
  dltTemplateId?: string;
  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  id?: string;

  @IsOptional()
  @IsInt()
  ttlSeconds?: number;

  @IsOptional()
  @IsBoolean()
  clickTracking?: boolean;
}
