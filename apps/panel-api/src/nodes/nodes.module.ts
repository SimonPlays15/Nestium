import { Module } from '@nestjs/common';
import { NodesController } from './nodes.controller';
import { NodesService } from './nodes.service';
import { PrismaService } from '../prisma/prisma.service';
import { NodeHealthScheduler } from './schedules/node-health.scheduler';

@Module({
  controllers: [NodesController],
  providers: [NodesService, PrismaService, NodeHealthScheduler],
})
export class NodesModule {}
