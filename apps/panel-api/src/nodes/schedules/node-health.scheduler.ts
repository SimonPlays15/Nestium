import { Injectable } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { NodesService } from "../nodes.service";

@Injectable()
export class NodeHealthScheduler {
    constructor(private nodes: NodesService) {}

    @Cron("*/10 * * * * *") // alle 10 Sekunden
    async tick() {
        await this.nodes.pingAllNodes();
    }
}
