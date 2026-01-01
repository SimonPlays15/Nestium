import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import {PrismaService} from "../prisma/prisma.service";

@Module({
  controllers: [ServersController],
  providers: [PrismaService, ServersService]
})
export class ServersModule {}
