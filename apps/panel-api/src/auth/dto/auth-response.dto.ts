import {Permission, UserRole} from '@prisma/client';

/**
 * User data returned in authentication responses (without sensitive data)
 */
export class UserResponseDto {
    /**
     * User's unique identifier
     */
    id!: string;

    /**
     * User's email address
     */
    email!: string;

    /**
     * User's role (ADMIN or USER)
     */
    role!: UserRole;

    /**
     * User's permissions
     */
    permissions!: Permission[];

    /**
     * Timestamp when the user was created
     */
    createdAt!: Date;
}

/**
 * Response data for successful authentication
 */
export class AuthResponseDto {
    /**
     * JWT access token
     */
    accessToken!: string;

    /**
     * User information (without password)
     */
    user!: UserResponseDto;
}
