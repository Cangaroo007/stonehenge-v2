/**
 * Permission System for Stone Henge
 * 
 * Handles role-based and custom permission checking
 */

import { UserRole, Permission, CustomerUserRole } from '@prisma/client';
import prisma from './db';

// Re-export enums for convenience
export { Permission, UserRole, CustomerUserRole } from '@prisma/client';

// Role to default permissions mapping
export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  ADMIN: [
    Permission.MANAGE_USERS,
    Permission.VIEW_USERS,
    Permission.MANAGE_CUSTOMERS,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_QUOTES,
    Permission.EDIT_QUOTES,
    Permission.DELETE_QUOTES,
    Permission.VIEW_ALL_QUOTES,
    Permission.APPROVE_QUOTES,
    Permission.MANAGE_MATERIALS,
    Permission.VIEW_MATERIALS,
    Permission.MANAGE_PRICING,
    Permission.VIEW_PRICING,
    Permission.RUN_OPTIMIZATION,
    Permission.VIEW_OPTIMIZATION,
    Permission.EXPORT_CUTLISTS,
    Permission.VIEW_REPORTS,
    Permission.EXPORT_DATA,
    Permission.MANAGE_SETTINGS,
    Permission.VIEW_AUDIT_LOGS,
  ],
  
  SALES_MANAGER: [
    Permission.VIEW_USERS,
    Permission.MANAGE_CUSTOMERS,
    Permission.VIEW_CUSTOMERS,
    Permission.CREATE_QUOTES,
    Permission.EDIT_QUOTES,
    Permission.DELETE_QUOTES,
    Permission.VIEW_ALL_QUOTES,
    Permission.APPROVE_QUOTES,
    Permission.VIEW_MATERIALS,
    Permission.VIEW_PRICING,
    Permission.RUN_OPTIMIZATION,
    Permission.VIEW_OPTIMIZATION,
    Permission.EXPORT_CUTLISTS,
    Permission.VIEW_REPORTS,
    Permission.EXPORT_DATA,
  ],
  
  SALES_REP: [
    Permission.VIEW_CUSTOMERS,
    Permission.MANAGE_CUSTOMERS,
    Permission.CREATE_QUOTES,
    Permission.EDIT_QUOTES,
    Permission.VIEW_OWN_QUOTES,
    Permission.VIEW_MATERIALS,
    Permission.VIEW_PRICING,
    Permission.VIEW_OPTIMIZATION,
  ],
  
  FABRICATOR: [
    Permission.VIEW_CUSTOMERS,
    Permission.VIEW_ALL_QUOTES,
    Permission.VIEW_MATERIALS,
    Permission.VIEW_PRICING,
    Permission.RUN_OPTIMIZATION,
    Permission.VIEW_OPTIMIZATION,
    Permission.EXPORT_CUTLISTS,
  ],
  
  READ_ONLY: [
    Permission.VIEW_CUSTOMERS,
    Permission.VIEW_ALL_QUOTES,
    Permission.VIEW_MATERIALS,
    Permission.VIEW_PRICING,
    Permission.VIEW_OPTIMIZATION,
  ],
  
  CUSTOM: [], // Custom role uses UserPermission table
  
  CUSTOMER: [
    // Base permissions - actual permissions determined by CustomerUserRole
    Permission.VIEW_OWN_QUOTES,
  ],
};

/**
 * Customer User Role Permissions
 * Defines what each customer portal role can do
 */
