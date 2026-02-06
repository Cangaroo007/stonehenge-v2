'use client';

import { useState, useEffect } from 'react';
import { UserRole, Permission } from '@prisma/client';
import { ROLE_LABELS, PERMISSION_LABELS } from '@/lib/permissions';
import toast from 'react-hot-toast';

interface User {
  id: number;
  email: string;
  name: string | null;
  role: UserRole;
  isActive: boolean;
  customerId: number | null;
  customer: {
    id: number;
    name: string;
    company: string | null;
  } | null;
  permissions: Permission[];
  createdAt: string;
  lastLoginAt: string | null;
}

export default function UsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);

  // Fetch users
  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users');
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
    } catch (error) {
      toast.error('Failed to load users');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleAddUser = () => {
    setEditingUser(null);
    setShowModal(true);
  };

  const handleEditUser = (user: User) => {
    setEditingUser(user);
    setShowModal(true);
  };

  const handleToggleActive = async (userId: number, currentStatus: boolean) => {
    if (!confirm(`Are you sure you want to ${currentStatus ? 'deactivate' : 'activate'} this user?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !currentStatus }),
      });

      if (!response.ok) throw new Error('Failed to update user');

      toast.success(`User ${currentStatus ? 'deactivated' : 'activated'} successfully`);
      fetchUsers();
    } catch (error) {
      toast.error('Failed to update user');
      console.error(error);
    }
  };

  const handleDeleteUser = async (userId: number) => {
    if (!confirm('Are you sure you want to delete this user? This will deactivate their account.')) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/users/${userId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete user');

      toast.success('User deactivated successfully');
      fetchUsers();
    } catch (error) {
      toast.error('Failed to delete user');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-gray-500 mt-1">Manage user accounts and permissions</p>
        </div>
        <button onClick={handleAddUser} className="btn-primary">
          + Add User
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Users</div>
          <div className="text-2xl font-bold text-gray-900">{users.length}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Active Users</div>
          <div className="text-2xl font-bold text-green-600">
            {users.filter(u => u.isActive).length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Inactive Users</div>
          <div className="text-2xl font-bold text-gray-400">
            {users.filter(u => !u.isActive).length}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Customer Users</div>
          <div className="text-2xl font-bold text-blue-600">
            {users.filter(u => u.role === UserRole.CUSTOMER).length}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="card overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">User</th>
              <th className="table-header">Role</th>
              <th className="table-header">Customer</th>
              <th className="table-header">Status</th>
              <th className="table-header">Last Login</th>
              <th className="table-header text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <td className="table-cell">
                  <div>
                    <div className="font-medium text-gray-900">
                      {user.name || 'Unnamed User'}
                    </div>
                    <div className="text-sm text-gray-500">{user.email}</div>
                  </div>
                </td>
                <td className="table-cell">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' :
                    user.role === UserRole.SALES_MANAGER ? 'bg-blue-100 text-blue-800' :
                    user.role === UserRole.SALES_REP ? 'bg-green-100 text-green-800' :
                    user.role === UserRole.FABRICATOR ? 'bg-orange-100 text-orange-800' :
                    user.role === UserRole.CUSTOMER ? 'bg-pink-100 text-pink-800' :
                    user.role === UserRole.CUSTOM ? 'bg-yellow-100 text-yellow-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {ROLE_LABELS[user.role]}
                  </span>
                </td>
                <td className="table-cell">
                  {user.customer ? (
                    <div className="text-sm">
                      <div className="text-gray-900">{user.customer.company || user.customer.name}</div>
                    </div>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
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
                      onClick={() => handleEditUser(user)}
                      className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleToggleActive(user.id, user.isActive)}
                      className="text-sm text-gray-600 hover:text-gray-700 font-medium"
                    >
                      {user.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    {!user.isActive && (
                      <button
                        onClick={() => handleDeleteUser(user.id)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {users.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            No users found. Add your first user to get started.
          </div>
        )}
      </div>

      {/* User Form Modal */}
      {showModal && (
        <UserFormModal
          user={editingUser}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            fetchUsers();
          }}
        />
      )}
    </div>
  );
}

// User Form Modal Component
function UserFormModal({
  user,
  onClose,
  onSaved,
}: {
  user: User | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    name: user?.name || '',
    role: user?.role || UserRole.SALES_REP,
    customerId: user?.customerId || null,
    password: '',
    permissions: user?.permissions || [],
    sendInvite: false,
  });
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<Array<{ id: number; name: string; company: string | null }>>([]);

  // Fetch customers for customer users
  useEffect(() => {
    if (formData.role === UserRole.CUSTOMER) {
      fetch('/api/customers')
        .then(res => res.json())
        .then(setCustomers)
        .catch(console.error);
    }
  }, [formData.role]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      const url = user ? `/api/admin/users/${user.id}` : '/api/admin/users';
      const method = user ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to save user');
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
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-4 border-b flex justify-between items-center">
          <h2 className="text-xl font-semibold text-gray-900">
            {user ? 'Edit User' : 'Add New User'}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">×</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
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
          </div>

          <div>
            <label className="label">Name</label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="input"
            />
          </div>

          <div>
            <label className="label">Role *</label>
            <select
              required
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value as UserRole, customerId: null })}
              className="input"
            >
              {Object.entries(ROLE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {formData.role === UserRole.CUSTOMER && (
            <div>
              <label className="label">Customer *</label>
              <select
                required
                value={formData.customerId || ''}
                onChange={(e) => setFormData({ ...formData, customerId: parseInt(e.target.value) })}
                className="input"
              >
                <option value="">Select a customer...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.company || customer.name}
                  </option>
                ))}
              </select>
            </div>
          )}

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
                placeholder={formData.sendInvite ? 'Temporary password will be generated' : ''}
              />
              <label className="flex items-center gap-2 mt-2">
                <input
                  type="checkbox"
                  checked={formData.sendInvite}
                  onChange={(e) => setFormData({ ...formData, sendInvite: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Send invitation email with temp password</span>
              </label>
            </div>
          )}

          {formData.role === UserRole.CUSTOM && (
            <PermissionPicker
              selected={formData.permissions}
              onChange={(permissions) => setFormData({ ...formData, permissions })}
            />
          )}
        </form>

        <div className="px-6 py-4 border-t bg-gray-50 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="btn-primary"
          >
            {saving ? 'Saving...' : user ? 'Update User' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Permission Picker Component
function PermissionPicker({
  selected,
  onChange,
}: {
  selected: Permission[];
  onChange: (permissions: Permission[]) => void;
}) {
  const togglePermission = (permission: Permission) => {
    if (selected.includes(permission)) {
      onChange(selected.filter(p => p !== permission));
    } else {
      onChange([...selected, permission]);
    }
  };

  const permissionGroups = {
    'User Management': [Permission.MANAGE_USERS, Permission.VIEW_USERS],
    'Customer Management': [Permission.MANAGE_CUSTOMERS, Permission.VIEW_CUSTOMERS],
    'Quote Management': [
      Permission.CREATE_QUOTES,
      Permission.EDIT_QUOTES,
      Permission.DELETE_QUOTES,
      Permission.VIEW_ALL_QUOTES,
      Permission.VIEW_OWN_QUOTES,
      Permission.APPROVE_QUOTES,
    ],
    'Material & Pricing': [
      Permission.MANAGE_MATERIALS,
      Permission.VIEW_MATERIALS,
      Permission.MANAGE_PRICING,
      Permission.VIEW_PRICING,
    ],
    'Optimization': [
      Permission.RUN_OPTIMIZATION,
      Permission.VIEW_OPTIMIZATION,
      Permission.EXPORT_CUTLISTS,
    ],
    'Reports & Data': [
      Permission.VIEW_REPORTS,
      Permission.EXPORT_DATA,
    ],
    'System': [
      Permission.MANAGE_SETTINGS,
      Permission.VIEW_AUDIT_LOGS,
    ],
  };

  return (
    <div className="border rounded-lg p-4">
      <label className="block text-sm font-medium text-gray-700 mb-3">
        Custom Permissions
      </label>
      <div className="space-y-4">
        {Object.entries(permissionGroups).map(([group, permissions]) => (
          <div key={group}>
            <div className="text-sm font-medium text-gray-600 mb-2">{group}</div>
            <div className="space-y-2 ml-2">
              {permissions.map((permission) => (
                <label key={permission} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(permission)}
                    onChange={() => togglePermission(permission)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-700">{PERMISSION_LABELS[permission]}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
