import { IsInt, IsOptional, IsString, Max, Min } from "class-validator";

export class CreateAllocationsDto {
    @IsOptional()
    @IsString()
    ip?: string; // default 0.0.0.0

    @IsInt()
    @Min(1)
    @Max(65535)
    startPort!: number;

    @IsInt()
    @Min(1)
    @Max(65535)
    endPort!: number;

    @IsOptional()
    protocol?: "TCP" | "UDP"; // default TCP
}
