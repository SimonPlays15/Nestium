import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NodesService } from '../nodes.service';

/**
 * A service responsible for scheduling regular health checks for nodes.
 * This class uses a cron job to periodically ping all nodes and ensure their health status.
 *
 * The cron job is configured to run every 10 seconds.
 *
 * Dependencies:
 * - Requires `NodesService` to perform the health check operations on the nodes.
 */
@Injectable()
export class NodeHealthScheduler {
  constructor(private nodes: NodesService) {}

  /**
   * Executes a scheduled task every 10 seconds to ping all nodes.
   * The method is triggered automatically based on the defined cron expression.
   *
   * @return {Promise<void>} A promise that resolves when all nodes have been pinged.
   */
  @Cron('*/10 * * * * *')
  async tick(): Promise<void> {
    await this.nodes.pingAllNodes();
  }
}
