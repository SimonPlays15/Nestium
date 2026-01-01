import {Body, Controller, Delete, Get, Param, Post, Query} from "@nestjs/common";
import { ServersService } from "./servers.service";

@Controller("servers")
export class ServersController {
    constructor(private servers: ServersService) {}

    // MVP: ownerId kommt hart, später Auth
    @Post("minecraft")
    createMinecraft(@Body() body: { ownerId: string; nodeId: string; name: string; hostPort: number; memoryMb: number; version?: string }) {
        return this.servers.createMinecraftServer(body);
    }

    @Get(":id/logs")
    logs(@Param("id") id: string, @Query("tail") tail?: string) {
        return this.servers.logs(id, tail ? Number(tail) : 200);
    }

    @Post(":id/start")
    start(@Param("id") id: string) {
        return this.servers.start(id);
    }

    @Post(":id/stop")
    stop(@Param("id") id: string) {
        return this.servers.stop(id);
    }

    @Post(":id/restart")
    restart(@Param("id") id: string) {
        return this.servers.restart(id);
    }

    @Post(":id/sync")
    sync(@Param("id") id: string) {
        return this.servers.syncStatus(id);
    }

    @Delete(":id")
    delete(@Param("id") id: string) {
        return this.servers.delete(id);
    }
}
