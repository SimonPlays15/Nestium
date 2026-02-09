import {Body, Controller, Delete, Get, Param, Post, Query, UseGuards} from '@nestjs/common';
import {ServersService} from './servers.service';
import {JwtAuthGuard} from '../auth/guards/jwt-auth.guard';
import {PermissionsGuard} from '../auth/guards/permissions.guard';
import {RequirePermissions} from '../auth/decorators/permissions.decorator';
import {CurrentUser} from '../auth/decorators/current-user.decorator';
import {Permission} from '@prisma/client';
import {UserResponseDto} from '../auth/dto/auth-response.dto';

/**
 * Controller responsible for managing server operations, including creation, lifecycle management,
 * status retrieval, and WebSocket token management.
 *
 * All endpoints require authentication and appropriate permissions.
 */
@Controller('servers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ServersController {
    constructor(private servers: ServersService) {
    }

    /**
     * Create a new Minecraft server
     *
     * Requires SERVER_CREATE permission
     */
    @Post('minecraft')
    @RequirePermissions(Permission.SERVER_CREATE)
    createMinecraft(
        @CurrentUser() user: UserResponseDto,
        @Body()
        body: {
            nodeId: string;
            name: string;
            hostPort: number;
            memoryMb: number;
            version?: string;
        },
    ) {
        return this.servers.createMinecraftServer({
            ...body,
            ownerId: user.id,
        });
    }

    /**
     * Get server logs
     *
     * Requires SERVER_CONSOLE_READ permission
     */
    @Get(':id/logs')
    @RequirePermissions(Permission.SERVER_CONSOLE_READ)
    logs(@Param('id') id: string, @Query('tail') tail?: string) {
        return this.servers.logs(id, tail ? Number(tail) : 200);
    }

    /**
     * Get server status
     *
     * Requires SERVER_READ permission
     */
    @Get(':id/status')
    @RequirePermissions(Permission.SERVER_READ)
    status(@Param('id') id: string) {
        return this.servers.status(id);
    }

    /**
     * Start a server
     *
     * Requires SERVER_START permission
     */
    @Post(':id/start')
    @RequirePermissions(Permission.SERVER_START)
    start(@Param('id') id: string) {
        return this.servers.start(id);
    }

    /**
     * Stop a server
     *
     * Requires SERVER_STOP permission
     */
    @Post(':id/stop')
    @RequirePermissions(Permission.SERVER_STOP)
    stop(@Param('id') id: string) {
        return this.servers.stop(id);
    }

    /**
     * Restart a server
     *
     * Requires SERVER_RESTART permission
     */
    @Post(':id/restart')
    @RequirePermissions(Permission.SERVER_RESTART)
    restart(@Param('id') id: string) {
        return this.servers.restart(id);
    }

    /**
     * Sync server status from node
     *
     * Requires SERVER_READ permission
     */
    @Post(':id/sync')
    @RequirePermissions(Permission.SERVER_READ)
    sync(@Param('id') id: string) {
        return this.servers.syncStatus(id);
    }

    /**
     * Delete a server
     *
     * Requires SERVER_DELETE permission
     */
    @Delete(':id')
    @RequirePermissions(Permission.SERVER_DELETE)
    delete(@Param('id') id: string) {
        return this.servers.delete(id);
    }

    /**
     * Create WebSocket token for server console access
     *
     * Requires SERVER_CONSOLE_READ permission
     */
    @Post(':id/ws-token')
    @RequirePermissions(Permission.SERVER_CONSOLE_READ)
    async createAsyncToken(@CurrentUser() user: UserResponseDto, @Param('id') serverId: string) {
        await this.servers.assertServerAccess(user.id, serverId);

        return this.servers.createWsToken(user.id, serverId);
    }
}
