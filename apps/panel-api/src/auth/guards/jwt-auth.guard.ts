import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Observable } from 'rxjs';

/**
 * JWT Authentication Guard
 *
 * Protects routes by requiring a valid JWT token in the Authorization header.
 * Use this guard on any endpoint that requires authentication.
 *
 * @example
 * ```typescript
 * @Get('profile')
 * @UseGuards(JwtAuthGuard)
 * getProfile(@CurrentUser() user: UserResponseDto) {
 *   return user;
 * }
 * ```
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  /**
   * Determines if the request can proceed
   *
   * @param context - Execution context containing request details
   * @returns Boolean or Promise/Observable indicating if request is authorized
   */
  canActivate(context: ExecutionContext): boolean | Promise<boolean> | Observable<boolean> {
    return super.canActivate(context);
  }

  /**
   * Handle authentication errors
   *
   * @param err - Error from passport strategy
   * @param user - User object (null if authentication failed)
   * @param info - Additional information about the error
   * @throws UnauthorizedException with appropriate error message
   */
  handleRequest(err: any, user: any, info: any) {
    // Handle specific error cases
    if (info?.name === 'TokenExpiredError') {
      throw new UnauthorizedException('Token has expired');
    }

    if (info?.name === 'JsonWebTokenError') {
      throw new UnauthorizedException('Invalid token');
    }

    if (err || !user) {
      throw err || new UnauthorizedException('Authentication required');
    }

    return user;
  }
}
