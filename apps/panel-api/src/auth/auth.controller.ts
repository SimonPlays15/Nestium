import {Body, Controller, Get, HttpCode, HttpStatus, Post, UseGuards,} from '@nestjs/common';
import {AuthService} from './auth.service';
import {LoginDto} from './dto/login.dto';
import {AuthResponseDto, UserResponseDto} from './dto/auth-response.dto';
import {JwtAuthGuard} from './guards/jwt-auth.guard';
import {RolesGuard} from './guards/roles.guard';
import {CurrentUser} from './decorators/current-user.decorator';
import {Roles} from './decorators/roles.decorator';
import {UserRole} from '@prisma/client';

/**
 * Controller handling authentication endpoints
 */
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {
    }

    /**
     * Login endpoint - authenticate user with email and password
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
    @HttpCode(HttpStatus.OK)
    async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
        return this.authService.login(loginDto);
    }

    /**
     * Get current authenticated user
     *
     * Protected by JWT Guard - requires valid Bearer token in Authorization header
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
    async getCurrentUser(@CurrentUser() user: UserResponseDto): Promise<UserResponseDto> {
        return user;
    }

    /**
     * Logout endpoint (optional - since JWT is stateless)
     *
     * In production, you might want to implement token blacklisting.
     * For now, logout is handled client-side by removing the token.
     *
     * @returns Success message
     *
     * @example
     * POST /auth/logout
     */
    @Post('logout')
    @HttpCode(HttpStatus.OK)
    async logout(): Promise<{ message: string }> {
        // Since JWT is stateless, logout is handled client-side by removing the token
        // You can implement token blacklisting here if needed
        // TODO: Implement token blacklisting for production
        return {message: 'Logged out successfully'};
    }

    /**
     * Refresh endpoint - validate token and return updated user data
     *
     * Use this endpoint to refresh user data (including permissions) without re-authentication
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
