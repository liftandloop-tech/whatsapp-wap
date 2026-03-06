import { Type } from "class-transformer";
import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, ValidateNested } from "class-validator";



export class MetaComponentDto {
  
    @IsString()
    @IsNotEmpty()
    type:string;

    [key: string]: any;   // Any number of extra fields allowed (text, format, buttons, cards...)    
}

export class CreateTemplateDto {

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsEnum(["utility", "marketing", "authentication"])
    category: "utility" | "marketing" | "authentication";

    @IsString()
    @IsNotEmpty()
    language: string

    @IsOptional()
    @IsString()
    templateType: "basic" | "carousel";

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => MetaComponentDto)
    components: MetaComponentDto[];
}