import { IsInt, IsOptional, Min } from 'class-validator';

/**
 * Data Transfer Object (DTO) for creating an enrollment.
 *
 * This class defines the structure and validation rules for the data required
 * to create an enrollment. The properties in this class may include validation
 * decorators to ensure data integrity and correctness.
 *
 * Validation rules:
 * - `ttlMinutes` is an optional integer with a minimum value of 1.
 *
 * Decorators used:
 * - `@IsOptional()`: Marks the property as optional.
 * - `@IsInt()`: Ensures the property, if provided, is an integer.
 * - `@Min(1)`: Specifies the minimum acceptable value for the property.
 */
export class CreateEnrollmentDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  ttlMinutes?: number;
}
