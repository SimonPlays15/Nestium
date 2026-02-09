import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { TokenBlacklistService } from '../services/token-blacklist.service';
import { Request } from 'express';

/**
 * JWT token payload structure
 */
export interface JwtPayload {
  sub: string; // User ID
  email: string;
  role: string;
  iat?: number; // Issued at
  exp?: number; // Expiration
}

/**
 * Passport JWT Strategy for validating and extracting user from JWT tokens
 *
 * This strategy:
 * 1. Extracts JWT token from Authorization header (Bearer token)
 * 2. Validates token signature with secret key
 * 3. Checks if token is blacklisted
 * 4. Checks if user still exists in database
 * 5. Attaches user to request object
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly authService: AuthService,
    private readonly blacklistService: TokenBlacklistService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
      passReqToCallback: true, // Pass request to validate() to access raw token
    });
  }

  /**
   * Validate JWT payload and load user from database
   *
   * This method is called automatically by Passport after token signature is verified
   *
   * @param request - Express request object (for accessing raw token)
   * @param payload - Decoded JWT payload
   * @returns User object (attached to request.user)
   * @throws UnauthorizedException if token is blacklisted or user not found
   */
  async validate(request: Request, payload: JwtPayload) {
    // Extract raw token from Authorization header
    const authHeader = request.headers.authorization;
    const token = authHeader?.replace('Bearer ', '');

    if (!token) {
      throw new UnauthorizedException('No token provided');
    }

    // Check if token is blacklisted
    const isBlacklisted = await this.blacklistService.isBlacklisted(token);
    if (isBlacklisted) {
      throw new UnauthorizedException('Token has been revoked');
    }

    // Load user from database
    const user = await this.authService.getUserById(payload.sub);

    if (!user) {
      throw new UnauthorizedException('User no longer exists');
    }

    // This will be available as request.user in controllers
    return user;
  }
}
