import {Module} from '@nestjs/common';
import {JwtModule} from '@nestjs/jwt';
import {PassportModule} from '@nestjs/passport';
import {AuthService} from './auth.service';
import {AuthController} from './auth.controller';
import {PrismaModule} from '../prisma/prisma.module';
import {JwtStrategy} from './strategies/jwt.strategy';
import {TokenBlacklistService} from './services/token-blacklist.service';
import {TokenCleanupScheduler} from './schedules/token-cleanup.scheduler';
import {StringValue} from "ms";


/**
 * The AuthModule is responsible for handling authentication-related functionality in the application.
 *
 * This module integrates several key components to enable secure user authentication and authorization:
 * - PrismaModule: Used for database interactions.
 * - PassportModule: Configured with a default strategy of 'jwt' for handling JSON Web Tokens.
 * - JwtModule: Provides configuration for token signing and verification, including secret management and token expiration.
 *
 * Components:
 * - AuthService: Provides methods to handle authentication logic, such as validating users and generating tokens.
 * - JwtStrategy: Implements the logic for verifying JWTs and extracting user information.
 * - AuthController: Defines the routes and endpoints for authentication operations, such as login and registration.
 *
 * Exports:
 * - AuthService: Enables other modules to utilize the authentication logic provided by this module.
 */
@Module({
    imports: [
        PrismaModule,
        PassportModule.register({defaultStrategy: 'jwt'}),
        JwtModule.register({
            global: true,
            secret: process.env.JWT_SECRET || 'your-super-secret-key-change-in-production',
            signOptions: {
                expiresIn: (process.env.JWT_EXPIRES_IN as StringValue) || '7d', // Token expires in 7 days
            },
        }),
    ],
    providers: [AuthService, JwtStrategy, TokenBlacklistService, TokenCleanupScheduler],
    controllers: [AuthController],
    exports: [AuthService, TokenBlacklistService], // Export for use in other modules
})
export class AuthModule {
}
