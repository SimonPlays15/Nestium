import {Body, Controller, Delete, Get, Param, Post, Query, Req,} from '@nestjs/common';
import {ServersService} from './servers.service';

/**
 * Controller responsible for managing server operations, including creation, lifecycle management,
 * status retrieval, and WebSocket token management.
 */
@Controller('servers')
export class ServersController {
    constructor(private servers: ServersService) {
    }

    // MVP: ownerId kommt hart, später Auth
    @Post('minecraft')
    createMinecraft(
        @Body()
        body: {
            ownerId: string;
            nodeId: string;
            name: string;
            hostPort: number;
            memoryMb: number;
            version?: string;
        },
    ) {
        return this.servers.createMinecraftServer(body);
    }

    @Get(':id/logs')
    logs(@Param('id') id: string, @Query('tail') tail?: string) {
        return this.servers.logs(id, tail ? Number(tail) : 200);
    }

    @Get(':id/status')
    status(@Param('id') id: string) {
        return this.servers.status(id);
    }

    @Post(':id/start')
    start(@Param('id') id: string) {
        return this.servers.start(id);
    }

    @Post(':id/stop')
    stop(@Param('id') id: string) {
        return this.servers.stop(id);
    }

    @Post(':id/restart')
    restart(@Param('id') id: string) {
        return this.servers.restart(id);
    }

    @Post(':id/sync')
    sync(@Param('id') id: string) {
        return this.servers.syncStatus(id);
    }

    @Delete(':id')
    delete(@Param('id') id: string) {
        return this.servers.delete(id);
    }

    // WS Tokens
    @Post(':id/ws-token')
    async createAsyncToken(@Req() req: any, @Param('id') serverId: string) {
        const userId = req.user?.id ?? null;
        await this.servers.assertServerAccess(userId, serverId);

        return this.servers.createWsToken(userId, serverId);
    }
}
