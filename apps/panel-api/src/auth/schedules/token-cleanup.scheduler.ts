import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TokenBlacklistService } from '../services/token-blacklist.service';

/**
 * Scheduler for automatic cleanup of expired blacklisted tokens
 *
 * Runs daily at 3:00 AM to remove tokens that have passed their expiration time.
 * Keeps the database clean and prevents unbounded growth of the blacklist table.
 */
@Injectable()
export class TokenCleanupScheduler {
  constructor(private readonly blacklistService: TokenBlacklistService) {}

  /**
   * Cleanup expired blacklisted tokens
   *
   * Scheduled to run every day at 3:00 AM.
   * Removes tokens that have expired, keeping only active blacklisted tokens.
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async handleCleanup() {
    try {
      const deletedCount = await this.blacklistService.cleanupExpired();
      console.log(`[TokenCleanup] Removed ${deletedCount} expired blacklisted tokens`);
    } catch (error) {
      console.error('[TokenCleanup] Failed to cleanup expired tokens:', error);
    }
  }
}
