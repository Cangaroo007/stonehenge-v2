import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermissionAsync, Permission } from '@/lib/permissions';
import { createAuditLog, getClientIp, getUserAgent } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import prisma from '@/lib/db';
import { UserRole, CustomerUserRole, Prisma } from '@prisma/client';

/**
 * GET /api/admin/users
 * List all users (requires MANAGE_USERS or VIEW_USERS permission)
 * Query params: customerId - filter by customer ID
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const canView = await hasPermissionAsync(currentUser.id, Permission.VIEW_USERS);
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Get query params
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customerId');

    // Build where clause
    const where: Prisma.UserWhereInput = {};
    if (customerId) {
      where.customerId = parseInt(customerId);
    }

    // Get all users with their customer info and permissions
    const users = await prisma.users.findMany({
      where,
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            company: true,
          },
        },
        permissions: {
          select: {
            permission: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });

    // Remove password hashes from response
    const safeUsers = users.map(({ passwordHash, ...user }) => ({
      ...user,
      permissions: user.permissions.map(p => p.permission),
    }));

    return NextResponse.json(safeUsers);
  } catch (error) {
    console.error('Error fetching users:', error);
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/users
 * Create a new user (requires MANAGE_USERS permission)
 */
export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const canManage = await hasPermissionAsync(currentUser.id, Permission.MANAGE_USERS);
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { email, name, password, role, customerId, customerUserRole, permissions, sendInvite } = body;

    // Validate required fields
    if (!email || !role) {
      return NextResponse.json(
        { error: 'Email and role are required' },
        { status: 400 }
      );
    }

    // Validate role
    if (!Object.values(UserRole).includes(role)) {
      return NextResponse.json(
        { error: 'Invalid role' },
        { status: 400 }
      );
    }

    // Customer users must have customerId and customerUserRole
    if (role === UserRole.CUSTOMER) {
      if (!customerId) {
        return NextResponse.json(
          { error: 'Customer users must be linked to a customer' },
          { status: 400 }
        );
      }
      if (!customerUserRole || !Object.values(CustomerUserRole).includes(customerUserRole)) {
        return NextResponse.json(
          { error: 'Customer users must have a valid customer user role' },
          { status: 400 }
        );
      }
    }

    // Check if user already exists
    const existingUser = await prisma.users.findUnique({
      where: { email },
    });

    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 400 }
      );
    }

    // Hash password (or generate temp password if sending invite)
    const tempPassword = sendInvite ? generateTempPassword() : password;
    if (!tempPassword) {
      return NextResponse.json(
        { error: 'Password is required when not sending invite' },
        { status: 400 }
      );
    }

    const passwordHash = await hashPassword(tempPassword);

    // Create user
    const newUser = await prisma.users.create({
      data: {
        email,
        name,
        passwordHash,
        role,
        customerId: customerId || null,
        customerUserRole: role === UserRole.CUSTOMER ? customerUserRole : null,
        isActive: true,
        invitedBy: currentUser.id,
        invitedAt: new Date(),
      },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            company: true,
          },
        },
      },
    });

    // Create custom permissions if role is CUSTOM
    if (role === UserRole.CUSTOM && permissions && Array.isArray(permissions)) {
      await prisma.user_permissions.createMany({
        data: permissions.map((permission: Permission) => ({
          userId: newUser.id,
          permission,
        })),
      });
    }

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      action: 'created',
      entityType: 'user',
      entityId: String(newUser.id),
      changes: { email, name, role, customerId, customerUserRole },
      ipAddress: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    });

    // TODO: Send invitation email if sendInvite is true
    // This would integrate with your email service

    // Remove password hash from response
    const { passwordHash: _, ...safeUser } = newUser;

    return NextResponse.json(safeUser);
  } catch (error) {
    console.error('Error creating user:', error);
    return NextResponse.json(
      { error: 'Failed to create user' },
      { status: 500 }
    );
  }
}

/**
 * Generate a temporary password for invited users
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let password = '';
  for (let i = 0; i < 12; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}
