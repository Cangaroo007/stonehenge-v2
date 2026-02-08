import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import prisma from './db';
import { UserRole } from '@prisma/client';

if (!process.env.JWT_SECRET) {
  console.warn('WARNING: JWT_SECRET environment variable is not set. Authentication will not work in production.');
}

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-production'
);

const COOKIE_NAME = 'stonehenge-token';

export interface UserPayload {
  id: number;
  email: string;
  name: string | null;
  role: string;
  companyId?: number | null;
  customerId?: number | null;
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function createToken(user: UserPayload): Promise<string> {
  return new SignJWT({ user })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<UserPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return payload.user as UserPayload;
  } catch {
    return null;
  }
}

export async function setAuthCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 7 days
    path: '/',
  });
}

export async function removeAuthCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(COOKIE_NAME);
}

export async function getAuthCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value;
}

export async function getCurrentUser(): Promise<UserPayload | null> {
  const token = await getAuthCookie();
  if (!token) return null;
  return verifyToken(token);
}

export async function login(email: string, password: string): Promise<{ success: boolean; error?: string; role?: string }> {
  const user = await prisma.user.findUnique({
    where: { email },
  });

  if (!user) {
    return { success: false, error: 'Invalid email or password' };
  }

  // Check if user is active
  if (!user.is_active) {
    return { success: false, error: 'Account is deactivated' };
  }

  const valid = await verifyPassword(password, user.password_hash);
  if (!valid) {
    return { success: false, error: 'Invalid email or password' };
  }

  const token = await createToken({
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    companyId: user.company_id,
    customerId: user.customer_id,
  });

  await setAuthCookie(token);

  // Update last login timestamp
  await prisma.user.update({
    where: { id: user.id },
    data: { last_login_at: new Date() },
  });
  
  return { success: true, role: user.role };
}

export async function logout(): Promise<void> {
  await removeAuthCookie();
}

/**
 * Require authentication for API routes - Modern version (no request param)
 * Returns auth result with user or error details
 */
export async function requireAuth(
  allowedRoles?: string[]
): Promise<{ user: UserPayload & { companyId: number; role: UserRole } } | { error: string; status: number }> {
  const token = await getAuthCookie();
  
  if (!token) {
    return { error: 'Unauthorized: No authentication token', status: 401 };
  }
  
  const user = await verifyToken(token);
  
  if (!user) {
    return { error: 'Unauthorized: Invalid token', status: 401 };
  }
  
  // Get full user details including company_id
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      company_id: true,
      customer_id: true,
    },
  });

  if (!fullUser || !fullUser.company_id) {
    return { error: 'User not found or no company assigned', status: 403 };
  }
  
  // Check if user has required role
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(fullUser.role)) {
      return { error: `Unauthorized: Required role: ${allowedRoles.join(' or ')}`, status: 403 };
    }
  }
  
  return {
    user: {
      id: fullUser.id,
      email: fullUser.email,
      name: fullUser.name,
      role: fullUser.role,
      companyId: fullUser.company_id,
      customerId: fullUser.customer_id,
    }
  };
}

/**
 * Legacy requireAuth for backwards compatibility with existing routes
 */
export async function requireAuthLegacy(
  request: Request,
  allowedRoles?: string[]
): Promise<UserPayload> {
  const token = await getAuthCookie();
  
  if (!token) {
    throw new Error('Unauthorized: No authentication token');
  }
  
  const user = await verifyToken(token);
  
  if (!user) {
    throw new Error('Unauthorized: Invalid token');
  }
  
  // Check if user has required role
  if (allowedRoles && allowedRoles.length > 0) {
    if (!allowedRoles.includes(user.role)) {
      throw new Error(`Unauthorized: Required role: ${allowedRoles.join(' or ')}`);
    }
  }
  
  return user;
}
