import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { hasPermissionAsync, Permission } from '@/lib/permissions';
import { createAuditLog, getClientIp, getUserAgent, getChanges } from '@/lib/audit';
import { hashPassword } from '@/lib/auth';
import prisma from '@/lib/db';
import { UserRole, CustomerUserRole } from '@prisma/client';

/**
 * GET /api/admin/users/[id]
 * Get a specific user (requires VIEW_USERS permission)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const canView = await hasPermissionAsync(currentUser.id, Permission.VIEW_USERS);
    if (!canView) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
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
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Remove password hash from response
    const { passwordHash, ...safeUser } = user;

    return NextResponse.json({
      ...safeUser,
      permissions: user.permissions.map(p => p.permission),
    });
  } catch (error) {
    console.error('Error fetching user:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}

/**
 * PUT /api/admin/users/[id]
 * Update a user (requires MANAGE_USERS permission)
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const canManage = await hasPermissionAsync(currentUser.id, Permission.MANAGE_USERS);
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Get existing user
    const existingUser = await prisma.users.findUnique({
      where: { id: userId },
      include: { permissions: true },
    });

    if (!existingUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Prevent users from editing their own role/status
    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot edit your own user account' },
        { status: 400 }
      );
    }

    const body = await request.json();
    const { name, role, customerId, customerUserRole, isActive, permissions, password } = body;

    // Build update data
    const updateData: Record<string, unknown> = {};
    if (name !== undefined) updateData.name = name;
    if (role !== undefined) {
      if (!Object.values(UserRole).includes(role)) {
        return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
      }
      updateData.role = role;
    }
    if (customerId !== undefined) updateData.customerId = customerId || null;
    if (customerUserRole !== undefined) {
      // Validate customerUserRole if provided
      if (customerUserRole && !Object.values(CustomerUserRole).includes(customerUserRole)) {
        return NextResponse.json({ error: 'Invalid customer user role' }, { status: 400 });
      }
      updateData.customerUserRole = customerUserRole || null;
    }
    if (isActive !== undefined) updateData.isActive = isActive;
    if (password) {
      updateData.passwordHash = await hashPassword(password);
    }

    // Update user
    const updatedUser = await prisma.users.update({
      where: { id: userId },
      data: updateData,
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

    // Update custom permissions if role is CUSTOM
    if (role === UserRole.CUSTOM && permissions && Array.isArray(permissions)) {
      // Delete existing permissions
      await prisma.user_permissions.deleteMany({
        where: { userId },
      });

      // Create new permissions
      if (permissions.length > 0) {
        await prisma.user_permissions.createMany({
          data: permissions.map((permission: Permission) => ({
            userId,
            permission,
          })),
        });
      }
    }

    // Create audit log
    const changes = getChanges(
      {
        name: existingUser.name,
        role: existingUser.role,
        customerId: existingUser.customerId,
        isActive: existingUser.isActive,
      },
      { name, role, customerId, isActive }
    );

    await createAuditLog({
      userId: currentUser.id,
      action: 'updated',
      entityType: 'user',
      entityId: String(userId),
      changes,
      ipAddress: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    });

    // Remove password hash from response
    const { passwordHash: _, ...safeUser } = updatedUser;

    return NextResponse.json(safeUser);
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json(
      { error: 'Failed to update user' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/users/[id]
 * Delete a user (requires MANAGE_USERS permission)
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Check permission
    const canManage = await hasPermissionAsync(currentUser.id, Permission.MANAGE_USERS);
    if (!canManage) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const userId = parseInt(id);
    if (isNaN(userId)) {
      return NextResponse.json({ error: 'Invalid user ID' }, { status: 400 });
    }

    // Prevent users from deleting themselves
    if (userId === currentUser.id) {
      return NextResponse.json(
        { error: 'Cannot delete your own user account' },
        { status: 400 }
      );
    }

    const user = await prisma.users.findUnique({
      where: { id: userId },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Soft delete by setting isActive to false instead of actual deletion
    await prisma.users.update({
      where: { id: userId },
      data: { isActive: false },
    });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      action: 'deactivated',
      entityType: 'user',
      entityId: String(userId),
      changes: { isActive: { from: true, to: false } },
      ipAddress: getClientIp(request.headers),
      userAgent: getUserAgent(request.headers),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting user:', error);
    return NextResponse.json(
      { error: 'Failed to delete user' },
      { status: 500 }
    );
  }
}
