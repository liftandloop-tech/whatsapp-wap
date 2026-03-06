import { Transform, Type } from "class-transformer";
import { IsInt, IsObject, IsOptional, IsString, Min } from "class-validator";



export class BaseReportRequestDto {

    @IsString()
    selectedColumns: string;   // comma-separated by UI
    

    @Type(() => Number)
    @IsInt()
    @Min(1)
    page: number;


    @Type(() => Number)
    @IsInt()
    @Min(1)
    limit: number;


    @IsOptional()
    @IsObject()
    @Transform(({ value }) => {
        if (!value) return {};
        if (typeof value === "string") {
            return JSON.parse(value);
        }
        return value;  
    })
    fltrs: Record<string, any>;


    @IsObject()
    @Transform(({ value }) => {
        if (typeof value === "string") {
            return JSON.parse(value);
        }
        return value;  
    })
    dateRange: {
        start: string;
        end: string;
    }

}