import { SetMetadata } from '@nestjs/common';
import { UserRole } from '@prisma/client';

/**
 * Decorator to specify required roles for accessing an endpoint
 *
 * Must be used together with RolesGuard
 *
 * @param roles - Array of allowed user roles
 *
 * @example
 * ```typescript
 * @Get('admin-dashboard')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN)
 * getAdminDashboard() {
 *   return 'Admin only content';
 * }
 * ```
 *
 * @example Multiple roles
 * ```typescript
 * @Post('moderate')
 * @UseGuards(JwtAuthGuard, RolesGuard)
 * @Roles(UserRole.ADMIN, UserRole.MODERATOR)
 * moderateContent() {
 *   return 'Admin or Moderator only';
 * }
 * ```
 */
export const Roles = (...roles: UserRole[]) => SetMetadata('roles', roles);
