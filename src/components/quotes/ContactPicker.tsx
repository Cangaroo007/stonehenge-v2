'use client';

import { useState, useEffect, useRef } from 'react';

interface ContactOption {
  id: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  role: string;
  roleTitle: string | null;
  isPrimary: boolean;
}

const ROLE_LABELS: Record<string, string> = {
  PRIMARY: 'Primary',
  SITE_SUPERVISOR: 'Site Supervisor',
  ACCOUNTS: 'Accounts',
  PROJECT_MANAGER: 'Project Manager',
  OTHER: 'Other',
};

const ROLE_COLOURS: Record<string, string> = {
  PRIMARY: 'bg-blue-100 text-blue-700',
  SITE_SUPERVISOR: 'bg-amber-100 text-amber-700',
  ACCOUNTS: 'bg-green-100 text-green-700',
  PROJECT_MANAGER: 'bg-purple-100 text-purple-700',
  OTHER: 'bg-gray-100 text-gray-600',
};

interface ContactPickerProps {
  customerId: string | number | null;
  selectedContactId: string | number | null;
  onContactChange: (contactId: number | null) => void;
}

export default function ContactPicker({
  customerId,
  selectedContactId,
  onContactChange,
}: ContactPickerProps) {
  // ── ALL hooks at the TOP (Rule 45) ──
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [loading, setLoading] = useState(false);
  const prevCustomerIdRef = useRef<string | number | null>(null);

  useEffect(() => {
    if (!customerId) {
      setContacts([]);
      return;
    }

    const customerChanged = prevCustomerIdRef.current !== null && prevCustomerIdRef.current !== customerId;
    prevCustomerIdRef.current = customerId;

    let cancelled = false;
    setLoading(true);

    async function fetchContacts() {
      try {
        const res = await fetch(`/api/customers/${customerId}/contacts`);
        if (!res.ok) throw new Error('Failed to fetch contacts');
        const data = await res.json();
        if (cancelled) return;
        setContacts(data);

        // Auto-select primary contact when customer is first selected (i.e. customer changed)
        if (customerChanged || !selectedContactId) {
          const primary = data.find((c: ContactOption) => c.isPrimary);
          if (primary) {
            onContactChange(primary.id);
          } else if (customerChanged) {
            onContactChange(null);
          }
        }
      } catch {
        if (!cancelled) setContacts([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchContacts();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  if (!customerId) return null;

  if (loading) {
    return (
      <div>
        <label className="block text-sm text-gray-600 mb-1">Contact</label>
        <div className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-400">
          Loading contacts...
        </div>
      </div>
    );
  }

  if (contacts.length === 0) {
    return (
      <div>
        <label className="block text-sm text-gray-600 mb-1">Contact</label>
        <div className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-400 bg-gray-50">
          No contacts for this customer
        </div>
      </div>
    );
  }

  return (
    <div>
      <label className="block text-sm text-gray-600 mb-1">Contact</label>
      <select
        value={selectedContactId ? String(selectedContactId) : ''}
        onChange={(e) => onContactChange(e.target.value ? parseInt(e.target.value) : null)}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
      >
        <option value="">None</option>
        {contacts.map((c) => (
          <option key={c.id} value={c.id}>
            {c.firstName} {c.lastName}
            {c.roleTitle ? ` — ${c.roleTitle}` : ` — ${ROLE_LABELS[c.role] || c.role}`}
            {c.isPrimary ? ' (Primary)' : ''}
          </option>
        ))}
      </select>
      {selectedContactId && (() => {
        const selected = contacts.find((c) => c.id === Number(selectedContactId));
        if (!selected) return null;
        return (
          <div className="mt-1.5 flex items-center gap-2 text-xs text-gray-500">
            <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${ROLE_COLOURS[selected.role] || ROLE_COLOURS.OTHER}`}>
              {selected.roleTitle || ROLE_LABELS[selected.role] || selected.role}
            </span>
            {selected.email && <span>{selected.email}</span>}
            {selected.phone && <span>{selected.phone}</span>}
          </div>
        );
      })()}
    </div>
  );
}
