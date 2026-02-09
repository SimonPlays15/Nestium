import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { NodesModule } from './nodes/nodes.module';
import { ScheduleModule } from "@nestjs/schedule";
import { ServersModule } from './servers/servers.module';
import {PrismaService} from "./prisma/prisma.service";
import { AuthModule } from './auth/auth.module';

@Module({
  imports: [PrismaModule, NodesModule, ScheduleModule.forRoot(), ServersModule, AuthModule],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
