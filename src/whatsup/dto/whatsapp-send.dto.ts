import { IsArray, IsNotEmpty, IsOptional, IsString } from "class-validator";


export class WhatsappSendDto {
    
    @IsString()
    @IsNotEmpty()
    templateName: string

    @IsString()
    @IsNotEmpty()
    to: string;

    @IsString()
    @IsOptional()
    languageCode?: string = "en"

    @IsArray()
    @IsOptional()
    variables?: string[]; // Array of template variable values
}