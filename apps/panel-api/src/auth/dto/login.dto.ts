import {IsEmail, IsNotEmpty, IsString, MinLength} from 'class-validator';

/**
 * Data Transfer Object for user login requests
 */
export class LoginDto {
    /**
     * User's email address
     * @example "user@example.com"
     */
    @IsEmail({}, {message: 'Please provide a valid email address'})
    @IsNotEmpty({message: 'Email is required'})
    email!: string;

    /**
     * User's password
     * @example "SecureP@ssw0rd"
     */
    @IsString()
    @IsNotEmpty({message: 'Password is required'})
    @MinLength(6, {message: 'Password must be at least 6 characters long'})
    password!: string;
}
