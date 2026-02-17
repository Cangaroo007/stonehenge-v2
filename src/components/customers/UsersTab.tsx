'use client';

import { UserRole, CustomerUserRole } from '@prisma/client';
import { CUSTOMER_USER_ROLE_LABELS } from '@/lib/permissions';

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

interface UsersTabProps {
  users: CustomerUser[];
  onAddUser: () => void;
  onEditUser: (user: CustomerUser) => void;
  onToggleActive: (userId: number, currentStatus: boolean) => void;
}

export default function UsersTab({
  users,
  onAddUser,
  onEditUser,
  onToggleActive,
}: UsersTabProps) {
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
                      <span className="text-gray-400">&mdash;</span>
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
