import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Permission, UserRole } from '@prisma/client';

/**
 * Guard to restrict access based on user permissions
 *
 * Use in combination with @RequirePermissions() decorator to protect endpoints
 * that require specific permissions.
 *
 * Important: This guard should be used AFTER JwtAuthGuard to ensure user is authenticated
 *
 * @example
 * ```typescript
 * @Post('servers')
 * @UseGuards(JwtAuthGuard, PermissionsGuard)
 * @RequirePermissions(Permission.SERVER_CREATE)
 * createServer() {
 *   return 'Server created';
 * }
 * ```
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    // Get required permissions from @RequirePermissions() decorator
    const requiredPermissions = this.reflector.getAllAndOverride<Permission[]>('permissions', [
      context.getHandler(),
      context.getClass(),
    ]);

    // If no permissions specified, allow access
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // Get user from request (set by JwtAuthGuard)
    const { user } = context.switchToHttp().getRequest();

    if (!user) {
      throw new ForbiddenException('User not authenticated');
    }

    // Admins have all permissions
    if (user.role === UserRole.ADMIN) {
      return true;
    }

    // Check if user has all required permissions
    const userPermissions = user.permissions || [];
    const hasAllPermissions = requiredPermissions.every((permission) =>
      userPermissions.includes(permission),
    );

    if (!hasAllPermissions) {
      throw new ForbiddenException(
        `Missing required permissions: ${requiredPermissions.join(', ')}`,
      );
    }

    return true;
  }
}
