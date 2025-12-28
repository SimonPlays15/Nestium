import { IsObject, IsOptional, IsString, IsUrl } from "class-validator";

export class RegisterNodeDto {
    @IsString()
    token!: string;

    @IsString()
    name!: string;

    @IsUrl()
    endpointUrl!: string;

    @IsOptional()
    @IsString()
    agentVersion?: string;

    @IsOptional()
    @IsObject()
    capacity?: Record<string, unknown>;
}
