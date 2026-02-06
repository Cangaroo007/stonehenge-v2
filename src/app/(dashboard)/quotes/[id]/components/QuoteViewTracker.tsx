'use client';

import { useEffect, useState } from 'react';
import { UserRole } from '@prisma/client';

interface QuoteView {
  id: number;
  viewedAt: string;
  ipAddress: string | null;
  userAgent: string | null;
  user: {
    id: number;
    email: string;
    name: string | null;
    role: UserRole;
  } | null;
}

interface QuoteViewTrackerProps {
  quoteId: number;
  showHistory?: boolean;
}

export default function QuoteViewTracker({ quoteId, showHistory = true }: QuoteViewTrackerProps) {
  const [views, setViews] = useState<QuoteView[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerViews, setCustomerViews] = useState<QuoteView[]>([]);
  const [latestCustomerView, setLatestCustomerView] = useState<QuoteView | null>(null);

  useEffect(() => {
    // Track this view
    trackView();

    // Load view history if requested
    if (showHistory) {
      loadViews();
    }
  }, [quoteId, showHistory]);

  const trackView = async () => {
    try {
      await fetch(`/api/quotes/${quoteId}/track-view`, {
        method: 'POST',
      });
    } catch (error) {
      // Silently fail - tracking is not critical
      console.error('Failed to track view:', error);
    }
  };

  const loadViews = async () => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/views`);
      if (res.ok) {
        const data = await res.json();
        setViews(data);

        // Filter customer views
        const custViews = data.filter((v: QuoteView) => v.user?.role === UserRole.CUSTOMER);
        setCustomerViews(custViews);
        
        // Get latest customer view
        if (custViews.length > 0) {
          setLatestCustomerView(custViews[0]);
        }
      }
    } catch (error) {
      console.error('Failed to load views:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!showHistory) {
    return null; // Just tracking, no UI
  }

  if (loading) {
    return (
      <div className="card p-6">
        <div className="flex items-center gap-2 text-gray-500">
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-500"></div>
          <span>Loading view history...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Customer View Alert */}
      {latestCustomerView && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
          <svg className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          <div>
            <p className="text-sm font-medium text-green-900">
              Customer viewed this quote
            </p>
            <p className="text-sm text-green-700 mt-1">
              {latestCustomerView.user?.name || latestCustomerView.user?.email} last viewed{' '}
              {formatRelativeTime(new Date(latestCustomerView.viewedAt))}
            </p>
          </div>
        </div>
      )}

      {/* View History Table */}
      {views.length > 0 && (
        <div className="card">
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold">View History</h3>
              <span className="text-sm text-gray-500">
                {views.length} view{views.length !== 1 ? 's' : ''}
                {customerViews.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs font-medium">
                    {customerViews.length} customer
                  </span>
                )}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">User</th>
                  <th className="table-header">Role</th>
                  <th className="table-header">Viewed</th>
                  <th className="table-header">IP Address</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {views.map((view) => (
                  <tr key={view.id} className={view.user?.role === UserRole.CUSTOMER ? 'bg-green-50/50' : ''}>
                    <td className="table-cell">
                      {view.user ? (
                        <div>
                          <div className="font-medium text-gray-900">
                            {view.user.name || 'Unnamed User'}
                          </div>
                          <div className="text-sm text-gray-500">{view.user.email}</div>
                        </div>
                      ) : (
                        <span className="text-gray-400">Anonymous</span>
                      )}
                    </td>
                    <td className="table-cell">
                      {view.user ? (
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                          view.user.role === UserRole.CUSTOMER ? 'bg-green-100 text-green-800' :
                          view.user.role === UserRole.ADMIN ? 'bg-purple-100 text-purple-800' :
                          view.user.role === UserRole.SALES_MANAGER ? 'bg-blue-100 text-blue-800' :
                          view.user.role === UserRole.SALES_REP ? 'bg-indigo-100 text-indigo-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {view.user.role}
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="table-cell">
                      <div>
                        <div className="text-sm text-gray-900">
                          {formatRelativeTime(new Date(view.viewedAt))}
                        </div>
                        <div className="text-xs text-gray-500">
                          {new Date(view.viewedAt).toLocaleString()}
                        </div>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm text-gray-500 font-mono">
                        {view.ipAddress || '—'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {views.length === 0 && (
        <div className="card p-6 text-center text-gray-500">
          No views recorded yet.
        </div>
      )}
    </div>
  );
}

// Helper function to format relative time
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 60) {
    return 'just now';
  } else if (diffMin < 60) {
    return `${diffMin} minute${diffMin !== 1 ? 's' : ''} ago`;
  } else if (diffHour < 24) {
    return `${diffHour} hour${diffHour !== 1 ? 's' : ''} ago`;
  } else if (diffDay < 7) {
    return `${diffDay} day${diffDay !== 1 ? 's' : ''} ago`;
  } else {
    return date.toLocaleDateString();
  }
}
