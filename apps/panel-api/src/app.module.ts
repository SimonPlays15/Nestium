import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { NodesModule } from './nodes/nodes.module';

@Module({
  imports: [PrismaModule, NodesModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
