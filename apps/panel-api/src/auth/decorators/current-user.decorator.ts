import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { UserResponseDto } from '../dto/auth-response.dto';

/**
 * Custom decorator to extract current authenticated user from request
 *
 * This decorator should be used on endpoints protected by JwtAuthGuard.
 * It provides type-safe access to the authenticated user's data.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: UserResponseDto) {
 *   return user;
 * }
 * ```
 *
 * @example Extract specific field
 * ```typescript
 * @Get('email')
 * @UseGuards(JwtAuthGuard)
 * getEmail(@CurrentUser('email') email: string) {
 *   return { email };
 * }
 * ```
 */
export const CurrentUser = createParamDecorator(
  (data: keyof UserResponseDto | undefined, ctx: ExecutionContext): UserResponseDto | any => {
    const request = ctx.switchToHttp().getRequest();
    const user = request.user;

    // If a specific field is requested, return only that field
    if (data) {
      return user?.[data];
    }

    // Otherwise return the entire user object
    return user;
  },
);