export const CUSTOMER_USER_ROLE_PERMISSIONS: Record<CustomerUserRole, Permission[]> = {
  CUSTOMER_ADMIN: [
    Permission.VIEW_OWN_QUOTES,
    Permission.APPROVE_QUOTES,
    Permission.UPLOAD_FILES,
    Permission.DOWNLOAD_QUOTES,
    Permission.VIEW_PROJECT_UPDATES,
    Permission.MANAGE_CUSTOMER_USERS,
  ],
  CUSTOMER_APPROVER: [
    Permission.VIEW_OWN_QUOTES,
    Permission.APPROVE_QUOTES,
    Permission.DOWNLOAD_QUOTES,
    Permission.VIEW_PROJECT_UPDATES,
  ],
  CUSTOMER_VIEWER: [
    Permission.VIEW_OWN_QUOTES,
    Permission.DOWNLOAD_QUOTES,
    Permission.VIEW_PROJECT_UPDATES,
  ],
  CUSTOM: [], // Uses UserPermission table
};

/**
 * Check if user has a specific permission (synchronous version for loaded user data)
 */
export function hasPermission(
  user: { role: UserRole; permissions?: { permission: Permission }[] },
  permission: Permission
): boolean {
  // CUSTOM role uses database permissions
  if (user.role === UserRole.CUSTOM) {
    return user.permissions?.some(p => p.permission === permission) ?? false;
  }

  // Predefined staff roles use ROLE_PERMISSIONS mapping
  const rolePermissions = ROLE_PERMISSIONS[user.role];
  return rolePermissions.includes(permission);
}

/**
 * Check if user has a specific permission (async version that loads user data)
 */
export async function hasPermissionAsync(
  userId: number,
  permission: Permission
): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: {
      permissions: true,
    },
  });

  if (!user || !user.isActive) {
    return false;
  }

  return hasPermission(user, permission);
}

/**
 * Check if user has any of the specified permissions
 */
export async function hasAnyPermission(
  userId: number,
  permissions: Permission[]
): Promise<boolean> {
  for (const permission of permissions) {
    if (await hasPermissionAsync(userId, permission)) {
      return true;
    }
  }
  return false;
}

/**
 * Check if user has all of the specified permissions
 */
export async function hasAllPermissions(
  userId: number,
  permissions: Permission[]
): Promise<boolean> {
  for (const permission of permissions) {
    if (!(await hasPermissionAsync(userId, permission))) {
      return false;
    }
  }
  return true;
}

/**
 * Get all permissions for a user
 */
export async function getUserPermissions(userId: number): Promise<Permission[]> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
    include: {
      permissions: true,
    },
  });

  if (!user || !user.isActive) {
    return [];
  }

  // CUSTOM role uses database permissions
  if (user.role === UserRole.CUSTOM) {
    return user.permissions.map(p => p.permission);
  }

  // Predefined roles use ROLE_PERMISSIONS mapping
  return ROLE_PERMISSIONS[user.role];
}

/**
 * Check if user can access a specific quote
 * - Admins and Sales Managers can access all quotes
 * - Sales Reps can only access their own quotes
 * - Customers can only access quotes for their linked customer
 */
export async function canAccessQuote(
  userId: number,
  quoteId: number
): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    return false;
  }

  // Customer users can only access their own customer's quotes
  if (user.role === UserRole.CUSTOMER && user.customerId) {
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
    });
    return quote?.customerId === user.customerId;
  }

  // Check if user has VIEW_ALL_QUOTES permission
  if (await hasPermissionAsync(userId, Permission.VIEW_ALL_QUOTES)) {
    return true;
  }

  // Check if user has VIEW_OWN_QUOTES and created this quote
  if (await hasPermissionAsync(userId, Permission.VIEW_OWN_QUOTES)) {
    const quote = await prisma.quotes.findUnique({
      where: { id: quoteId },
    });
    return quote?.created_by === userId;
  }

  return false;
}

/**
 * Check if user can access a specific customer
 * - Admins and Sales Managers can access all customers
 * - Customers can only access their own customer record
 */
export async function canAccessCustomer(
  userId: number,
  customerId: number
): Promise<boolean> {
  const user = await prisma.users.findUnique({
    where: { id: userId },
  });

  if (!user || !user.isActive) {
    return false;
  }

  // Customer users can only access their own customer
  if (user.role === UserRole.CUSTOMER) {
    return user.customerId === customerId;
  }

  // Check general customer permissions
  return await hasAnyPermission(userId, [
    Permission.MANAGE_CUSTOMERS,
    Permission.VIEW_CUSTOMERS,
  ]);
}

