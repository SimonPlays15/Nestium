import { SetMetadata } from '@nestjs/common';
import { Permission } from '@prisma/client';

/**
 * Decorator to specify required permissions for accessing an endpoint
 *
 * Must be used together with PermissionsGuard and JwtAuthGuard
 *
 * @param permissions - Array of required permissions
 *
 * @example Single permission
 * ```typescript
 * @Get('servers')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions(Permission.SERVER_READ)
 * getServers() {
 *   return 'List of servers';
 * }
 * ```
 *
 * @example Multiple permissions (user needs ALL of them)
 * ```typescript
 * @Post('servers/:id/restart')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions(Permission.SERVER_READ, Permission.SERVER_RESTART)
 * restartServer() {
 *   return 'Server restarted';
 * }
 * ```
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata('permissions', permissions);
