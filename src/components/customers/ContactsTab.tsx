'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { ContactRole } from '@prisma/client';
import {
  CustomerContactData,
  CONTACT_ROLE_DISPLAY,
} from '@/lib/types/customer-contact';

interface ContactsTabProps {
  customerId: number;
  customerName: string;
}

interface ContactFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  role: ContactRole;
  roleTitle: string;
  notes: string;
  isPrimary: boolean;
  hasPortalAccess: boolean;
}

const EMPTY_FORM: ContactFormData = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  mobile: '',
  role: ContactRole.OTHER,
  roleTitle: '',
  notes: '',
  isPrimary: false,
  hasPortalAccess: false,
};

export default function ContactsTab({ customerId, customerName }: ContactsTabProps) {
  const [contacts, setContacts] = useState<CustomerContactData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingContactId, setEditingContactId] = useState<number | null>(null);
  const [formData, setFormData] = useState<ContactFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, [customerId]);

  const fetchContacts = async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}/contacts`);
      if (!res.ok) throw new Error('Failed to fetch contacts');
      const data = await res.json();
      setContacts(data);
    } catch (error) {
      toast.error('Failed to load contacts');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingContactId(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const handleEdit = (contact: CustomerContactData) => {
    setEditingContactId(contact.id);
    setFormData({
      firstName: contact.firstName,
      lastName: contact.lastName,
      email: contact.email || '',
      phone: contact.phone || '',
      mobile: contact.mobile || '',
      role: contact.role,
      roleTitle: contact.roleTitle || '',
      notes: contact.notes || '',
      isPrimary: contact.isPrimary,
      hasPortalAccess: contact.hasPortalAccess,
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingContactId(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const isEdit = editingContactId !== null;
      const url = isEdit
        ? `/api/customers/${customerId}/contacts/${editingContactId}`
        : `/api/customers/${customerId}/contacts`;
      const method = isEdit ? 'PATCH' : 'POST';

      const payload: Record<string, unknown> = {
        firstName: formData.firstName,
        lastName: formData.lastName,
        email: formData.email || undefined,
        phone: formData.phone || undefined,
        mobile: formData.mobile || undefined,
        role: formData.role,
        roleTitle: formData.roleTitle || undefined,
        notes: formData.notes || undefined,
        isPrimary: formData.isPrimary,
        hasPortalAccess: formData.hasPortalAccess,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save contact');
      }

      toast.success(`Contact ${isEdit ? 'updated' : 'created'} successfully`);
      handleCancel();
      fetchContacts();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact: CustomerContactData) => {
    const name = `${contact.firstName} ${contact.lastName}`;
    const portalWarning = contact.hasPortalAccess
      ? '\nPortal access will be revoked.'
      : '';

    if (!confirm(`Delete ${name}?${portalWarning}`)) return;

    try {
      const res = await fetch(
        `/api/customers/${customerId}/contacts/${contact.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete contact');
      toast.success('Contact deleted');
      fetchContacts();
    } catch (error) {
      toast.error('Failed to delete contact');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">
          Manage contacts for {customerName}. Contacts can be assigned roles and granted portal access.
        </p>
        <button onClick={handleAddNew} className="btn-primary">
          + Add Contact
        </button>
      </div>

      {/* Inline Accordion Form */}
      {showForm && (
        <div className="card border-2 border-primary-200">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingContactId !== null ? 'Edit Contact' : 'Add Contact'}
            </h3>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">First Name *</label>
                <input
                  type="text"
                  required
                  value={formData.firstName}
                  onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                  className="input"
                  placeholder="First name"
                />
              </div>
              <div>
                <label className="label">Last Name *</label>
                <input
                  type="text"
                  required
                  value={formData.lastName}
                  onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                  className="input"
                  placeholder="Last name"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="input"
                  placeholder="(07) 1234 5678"
                />
              </div>
              <div>
                <label className="label">Mobile</label>
                <input
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                  className="input"
                  placeholder="0412 345 678"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Role *</label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value as ContactRole })}
                  className="input"
                >
                  {Object.entries(CONTACT_ROLE_DISPLAY).map(([key, { label }]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Role Title</label>
                <input
                  type="text"
                  value={formData.roleTitle}
                  onChange={(e) => setFormData({ ...formData, roleTitle: e.target.value })}
                  className="input"
                  placeholder="e.g. Senior PM, Kitchen Manager"
                />
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="input"
                rows={2}
                placeholder="Optional notes about this contact"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isPrimary}
                  onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Primary Contact</span>
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.hasPortalAccess}
                  onChange={(e) => setFormData({ ...formData, hasPortalAccess: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Portal Access</span>
              </label>
            </div>

            {formData.hasPortalAccess && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-900 font-medium">Portal Access</p>
                <p className="text-sm text-blue-800 mt-1">
                  Enabling portal access will create a portal user account for this contact.
                  Credentials will be generated automatically.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Saving...
                  </span>
                ) : editingContactId !== null ? (
                  'Update Contact'
                ) : (
                  'Save Contact'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Contacts Table */}
      {contacts.length === 0 && !showForm ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No contacts yet. Add a contact to get started.</p>
          <button onClick={handleAddNew} className="btn-primary">
            Add First Contact
          </button>
        </div>
      ) : contacts.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Name</th>
                <th className="table-header">Email</th>
                <th className="table-header">Phone</th>
                <th className="table-header">Role</th>
                <th className="table-header">Portal</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contacts.map((contact) => {
                const roleDisplay = CONTACT_ROLE_DISPLAY[contact.role];
                return (
                  <tr key={contact.id} className="hover:bg-gray-50">
                    <td className="table-cell">
                      <div className="font-medium text-gray-900">
                        {contact.firstName} {contact.lastName}
                        {contact.isPrimary && (
                          <span className="ml-1 text-amber-500" title="Primary Contact">
                            &#9733;
                          </span>
                        )}
                      </div>
                      {contact.roleTitle && (
                        <div className="text-sm text-gray-500">{contact.roleTitle}</div>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-gray-900">{contact.email || <span className="text-gray-400">&mdash;</span>}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-gray-900">
                        {contact.mobile || contact.phone || <span className="text-gray-400">&mdash;</span>}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span
                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                        style={{ backgroundColor: roleDisplay.colour }}
                      >
                        {roleDisplay.label}
                      </span>
                    </td>
                    <td className="table-cell">
                      {contact.hasPortalAccess ? (
                        <span className="text-green-600" title="Has portal access">&#10003;</span>
                      ) : (
                        <span className="text-gray-400" title="No portal access">&#10007;</span>
                      )}
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleEdit(contact)}
                          className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(contact)}
                          className="text-sm text-red-600 hover:text-red-700 font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
