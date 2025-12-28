import { Module } from '@nestjs/common';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import {PrismaService} from "../prisma/prisma.service";

@Module({
  controllers: [NodesController],
  providers: [NodesService, PrismaService],
})
export class NodesModule {}
