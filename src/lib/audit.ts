/**
 * Audit Logging System for Stone Henge
 * 
 * Tracks all important actions for compliance and debugging
 */

import prisma from './db';
import { Prisma } from '@prisma/client';

export type AuditAction = 
  | 'created'
  | 'updated'
  | 'deleted'
  | 'viewed'
  | 'signed'
  | 'invited'
  | 'activated'
  | 'deactivated'
  | 'exported'
  | 'imported'
  | 'login'
  | 'logout'
  | 'QUOTE_OVERRIDE_APPLIED'
  | 'QUOTE_OVERRIDE_REMOVED'
  | 'PIECE_OVERRIDE_APPLIED'
  | 'PIECE_OVERRIDE_REMOVED';

export type AuditEntityType = 
  | 'quote'
  | 'customer'
  | 'user'
  | 'material'
  | 'pricing_rule'
  | 'optimization'
  | 'system'
  | 'QUOTE'
  | 'QUOTE_PIECE';

interface AuditLogData {
  userId?: number;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string;
  changes?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Create an audit log entry
 */
export async function createAuditLog(data: AuditLogData): Promise<void> {
  try {
    await prisma.audit_logs.create({
      data: {
        user_id: data.userId,
        action: data.action,
        entity_type: data.entityType,
        entity_id: data.entityId,
        changes: data.changes ? (data.changes as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
      },
    });
  } catch (error) {
    // Log to console but don't throw - audit logging shouldn't break the app
    console.error('Failed to create audit log:', error);
  }
}

/**
 * Generic activity logging (flexible interface)
 */
export async function logActivity(data: {
  userId: number;
  action: string;
  entity: string;
  entityId: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<void> {
  try {
    await prisma.audit_logs.create({
      data: {
        user_id: data.userId,
        action: data.action as AuditAction,
        entity_type: data.entity as AuditEntityType,
        entity_id: data.entityId,
        changes: data.details ? (data.details as unknown as Prisma.InputJsonValue) : Prisma.JsonNull,
        ip_address: data.ipAddress,
        user_agent: data.userAgent,
      },
    });
  } catch (error) {
    console.error('Failed to log activity:', error);
  }
}

/**
 * Track quote view
 */
export async function trackQuoteView(
  quoteId: number,
  userId?: number,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    // Create quote view record
    await prisma.quote_views.create({
      data: {
        quote_id: quoteId,
        user_id: userId,
        ip_address: ipAddress,
        user_agent: userAgent,
      },
    });

    // Also create audit log
    await createAuditLog({
      userId,
      action: 'viewed',
      entityType: 'quote',
      entityId: String(quoteId),
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to track quote view:', error);
  }
}

/**
 * Get client IP from request headers
 */
export function getClientIp(headers: Headers): string {
  return (
    headers.get('x-forwarded-for')?.split(',')[0] ||
    headers.get('x-real-ip') ||
    'unknown'
  );
}

/**
 * Get user agent from request headers
 */
export function getUserAgent(headers: Headers): string {
  return headers.get('user-agent') || 'unknown';
}

/**
 * Helper to track changes between old and new values
 */
export function getChanges<T extends Record<string, unknown>>(
  oldData: T,
  newData: Partial<T>
): Record<string, { from: unknown; to: unknown }> {
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (const key in newData) {
    if (newData[key] !== oldData[key]) {
      changes[key] = {
        from: oldData[key],
        to: newData[key],
      };
    }
  }

  return changes;
}

/**
 * Track user login
 */
export async function trackLogin(
  userId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    // Update last login time
    await prisma.user.update({
      where: { id: userId },
      data: {
        last_login_at: new Date(),
        last_active_at: new Date(),
      },
    });

    // Create audit log
    await createAuditLog({
      userId,
      action: 'login',
      entityType: 'user',
      entityId: String(userId),
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to track login:', error);
  }
}

/**
 * Track user logout
 */
export async function trackLogout(
  userId: number,
  ipAddress?: string,
  userAgent?: string
): Promise<void> {
  try {
    await createAuditLog({
      userId,
      action: 'logout',
      entityType: 'user',
      entityId: String(userId),
      ipAddress,
      userAgent,
    });
  } catch (error) {
    console.error('Failed to track logout:', error);
  }
}

/**
 * Get audit log for an entity
 */
export async function getEntityAuditLog(
  entityType: AuditEntityType,
  entityId: string,
  limit = 50
) {
  return prisma.audit_logs.findMany({
    where: {
      entity_type: entityType,
      entity_id: entityId,
    },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
    take: limit,
  });
}

/**
 * Get audit log for a user
 */
export async function getUserAuditLog(userId: number, limit = 50) {
  return prisma.audit_logs.findMany({
    where: {
      user_id: userId,
    },
    orderBy: {
      created_at: 'desc',
    },
    take: limit,
  });
}

/**
 * Get recent audit logs (for admin dashboard)
 */
export async function getRecentAuditLogs(limit = 100) {
  return prisma.audit_logs.findMany({
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
        },
      },
    },
    orderBy: {
      created_at: 'desc',
    },
    take: limit,
  });
}
