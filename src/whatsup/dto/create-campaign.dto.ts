import { Type } from "class-transformer";
import { ArrayMinSize, IsArray, IsBoolean, IsDate, IsMongoId, IsNotEmpty, IsNumber, IsOptional, IsString, Min, ValidateIf } from "class-validator";


export class CreateCampaignDto {

    @IsString()
    @IsNotEmpty()
    @IsMongoId()
    templateId: string; // will be converted to ObjectId in service

    @IsString()
    @IsNotEmpty()
    from: string;

    @IsArray()
    @ArrayMinSize(1)
    @IsString({ each: true })
    recipients: string[];

    @IsString()
    @IsNotEmpty()
    content: string;

    @IsString()
    @IsNotEmpty()
    name: string;

    @IsBoolean()
    @IsNotEmpty()
    isSplit: boolean;

    @IsNumber()
    @ValidateIf(o => o.isSplit === true)
    @Min(1)
    batchSize?: number;

    @IsNumber()
    @ValidateIf(o => o.isSplit === true)
    @Min(0)
    intervalSeconds?: number;

    @IsOptional()
    @Type(() => Date)
    @IsDate()
    scheduleAt: Date;

    @IsString()
    @IsNotEmpty()
    status: string;
}