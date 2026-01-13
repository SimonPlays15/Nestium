import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Data Transfer Object (DTO) for creating allocations.
 *
 * This class is used to define the structure and validation rules for the properties
 * required when creating an allocation.
 */
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
  protocol?: 'TCP' | 'UDP'; // default TCP
}
