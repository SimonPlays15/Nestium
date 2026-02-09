import {BadRequestException, Body, Controller, Get, Headers, HttpCode, HttpStatus, Post, UseGuards,} from '@nestjs/common';
import {SkipThrottle, Throttle} from '@nestjs/throttler';
import {AuthService} from './auth.service';
import {LoginDto} from './dto/login.dto';
import {AuthResponseDto, UserResponseDto} from './dto/auth-response.dto';
import {JwtAuthGuard} from './guards/jwt-auth.guard';
import {RolesGuard} from './guards/roles.guard';
import {CurrentUser} from './decorators/current-user.decorator';
import {Roles} from './decorators/roles.decorator';
import {UserRole} from '@prisma/client';

/**
 * Controller handling authentication endpoints with rate-limiting
 *
 * Rate limits:
 * - Login: 5 requests per 60 seconds (strict - brute-force prevention)
 * - Refresh: 10 requests per 60 seconds (moderate)
 * - Me: 20 requests per 60 seconds (lenient - frequently used)
 * - Logout: No limit (safe operation)
 */
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {
    }

    /**
     * Login endpoint - authenticate user with email and password
     *
     * Rate-limited to 5 requests per 60 seconds to prevent brute-force attacks
     *
     * @param loginDto - Login credentials
     * @returns JWT token and user data
     *
     * @example
     * POST /auth/login
     * {
     *   "email": "user@example.com",
     *   "password": "password123"
     * }
     */
    @Post('login')
    @Throttle({default: {limit: 5, ttl: 60000}})
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }

    /**
     * Get current authenticated user
     *
     * Protected by JWT Guard - requires valid Bearer token in Authorization header
     * Rate-limited to 20 requests per 60 seconds (lenient - frequently used)
     *
     * @param user - Current authenticated user (extracted from JWT token)
     * @returns Current user data
     *
     * @example
     * GET /auth/me
     * Headers: { Authorization: "Bearer <your-jwt-token>" }
     */
    @Get('me')
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 20, ttl: 60000}})
    async getCurrentUser(@CurrentUser() user: UserResponseDto): Promise<UserResponseDto> {
        return user;
    }

    /**
     * Logout endpoint with token blacklisting
     *
     * Requires authentication. Blacklists the current JWT token,
     * preventing it from being used for future requests.
     * No rate-limiting applied as logout is a safe operation.
     *
     * @param user - Current authenticated user
     * @param authorization - Authorization header containing Bearer token
     * @returns Success message
     *
     * @example
     * POST /auth/logout
     * Headers: { Authorization: "Bearer <your-jwt-token>" }
     */
    @Post('logout')
    @UseGuards(JwtAuthGuard)
    @SkipThrottle()
    @HttpCode(HttpStatus.OK)
    async logout(
        @CurrentUser() user: UserResponseDto,
        @Headers('authorization') authorization?: string
    ): Promise<{ message: string }> {
        const token = authorization?.replace('Bearer ', '');

        if (!token) {
            throw new BadRequestException('No token provided');
        }

        // Blacklist the token
        await this.authService.logout(token, user.id);

        return {message: 'Logged out successfully'};
    }

    /**
     * Refresh endpoint - validate token and return updated user data
     *
     * Use this endpoint to refresh user data (including permissions) without re-authentication
     * Rate-limited to 10 requests per 60 seconds (moderate)
     *
     * @param user - Current authenticated user (from JWT token)
     * @returns Updated user data with current permissions
     *
     * @example
     * POST /auth/refresh
     * Headers: { Authorization: "Bearer <your-jwt-token>" }
     */
    @Post('refresh')
    @UseGuards(JwtAuthGuard)
    @Throttle({default: {limit: 10, ttl: 60000}})
    @HttpCode(HttpStatus.OK)
    async refresh(@CurrentUser() user: UserResponseDto): Promise<UserResponseDto> {
        // The token is already validated by JwtAuthGuard
        // We just need to fetch fresh user data with current permissions
        return this.authService.getUserById(user.id);
    }

    /**
     * Example admin-only endpoint
     *
     * Protected by both JWT Guard and Roles Guard
     * Only users with ADMIN role can access this endpoint
     *
     * @param user - Current authenticated admin user
     * @returns Admin dashboard data
     *
     * @example
     * GET /auth/admin-test
     * Headers: { Authorization: "Bearer <admin-jwt-token>" }
     */
    @Get('admin-test')
    @UseGuards(JwtAuthGuard, RolesGuard)
    @Roles(UserRole.ADMIN)
    async adminOnly(@CurrentUser() user: UserResponseDto): Promise<{ message: string; user: UserResponseDto }> {
        return {
            message: 'Welcome to the admin area!',
            user,
        };
    }
}
