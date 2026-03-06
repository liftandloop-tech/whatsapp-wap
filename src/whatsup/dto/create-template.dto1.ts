import {IsEnum, IsNotEmpty, IsString, ValidateNested, IsOptional, IsArray} from "class-validator";
import { Type } from "class-transformer";


export class TemplateButtonDto {
  @IsEnum(["QUICK_REPLY", "URL", "PHONE_NUMBER"])
  type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

  @IsString()
  text: string;

  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;
}

export class TemplateComponentDto {
  @IsOptional()
  header?: {
    type: "TEXT";
    text: string;
  };

  @IsString()
  @IsNotEmpty()
  body: string;

  @IsOptional()
  @IsString()
  footer?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateButtonDto)
  buttons?: TemplateButtonDto[];
}

export class CreateTemplateDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  language: string;

  @IsEnum(["utility", "marketing", "authentication"])
  category: "utility" | "marketing" | "authentication";

  @IsString()
  @IsNotEmpty()
  type: string;

  @ValidateNested()
  @Type(() => TemplateComponentDto)
  components: TemplateComponentDto;
}