/**
 * Filter quotes query based on user permissions
 */
export function getQuoteAccessFilter(userId: number, userRole: UserRole, customerId?: number | null) {
  // Customer users: only their customer's quotes
  if (userRole === UserRole.CUSTOMER && customerId) {
    return { customerId };
  }

  // Sales reps with VIEW_OWN_QUOTES only: their own quotes
  const rolePermissions = ROLE_PERMISSIONS[userRole];
  if (
    rolePermissions.includes(Permission.VIEW_OWN_QUOTES) &&
    !rolePermissions.includes(Permission.VIEW_ALL_QUOTES)
  ) {
    return { createdBy: userId };
  }

  // Everyone else: no filter (all quotes)
  return {};
}

/**
 * Get user-friendly permission labels
 */
export const PERMISSION_LABELS: Record<Permission, string> = {
  [Permission.MANAGE_USERS]: 'Manage Users',
  [Permission.VIEW_USERS]: 'View Users',
  [Permission.MANAGE_CUSTOMERS]: 'Manage Customers',
  [Permission.VIEW_CUSTOMERS]: 'View Customers',
  [Permission.CREATE_QUOTES]: 'Create Quotes',
  [Permission.EDIT_QUOTES]: 'Edit Quotes',
  [Permission.DELETE_QUOTES]: 'Delete Quotes',
  [Permission.VIEW_ALL_QUOTES]: 'View All Quotes',
  [Permission.VIEW_OWN_QUOTES]: 'View Own Quotes',
  [Permission.APPROVE_QUOTES]: 'Approve/Sign Quotes',
  [Permission.MANAGE_MATERIALS]: 'Manage Materials',
  [Permission.VIEW_MATERIALS]: 'View Materials',
  [Permission.MANAGE_PRICING]: 'Manage Pricing',
  [Permission.VIEW_PRICING]: 'View Pricing',
  [Permission.RUN_OPTIMIZATION]: 'Run Slab Optimization',
  [Permission.VIEW_OPTIMIZATION]: 'View Optimizations',
  [Permission.EXPORT_CUTLISTS]: 'Export Cut Lists',
  [Permission.VIEW_REPORTS]: 'View Reports',
  [Permission.EXPORT_DATA]: 'Export Data',
  [Permission.MANAGE_SETTINGS]: 'Manage Settings',
  [Permission.VIEW_AUDIT_LOGS]: 'View Audit Logs',
  
  // Customer portal permissions
  [Permission.UPLOAD_FILES]: 'Upload Files & Drawings',
  [Permission.MANAGE_CUSTOMER_USERS]: 'Manage Portal Users',
  [Permission.DOWNLOAD_QUOTES]: 'Download Quotes',
  [Permission.VIEW_PROJECT_UPDATES]: 'View Project Updates',
};

/**
 * Get user-friendly role labels
 */
export const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Administrator',
  [UserRole.SALES_MANAGER]: 'Sales Manager',
  [UserRole.SALES_REP]: 'Sales Representative',
  [UserRole.FABRICATOR]: 'Fabricator',
  [UserRole.READ_ONLY]: 'Read Only',
  [UserRole.CUSTOM]: 'Custom',
  [UserRole.CUSTOMER]: 'Customer',
};

/**
 * Get user-friendly customer user role labels
 */
export const CUSTOMER_USER_ROLE_LABELS: Record<CustomerUserRole, string> = {
  [CustomerUserRole.CUSTOMER_ADMIN]: 'Customer Admin',
  [CustomerUserRole.CUSTOMER_APPROVER]: 'Approver',
  [CustomerUserRole.CUSTOMER_VIEWER]: 'Viewer (Read-Only)',
  [CustomerUserRole.CUSTOM]: 'Custom Permissions',
};
