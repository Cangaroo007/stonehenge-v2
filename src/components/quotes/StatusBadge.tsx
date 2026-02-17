'use client';

import { useState, useRef, useEffect } from 'react';
import { getStatusColor, getStatusLabel, getStatusIcon } from '@/lib/utils';

interface StatusTransition {
  status: string;
  label: string;
  colour: string;
  icon: string;
}

interface StatusBadgeProps {
  status: string;
  quoteId: string;
  onStatusChange?: (newStatus: string, options?: { declinedReason?: string }) => Promise<void>;
  /** If true, clicking the badge opens a dropdown of valid transitions */
  interactive?: boolean;
}

export default function StatusBadge({
  status,
  quoteId,
  onStatusChange,
  interactive = false,
}: StatusBadgeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [transitions, setTransitions] = useState<StatusTransition[]>([]);
  const [loading, setLoading] = useState(false);
  const [showDeclineInput, setShowDeclineInput] = useState(false);
  const [declinedReason, setDeclinedReason] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setShowDeclineInput(false);
        setDeclinedReason('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Fetch available transitions when dropdown opens
  useEffect(() => {
    if (isOpen && interactive) {
      fetch(`/api/quotes/${quoteId}/status`)
        .then((res) => res.json())
        .then((data) => {
          setTransitions(data.availableTransitions || []);
        })
        .catch(console.error);
    }
  }, [isOpen, quoteId, interactive]);

  const handleTransition = async (targetStatus: string) => {
    if (targetStatus === 'declined') {
      setShowDeclineInput(true);
      return;
    }

    if (targetStatus === 'revision') {
      if (!confirm('Create a new revision? This will duplicate the quote and mark this one as "Revision".')) {
        return;
      }
    }

    setLoading(true);
    try {
      if (onStatusChange) {
        await onStatusChange(targetStatus);
      }
    } finally {
      setLoading(false);
      setIsOpen(false);
    }
  };

  const handleDeclineSubmit = async () => {
    if (!declinedReason.trim()) return;
    setLoading(true);
    try {
      if (onStatusChange) {
        await onStatusChange('declined', { declinedReason: declinedReason.trim() });
      }
    } finally {
      setLoading(false);
      setIsOpen(false);
      setShowDeclineInput(false);
      setDeclinedReason('');
    }
  };

  const icon = getStatusIcon(status);
  const label = getStatusLabel(status);
  const colour = getStatusColor(status);

  if (!interactive) {
    return (
      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${colour}`}>
        {icon && <span>{icon}</span>}
        {label}
      </span>
    );
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium cursor-pointer hover:ring-2 hover:ring-offset-1 hover:ring-gray-300 transition-all ${colour}`}
        disabled={loading}
      >
        {icon && <span>{icon}</span>}
        {label}
        <svg className={`h-3 w-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-1 w-56 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
          {showDeclineInput ? (
            <div className="px-3 py-2 space-y-2">
              <label className="text-xs font-medium text-gray-700">Reason for declining</label>
              <textarea
                value={declinedReason}
                onChange={(e) => setDeclinedReason(e.target.value)}
                className="w-full text-sm border border-gray-300 rounded-md p-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                rows={2}
                placeholder="Enter reason..."
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={handleDeclineSubmit}
                  disabled={!declinedReason.trim() || loading}
                  className="flex-1 px-3 py-1 text-xs font-medium text-white bg-red-600 rounded hover:bg-red-700 disabled:opacity-50"
                >
                  {loading ? 'Saving...' : 'Confirm Decline'}
                </button>
                <button
                  onClick={() => { setShowDeclineInput(false); setDeclinedReason(''); }}
                  className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : transitions.length > 0 ? (
            transitions.map((t) => (
              <button
                key={t.status}
                onClick={() => handleTransition(t.status)}
                disabled={loading}
                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 flex items-center gap-2 disabled:opacity-50"
              >
                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(t.status)}`}>
                  {t.icon && <span>{t.icon}</span>}
                  {t.label}
                </span>
              </button>
            ))
          ) : (
            <div className="px-4 py-2 text-sm text-gray-500">No transitions available</div>
          )}
        </div>
      )}
    </div>
  );
}
