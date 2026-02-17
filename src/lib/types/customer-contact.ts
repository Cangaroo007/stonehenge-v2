import type { ContactRole } from '@prisma/client';

export interface CustomerContactData {
  id: number;
  customerId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: ContactRole;
  roleTitle: string | null;
  isPrimary: boolean;
  notes: string | null;
  hasPortalAccess: boolean;
  portalUserId: number | null;
}

export interface CreateCustomerContactInput {
  customerId: number;
  firstName: string;
  lastName: string;
  email?: string;
  phone?: string;
  mobile?: string;
  role?: ContactRole;
  roleTitle?: string;
  isPrimary?: boolean;
  notes?: string;
  hasPortalAccess?: boolean;
}

export interface UpdateCustomerContactInput {
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  mobile?: string | null;
  role?: ContactRole;
  roleTitle?: string | null;
  isPrimary?: boolean;
  notes?: string | null;
  hasPortalAccess?: boolean;
}

export const CONTACT_ROLE_DISPLAY: Record<ContactRole, {
  label: string;
  colour: string;
}> = {
  PRIMARY: { label: 'Primary', colour: '#3B82F6' },
  SITE_SUPERVISOR: { label: 'Site Supervisor', colour: '#F59E0B' },
  ACCOUNTS: { label: 'Accounts', colour: '#10B981' },
  PROJECT_MANAGER: { label: 'Project Manager', colour: '#8B5CF6' },
  OTHER: { label: 'Other', colour: '#6B7280' },
};

export const AU_STATES = [
  'QLD', 'NSW', 'VIC', 'SA', 'WA', 'TAS', 'NT', 'ACT',
] as const;
export type AustralianState = typeof AU_STATES[number];
