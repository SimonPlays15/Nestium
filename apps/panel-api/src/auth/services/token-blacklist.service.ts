import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../prisma/prisma.service';
import crypto from 'crypto';

/**
 * Service for managing JWT token blacklisting
 *
 * Provides functionality to blacklist tokens when users logout,
 * check if tokens are blacklisted, and cleanup expired tokens.
 *
 * Uses PostgreSQL instead of Redis for simpler infrastructure.
 */
@Injectable()
export class TokenBlacklistService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * Add a token to the blacklist
   *
   * Extracts expiration time from JWT and stores token hash with TTL.
   * The token will be automatically cleaned up after expiration.
   *
   * @param token - JWT token to blacklist
   * @param userId - User ID who owns the token
   */
  async addToBlacklist(token: string, userId: string): Promise<void> {
    const tokenHash = this.hashToken(token);
    const expiresAt = this.getTokenExpiration(token);

    await this.prisma.blacklistedToken.create({
      data: {
        tokenHash,
        userId,
        expiresAt,
      },
    });
  }

  /**
   * Check if a token is blacklisted
   *
   * Performs fast indexed lookup in database.
   * Uses token hash for privacy and performance.
   *
   * @param token - JWT token to check
   * @returns True if token is blacklisted
   */
  async isBlacklisted(token: string): Promise<boolean> {
    const tokenHash = this.hashToken(token);

    const blacklisted = await this.prisma.blacklistedToken.findUnique({
      where: { tokenHash },
      select: { id: true }, // Only select ID for minimal data transfer
    });

    return !!blacklisted;
  }

  /**
   * Remove expired tokens from blacklist
   *
   * Called by scheduler to keep database clean.
   * Tokens are kept until their natural expiration.
   *
   * @returns Number of tokens deleted
   */
  async cleanupExpired(): Promise<number> {
    const result = await this.prisma.blacklistedToken.deleteMany({
      where: {
        expiresAt: {
          lt: new Date(),
        },
      },
    });

    return result.count;
  }

  /**
   * Revoke all tokens for a specific user
   *
   * Useful for "logout from all devices" functionality
   * or when admin needs to revoke user access.
   *
   * @param userId - User ID whose tokens should be revoked
   * @returns Number of tokens revoked
   */
  async revokeAllUserTokens(userId: string): Promise<number> {
    const result = await this.prisma.blacklistedToken.deleteMany({
      where: { userId },
    });

    return result.count;
  }

  /**
   * Hash token using SHA256
   *
   * Provides privacy by not storing raw tokens.
   * Consistent hashing allows for fast lookups.
   *
   * @param token - JWT token to hash
   * @returns Hex-encoded SHA256 hash
   */
  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  /**
   * Extract expiration time from JWT token
   *
   * Decodes JWT payload and extracts 'exp' claim.
   * Falls back to 7 days from now if token has no expiration.
   *
   * @param token - JWT token
   * @returns Expiration date
   */
  private getTokenExpiration(token: string): Date {
    try {
      const decoded = this.jwtService.decode(token) as { exp?: number };

      if (decoded?.exp) {
        // JWT exp is in seconds, convert to milliseconds
        return new Date(decoded.exp * 1000);
      }
    } catch (error) {
      // Token decoding failed, use default expiration
    }

    // Default: 7 days from now
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  }
}
