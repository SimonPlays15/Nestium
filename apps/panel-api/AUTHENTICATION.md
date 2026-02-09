# Authentication Setup for Nestium Panel API

## 📦 Required Dependencies

Install the following packages to get authentication working:

```bash
cd apps/panel-api
npm install bcrypt @nestjs/jwt @nestjs/passport passport passport-jwt
npm install -D @types/bcrypt @types/passport-jwt
```

## 🔐 Environment Variables

Add these variables to your `.env` file in `apps/panel-api/`:

```env
# JWT Configuration
JWT_SECRET=your-super-secret-key-change-in-production-to-something-very-secure
JWT_EXPIRES_IN=7d

# Database (should already exist)
DATABASE_URL=postgresql://user:password@localhost:5432/nestium
```

**⚠️ Important:** Change `JWT_SECRET` to a strong, random string in production!

## 🚀 API Endpoints

### 1. Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "yourpassword"
}
```

**Response (200 OK):**
```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "123e4567-e89b-12d3-a456-426614174000",
    "email": "user@example.com",
    "role": "USER",
    "createdAt": "2024-01-01T00:00:00.000Z"
  }
}
```

**Error (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Invalid email or password"
}
```

### 2. Get Current User
```http
GET /auth/me
Authorization: Bearer <your-jwt-token>
```

**Response (200 OK):**
```json
{
  "id": "123e4567-e89b-12d3-a456-426614174000",
  "email": "user@example.com",
  "role": "USER",
  "createdAt": "2024-01-01T00:00:00.000Z"
}
```

### 3. Logout
```http
POST /auth/logout
```

**Response (200 OK):**
```json
{
  "message": "Logged out successfully"
}
```

## 🧪 Testing with cURL

### Login
```bash
curl -X POST http://localhost:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@example.com",
    "password": "admin123"
  }'
```

### Get Current User
```bash
curl -X GET http://localhost:3000/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN_HERE"
```

## 📝 Creating a Test User

You need to create a user with a hashed password. Here's a simple script:

### Option 1: Using Prisma Studio
```bash
cd apps/panel-api
npx prisma studio
```
Then manually create a user in the UI (you'll need to hash the password first).

### Option 2: Using a Seed Script
Create `apps/panel-api/prisma/seed.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const hashedPassword = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      passwordHash: hashedPassword,
      role: 'ADMIN',
    },
  });

  console.log('Created admin user:', admin);

  const user = await prisma.user.upsert({
    where: { email: 'user@example.com' },
    update: {},
    create: {
      email: 'user@example.com',
      passwordHash: await bcrypt.hash('user123', 10),
      role: 'USER',
    },
  });

  console.log('Created regular user:', user);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

Add to `package.json`:
```json
{
  "prisma": {
    "seed": "ts-node prisma/seed.ts"
  }
}
```

Run seed:
```bash
npx prisma db seed
```

## 🔒 Security Features

✅ **Implemented:**
- Password hashing with bcrypt (10 salt rounds)
- JWT token-based authentication
- Password validation (min 6 characters)
- Email format validation
- User data sanitization (password never returned)
- Token expiration (7 days default)

🚧 **TODO for Production:**
- [ ] JWT Guard for protected routes
- [ ] Rate limiting for login endpoint
- [ ] Token refresh mechanism
- [ ] Token blacklisting for logout
- [ ] Password reset functionality
- [ ] Email verification
- [ ] Two-factor authentication (2FA)
- [ ] Session management
- [ ] CORS configuration
- [ ] HTTPS enforcement

## 🏗️ Architecture

```
auth/
├── dto/
│   ├── login.dto.ts              # Login request validation
│   └── auth-response.dto.ts      # Response structure
├── auth.service.ts               # Business logic
├── auth.controller.ts            # HTTP endpoints
└── auth.module.ts                # Module configuration
```

## 🔗 Integration with Frontend

Update your frontend `useAuth.ts` composable:

```typescript
async function login(email: string, password: string): Promise<void> {
  const response = await fetch('http://localhost:3000/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });

  if (!response.ok) {
    throw new Error('Login failed');
  }

  const data = await response.json();

  // Store token
  localStorage.setItem('accessToken', data.accessToken);

  // Set user state
  currentUser.value = data.user;
}
```

## 📚 Next Steps

1. Install dependencies: `npm install bcrypt @nestjs/jwt @nestjs/passport passport passport-jwt`
2. Add environment variables to `.env`
3. Create test users with seed script
4. Test login endpoint
5. Integrate with frontend
6. Implement JWT Guards for protected routes

## 🐛 Common Issues

### "Cannot find module 'bcrypt'"
```bash
npm install bcrypt @types/bcrypt
```

### "JWT_SECRET is undefined"
Make sure `.env` file exists and contains `JWT_SECRET=...`

### "Invalid email or password" but credentials are correct
Check if password is properly hashed in database using bcrypt with 10 rounds.

### Database connection issues
Verify `DATABASE_URL` in `.env` and run `npx prisma db push` to sync schema.
