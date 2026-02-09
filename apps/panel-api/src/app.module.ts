import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { NodesModule } from './nodes/nodes.module';
import { ScheduleModule } from "@nestjs/schedule";
import { ServersModule } from './servers/servers.module';
import {PrismaService} from "./prisma/prisma.service";
import { AuthModule } from './auth/auth.module';

/**
 * Main application module with global rate-limiting protection
 *
 * Rate-limiting configuration:
 * - Default: 10 requests per 60 seconds
 * - Can be overridden per controller/route using @Throttle() decorator
 * - Helps prevent brute-force attacks and DDoS
 */
@Module({
  imports: [
    PrismaModule,
    NodesModule,
    ScheduleModule.forRoot(),
    ServersModule,
    AuthModule,
    // Global rate limiting configuration
    ThrottlerModule.forRoot([{
      ttl: 60000, // Time to live: 60 seconds
      limit: 10,  // Max 10 requests per TTL
    }]),
  ],
  controllers: [AppController],
  providers: [
    AppService,
    PrismaService,
    // Enable ThrottlerGuard globally for all routes
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
