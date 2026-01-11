import {Module} from '@nestjs/common';
import {ServersController} from './servers.controller';
import {ServersService} from './servers.service';
import {PrismaService} from "../prisma/prisma.service";
import {ServersLogsGateway} from "./servers.logs.gateway";
import {ServerConsoleGateway} from "./servers.console.gateway";

@Module({
  controllers: [ServersController],
  providers: [PrismaService, ServersService, ServersLogsGateway, ServerConsoleGateway]
})
export class ServersModule {}
