import {Injectable, UnauthorizedException,} from '@nestjs/common';
import {JwtService} from '@nestjs/jwt';
import {PrismaService} from '../prisma/prisma.service';
import {LoginDto} from './dto/login.dto';
import {AuthResponseDto, UserResponseDto} from './dto/auth-response.dto';
import {TokenBlacklistService} from './services/token-blacklist.service';
import * as bcrypt from 'bcrypt';
import {User} from '@prisma/client';

/**
 * Service handling authentication logic including login, registration, and token management
 */
@Injectable()
export class AuthService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
        private readonly blacklistService: TokenBlacklistService,
    ) {
    }

    /**
     * Authenticate a user with email and password
     *
     * @param loginDto - Login credentials (email and password)
     * @returns Authentication response with JWT token and user data
     * @throws UnauthorizedException if credentials are invalid
     */
    async login(loginDto: LoginDto): Promise<AuthResponseDto> {
        const {email, password} = loginDto;

        // Find user by email
        const user = await this.prisma.user.findUnique({
            where: {email},
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Verify password
        const isPasswordValid = await this.comparePassword(
            password,
            user.passwordHash,
        );

        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        // Generate JWT token
        const accessToken = await this.generateToken(user);

        // Return response without sensitive data
        return {
            accessToken,
            user: this.sanitizeUser(user),
        };
    }

    /**
     * Validate user credentials
     *
     * @param email - User's email
     * @param password - User's password
     * @returns User object if valid, null otherwise
     */
    async validateUser(email: string, password: string): Promise<User | null> {
        const user = await this.prisma.user.findUnique({
            where: {email},
        });

        if (!user) {
            return null;
        }

        const isPasswordValid = await this.comparePassword(
            password,
            user.passwordHash,
        );

        if (!isPasswordValid) {
            return null;
        }

        return user;
    }

    /**
     * Find a user by their ID
     *
     * @param userId - User's unique identifier
     * @returns User object without password
     * @throws UnauthorizedException if user not found
     */
    async getUserById(userId: string): Promise<UserResponseDto> {
        const user = await this.prisma.user.findUnique({
            where: {id: userId},
        });

        if (!user) {
            throw new UnauthorizedException('User not found');
        }

        return this.sanitizeUser(user);
    }

    /**
     * Hash a plain text password using bcrypt
     *
     * @param password - Plain text password
     * @returns Bcrypt hashed password
     */
    async hashPassword(password: string): Promise<string> {
        const saltRounds = 10;
        return bcrypt.hash(password, saltRounds);
    }

    /**
     * Verify JWT token and return user data
     *
     * @param token - JWT token string
     * @returns User data from token payload
     * @throws UnauthorizedException if token is invalid
     */
    async verifyToken(token: string): Promise<UserResponseDto> {
        try {
            const payload = this.jwtService.verify(token);
            return this.getUserById(payload.sub);
        } catch (error) {
            throw new UnauthorizedException('Invalid or expired token');
        }
    }

    /**
     * Generate a JWT access token for a user
     *
     * @param user - User object
     * @returns JWT token string
     */
    private async generateToken(user: User): Promise<string> {
        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role,
        };

        return this.jwtService.sign(payload);
    }

    /**
     * Compare plain text password with hashed password
     *
     * @param plainPassword - Plain text password
     * @param hashedPassword - Bcrypt hashed password
     * @returns True if passwords match
     */
    private async comparePassword(
        plainPassword: string,
        hashedPassword: string,
    ): Promise<boolean> {
        return bcrypt.compare(plainPassword, hashedPassword);
    }

    /**
     * Remove sensitive data from user object
     *
     * @param user - User object from database
     * @returns Sanitized user data without password
     */
    private sanitizeUser(user: User): UserResponseDto {
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            permissions: user.permissions,
            createdAt: user.createdAt,
        };
    }

    /**
     * Logout user by blacklisting their JWT token
     *
     * Adds the token to the blacklist, preventing future use.
     * The token will remain blacklisted until its natural expiration.
     *
     * @param token - JWT token to blacklist
     * @param userId - User ID who owns the token
     */
    async logout(token: string, userId: string): Promise<void> {
        await this.blacklistService.addToBlacklist(token, userId);
    }
}
