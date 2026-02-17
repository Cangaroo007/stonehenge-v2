'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { formatCurrency, formatDate, getStatusColor, getStatusLabel, getStatusIcon } from '@/lib/utils';

interface QuoteRow {
  id: number;
  quote_number: string;
  project_name: string | null;
  status: string;
  total: number;
  created_at: string;
  valid_until: string | null;
  status_changed_at: string | null;
  customers: { name: string } | null;
}

interface QuotesListClientProps {
  quotes: QuoteRow[];
}

const STATUS_FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'active', label: 'Active' },
  { value: 'draft', label: 'Draft' },
  { value: 'review', label: 'Review' },
  { value: 'sent', label: 'Sent' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'declined', label: 'Declined' },
  { value: 'in_production', label: 'In Production' },
  { value: 'completed', label: 'Completed' },
  { value: 'archived', label: 'Archived' },
];

const ARCHIVED_STATUSES = ['archived'];
const ACTIVE_FILTER_EXCLUDE = ['archived'];

export default function QuotesListClient({ quotes }: QuotesListClientProps) {
  const [statusFilter, setStatusFilter] = useState('all');

  const filteredQuotes = useMemo(() => {
    if (statusFilter === 'all') return quotes;
    if (statusFilter === 'active') {
      return quotes.filter((q) => !ACTIVE_FILTER_EXCLUDE.includes(q.status.toLowerCase()));
    }
    return quotes.filter((q) => q.status.toLowerCase() === statusFilter);
  }, [quotes, statusFilter]);

  return (
    <>
      {/* Status filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        {STATUS_FILTERS.map((filter) => {
          const count = filter.value === 'all'
            ? quotes.length
            : filter.value === 'active'
              ? quotes.filter((q) => !ACTIVE_FILTER_EXCLUDE.includes(q.status.toLowerCase())).length
              : quotes.filter((q) => q.status.toLowerCase() === filter.value).length;

          return (
            <button
              key={filter.value}
              onClick={() => setStatusFilter(filter.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${
                statusFilter === filter.value
                  ? 'bg-blue-100 text-blue-800 ring-1 ring-blue-300'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {filter.label}
              {count > 0 && <span className="ml-1 text-[10px] opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Quote #</th>
                <th className="table-header">Customer</th>
                <th className="table-header">Project</th>
                <th className="table-header">Total</th>
                <th className="table-header">Status</th>
                <th className="table-header">Date</th>
                <th className="table-header">Valid Until</th>
                <th className="table-header"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredQuotes.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                    {statusFilter !== 'all' ? (
                      <>
                        No quotes with status &ldquo;{STATUS_FILTERS.find(f => f.value === statusFilter)?.label}&rdquo;.{' '}
                        <button onClick={() => setStatusFilter('all')} className="text-primary-600 hover:text-primary-700">
                          Show all
                        </button>
                      </>
                    ) : (
                      <>
                        No quotes yet.{' '}
                        <Link href="/quotes/new" className="text-primary-600 hover:text-primary-700">
                          Create your first quote
                        </Link>
                      </>
                    )}
                  </td>
                </tr>
              ) : (
                filteredQuotes.map((quote) => (
                  <tr key={quote.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium">
                      <Link href={`/quotes/${quote.id}`} className="text-primary-600 hover:text-primary-700">
                        {quote.quote_number}
                      </Link>
                    </td>
                    <td className="table-cell">{quote.customers?.name || '-'}</td>
                    <td className="table-cell">{quote.project_name || '-'}</td>
                    <td className="table-cell font-medium">{formatCurrency(quote.total)}</td>
                    <td className="table-cell">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(quote.status)}`}>
                        <span>{getStatusIcon(quote.status)}</span>
                        {getStatusLabel(quote.status)}
                      </span>
                    </td>
                    <td className="table-cell">{formatDate(quote.created_at)}</td>
                    <td className="table-cell">{quote.valid_until ? formatDate(quote.valid_until) : '-'}</td>
                    <td className="table-cell">
                      <div className="flex gap-2">
                        <Link
                          href={`/quotes/${quote.id}`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          View
                        </Link>
                        <Link
                          href={`/quotes/${quote.id}?mode=edit`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
