import { Module } from '@nestjs/common';
import { ServersController } from './servers.controller';
import { ServersService } from './servers.service';
import { PrismaService } from '../prisma/prisma.service';
import { ServersGateway } from './servers.gateway';

@Module({
  controllers: [ServersController],
  providers: [PrismaService, ServersService, ServersGateway],
})
export class ServersModule {}
