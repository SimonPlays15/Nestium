import { IsInt, IsOptional, Min } from "class-validator";

export class CreateEnrollmentDto {
    @IsOptional()
    @IsInt()
    @Min(1)
    ttlMinutes?: number;
}
