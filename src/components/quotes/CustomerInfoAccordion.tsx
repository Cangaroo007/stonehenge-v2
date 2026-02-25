'use client';

import { useState } from 'react';

interface CustomerInfoAccordionProps {
  customerName: string | null;
  companyName: string | null;
  projectName: string | null;
  contact: {
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    role: string;
    role_title: string | null;
  } | null;
  projectAddress: string | null;
  notes: string | null;
}

export default function CustomerInfoAccordion({
  customerName,
  companyName,
  projectName,
  contact,
  projectAddress,
  notes,
}: CustomerInfoAccordionProps) {
  const [expanded, setExpanded] = useState(false);

  const displayCustomer = companyName || customerName || '-';
  const displayProject = projectName || '-';

  return (
    <div className="card overflow-hidden">
      {/* Collapsed summary — always visible */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-gray-50 transition-colors"
      >
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <div className="flex items-center gap-6 text-left min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-gray-500 font-medium shrink-0">Customer:</span>
            <span className="font-semibold text-gray-900 truncate">{displayCustomer}</span>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="text-gray-500 font-medium shrink-0">Project:</span>
            <span className="font-semibold text-gray-900 truncate">{displayProject}</span>
          </div>
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-gray-200 space-y-3">
          {/* Contact */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Contact</p>
            {contact ? (
              <div className="text-sm text-gray-700">
                <p className="font-medium">
                  {contact.first_name} {contact.last_name}
                  {contact.role_title
                    ? ` — ${contact.role_title}`
                    : contact.role !== 'OTHER'
                      ? ` — ${contact.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}`
                      : ''}
                </p>
                {(contact.email || contact.phone || contact.mobile) && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {[contact.email, contact.phone || contact.mobile].filter(Boolean).join('  |  ')}
                  </p>
                )}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">No contact assigned</p>
            )}
          </div>

          {/* Project Address */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Project Address</p>
            <p className="text-sm text-gray-700">{projectAddress || <span className="text-gray-400 italic">No address</span>}</p>
          </div>

          {/* Notes */}
          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-1">Notes</p>
            {notes ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{notes}</p>
            ) : (
              <p className="text-sm text-gray-400 italic">No notes</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
