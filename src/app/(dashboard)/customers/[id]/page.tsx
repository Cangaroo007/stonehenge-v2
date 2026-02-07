'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { UserRole, CustomerUserRole } from '@prisma/client';
import { CUSTOMER_USER_ROLE_LABELS } from '@/lib/permissions';
import { CustomerDrawings } from './components/CustomerDrawings';

interface Customer {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  createdAt: string;
  client_types: { name: string } | null;
  client_tiers: { name: string } | null;
  defaultPriceBook: { name: string } | null;
  _count: {
    quotes: number;
    users: number;
  };
}

interface CustomerUser {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  customerUserRole: CustomerUserRole | null;
  customerId: number | null;
  isActive: boolean;
  createdAt: string;
  lastLoginAt: string | null;
  invitedAt: string | null;
}

interface Quote {
  id: number;
  quoteNumber: string;
  status: string;
  totalPrice: number;
  createdAt: string;
}

type TabType = 'details' | 'users' | 'quotes' | 'drawings';

export default function CustomerDetailPage() {
  const router = useRouter();
  const params = useParams();
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [loading, setLoading] = useState(true);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [users, setUsers] = useState<CustomerUser[]>([]);
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<CustomerUser | null>(null);

  // Fetch customer data
  useEffect(() => {
    async function loadCustomer() {
      try {
        const res = await fetch(`/api/customers/${params.id}`);
        if (!res.ok) throw new Error('Customer not found');
        const data = await res.json();
        setCustomer(data);
      } catch (error) {
        toast.error('Failed to load customer');
        router.push('/customers');
      } finally {
        setLoading(false);
      }
    }
    loadCustomer();
  }, [params.id, router]);

  // Fetch users when Users tab is active
  useEffect(() => {
    if (activeTab === 'users' && customer) {
      fetchUsers();
    }
  }, [activeTab, customer]);

  // Fetch quotes when Quotes tab is active
  useEffect(() => {
    if (activeTab === 'quotes' && customer) {
      fetchQuotes();
    }
  }, [activeTab, customer]);

  const fetchUsers = async () => {
    try {
      const res = await fetch(`/api/admin/users?customerId=${params.id}`);
      if (!res.ok) throw new Error('Failed to fetch users');
      const allUsers = await res.json();
      // Filter to only customer users for this customer
      const customerUsers = allUsers.filter(
        (u: CustomerUser) => u.customerId === parseInt(params.id as string) && u.role === UserRole.CUSTOMER
      );
      setUsers(customerUsers);
    } catch (error) {
      toast.error('Failed to load users');
      console.error(error);
    }
  };

  const fetchQuotes = async () => {
    try {
      const res = await fetch(`/api/quotes?customerId=${params.id}`);
      if (!res.ok) throw new Error('Failed to fetch quotes');
      const data = await res.json();
      setQuotes(data);
    } catch (error) {
      toast.error('Failed to load quotes');
      console.error(error);
    }
  };

  const handleAddUser = () => {
    setEditingUser(null);
    setShowUserModal(true);
  };

  const handleEditUser = (user: CustomerUser) => {
    setEditingUser(user);
    setShowUserModal(true);
  };

  const handleToggleUserActive = async (userId: number, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this user?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (!res.ok) throw new Error('Failed to update user');

      toast.success(`User ${currentStatus ? 'deactivated' : 'activated'} successfully`);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user');
      console.error(error);
    }
  };

  if (loading || !customer) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-gray-900">
              {customer.company || customer.name}
            </h1>
          </div>
          {customer.company && customer.name && (
            <p className="text-gray-500 mt-1">{customer.name}</p>
          )}
        </div>
        <Link href={`/customers/${customer.id}/edit`} className="btn-primary">
          Edit Details
        </Link>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('details')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'details'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Details
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'users'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Users
            {customer._count.users > 0 && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
                {customer._count.users}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('quotes')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'quotes'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Quotes
            {customer._count.quotes > 0 && (
              <span className="ml-2 py-0.5 px-2 rounded-full text-xs bg-gray-100 text-gray-600">
                {customer._count.quotes}
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('drawings')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'drawings'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Drawings
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'details' && <DetailsTab customer={customer} />}
      {activeTab === 'users' && (
        <UsersTab
          users={users}
          onAddUser={handleAddUser}
          onEditUser={handleEditUser}
          onToggleActive={handleToggleUserActive}
        />
      )}
      {activeTab === 'quotes' && <QuotesTab quotes={quotes} customerId={customer.id} />}
      {activeTab === 'drawings' && <CustomerDrawings customerId={customer.id} />}

      {/* User Form Modal */}
      {showUserModal && (
        <CustomerUserModal
          user={editingUser}
          customerId={customer.id}
          customerName={customer.company || customer.name}
          onClose={() => setShowUserModal(false)}
          onSaved={() => {
            setShowUserModal(false);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

// Details Tab Component
function DetailsTab({ customer }: { customer: Customer }) {
  return (
    <div className="card p-6 space-y-6 max-w-3xl">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div>
          <label className="text-sm font-medium text-gray-500">Contact Name</label>
          <p className="mt-1 text-gray-900">{customer.name || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Company</label>
          <p className="mt-1 text-gray-900">{customer.company || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Email</label>
          <p className="mt-1 text-gray-900">{customer.email || '—'}</p>
        </div>
        <div>
          <label className="text-sm font-medium text-gray-500">Phone</label>
          <p className="mt-1 text-gray-900">{customer.phone || '—'}</p>
        </div>
      </div>

      {customer.address && (
        <div>
          <label className="text-sm font-medium text-gray-500">Address</label>
          <p className="mt-1 text-gray-900 whitespace-pre-line">{customer.address}</p>
        </div>
      )}

      {customer.notes && (
        <div>
          <label className="text-sm font-medium text-gray-500">Notes</label>
          <p className="mt-1 text-gray-900 whitespace-pre-line">{customer.notes}</p>
        </div>
      )}

      <div className="border-t pt-6">
        <h3 className="text-sm font-medium text-gray-900 mb-4">Pricing Classification</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div>
            <label className="text-sm font-medium text-gray-500">Client Type</label>
            <p className="mt-1 text-gray-900">{customer.clientType?.name || '—'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Client Tier</label>
            <p className="mt-1 text-gray-900">{customer.clientTier?.name || '—'}</p>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-500">Default Price Book</label>
            <p className="mt-1 text-gray-900">{customer.defaultPriceBook?.name || '—'}</p>
          </div>
        </div>
      </div>

      <div className="border-t pt-6">
        <label className="text-sm font-medium text-gray-500">Created</label>
        <p className="mt-1 text-gray-900">{new Date(customer.createdAt).toLocaleDateString()}</p>
      </div>
    </div>
  );
}

// Users Tab Component
function UsersTab({
  users,
  onAddUser,
  onEditUser,
  onToggleActive,
}: {
  users: CustomerUser[];
  onAddUser: () => void;
  onEditUser: (user: CustomerUser) => void;
  onToggleActive: (userId: number, currentStatus: boolean) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">
          Manage portal access for this customer. Users can view quotes, upload files, and sign approvals.
        </p>
        <button onClick={onAddUser} className="btn-primary">
          + Add User
        </button>
      </div>

      {users.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No portal users for this customer yet.</p>
          <button onClick={onAddUser} className="btn-primary">
            Add First User
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">User</th>
                <th className="table-header">Access Level</th>
                <th className="table-header">Status</th>
                <th className="table-header">Invited</th>
                <th className="table-header">Last Login</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div>
                      <div className="font-medium text-gray-900">{user.name || 'Unnamed User'}</div>
                      <div className="text-sm text-gray-500">{user.email}</div>
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {user.customerUserRole 
                        ? CUSTOMER_USER_ROLE_LABELS[user.customerUserRole]
                        : 'Viewer'}
                    </span>
                  </td>
                  <td className="table-cell">
                    {user.isActive ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="table-cell">
                    {user.invitedAt ? (
                      <span className="text-sm text-gray-500">
                        {new Date(user.invitedAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="table-cell">
                    {user.lastLoginAt ? (
                      <span className="text-sm text-gray-500">
                        {new Date(user.lastLoginAt).toLocaleDateString()}
                      </span>
                    ) : (
                      <span className="text-gray-400">Never</span>
                    )}
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => onEditUser(user)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => onToggleActive(user.id, user.isActive)}
                        className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                      >
                        {user.isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Quotes Tab Component
function QuotesTab({ quotes, customerId }: { quotes: Quote[]; customerId: number }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">All quotes for this customer</p>
        <Link href={`/quotes/new?customerId=${customerId}`} className="btn-primary">
          + New Quote
        </Link>
      </div>

      {quotes.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No quotes for this customer yet.</p>
          <Link href={`/quotes/new?customerId=${customerId}`} className="btn-primary">
            Create First Quote
          </Link>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Quote #</th>
                <th className="table-header">Status</th>
                <th className="table-header">Total</th>
                <th className="table-header">Created</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {quotes.map((quote) => (
                <tr key={quote.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium">{quote.quoteNumber}</td>
                  <td className="table-cell">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' :
                      quote.status === 'SENT' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="table-cell">${quote.totalPrice?.toFixed(2) || '0.00'}</td>
                  <td className="table-cell">{new Date(quote.createdAt).toLocaleDateString()}</td>
                  <td className="table-cell text-right">
                    <Link
                      href={`/quotes/${quote.id}`}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      View
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// Customer User Modal Component
function CustomerUserModal({
  user,
  customerId,
  customerName,
  onClose,
  onSaved,
}: {
  user: CustomerUser | null;
  customerId: number;
  customerName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    name: user?.name || '',
    password: '',
    customerUserRole: user?.customerUserRole || CustomerUserRole.CUSTOMER_ADMIN,
    sendInvite: !user, // Default to true for new users
  });
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = user ? `/api/admin/users/${user.id}` : '/api/admin/users';
      const method = user ? 'PUT' : 'POST';

      const payload = {
        ...formData,
        role: UserRole.CUSTOMER,
        customerId,
        customerUserRole: formData.customerUserRole,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
      }

      const result = await response.json();

      // Show temp password if generated
      if (result.tempPassword) {
        alert(`User created!\n\nTemporary password: ${result.tempPassword}\n\nPlease save this password and share it with the user. They can change it after logging in.`);
      }

      toast.success(`User ${user ? 'updated' : 'created'} successfully`);
      onSaved();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              {user ? 'Edit Portal User' : 'Add Portal User'}
            </h2>
            <p className="text-sm text-gray-500 mt-1">For {customerName}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            ×
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="label">Email *</label>
            <input
              type="email"
              required
              disabled={!!user}
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="input"
            />
            {user && (
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed after creation</p>
            )}
          </div>

          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
              placeholder="Contact person name"
            />
          </div>

          <div>
            <label className="label">Portal Access Level *</label>
            <select
              required
              value={formData.customerUserRole}
              onChange={(e) => setFormData({ ...formData, customerUserRole: e.target.value as CustomerUserRole })}
              className="input"
            >
              <option value={CustomerUserRole.CUSTOMER_ADMIN}>
                Customer Admin - Full Access
              </option>
              <option value={CustomerUserRole.CUSTOMER_APPROVER}>
                Approver - View + Sign Quotes
              </option>
              <option value={CustomerUserRole.CUSTOMER_VIEWER}>
                Viewer - Read Only
              </option>
            </select>
            <p className="text-xs text-gray-500 mt-1">
              {formData.customerUserRole === CustomerUserRole.CUSTOMER_ADMIN && 
                '✓ View quotes, sign approvals, upload files, manage portal users'}
              {formData.customerUserRole === CustomerUserRole.CUSTOMER_APPROVER && 
                '✓ View quotes, sign/approve quotes, download PDFs'}
              {formData.customerUserRole === CustomerUserRole.CUSTOMER_VIEWER && 
                '✓ View quotes only (read-only access)'}
            </p>
          </div>

          {!user && (
            <div>
              <label className="label">Password {!formData.sendInvite && '*'}</label>
              <input
                type="password"
                required={!formData.sendInvite}
                disabled={formData.sendInvite}
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                className="input"
                placeholder={formData.sendInvite ? 'Temporary password will be generated' : 'Enter password'}
              />
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.sendInvite}
                  onChange={(e) => setFormData({ ...formData, sendInvite: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">
                  Generate temporary password (you'll see it after creation)
                </span>
              </label>
            </div>
          )}

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm text-blue-900 font-medium mb-2">
              What can this user do?
            </p>
            <div className="text-sm text-blue-800 space-y-1">
              {formData.customerUserRole === CustomerUserRole.CUSTOMER_ADMIN && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>View all quotes for this customer</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Sign and approve quotes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Upload files and drawings</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Manage other portal users</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Download PDFs and view project updates</span>
                  </div>
                </>
              )}
              {formData.customerUserRole === CustomerUserRole.CUSTOMER_APPROVER && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>View all quotes for this customer</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Sign and approve quotes</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Download PDFs and view project updates</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400">✗</span>
                    <span className="text-gray-500">Cannot upload files or manage users</span>
                  </div>
                </>
              )}
              {formData.customerUserRole === CustomerUserRole.CUSTOMER_VIEWER && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>View all quotes for this customer</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-green-600">✓</span>
                    <span>Download PDFs</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-red-400">✗</span>
                    <span className="text-gray-500">Cannot sign, upload, or manage users (read-only)</span>
                  </div>
                </>
              )}
            </div>
          </div>
        </form>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : user ? 'Update User' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}
