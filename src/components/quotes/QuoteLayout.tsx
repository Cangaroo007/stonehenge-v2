'use client';

import { useState, useCallback } from 'react';
import { getStatusColor, getStatusLabel, formatCurrency } from '@/lib/utils';

export type QuoteMode = 'view' | 'edit';
export type QuoteTab = 'pieces' | 'optimiser' | 'history';

interface QuoteLayoutProps {
  /** Quote number e.g. "Q-0042" */
  quoteNumber: string;
  /** Project name */
  projectName: string | null;
  /** Quote status e.g. "draft", "sent" */
  status: string;
  /** Customer display name */
  customerName: string | null;
  /** Current mode */
  mode: QuoteMode;
  /** Toggle mode callback */
  onModeChange: (mode: QuoteMode) => void;
  /** Calculated total (inc GST) to show in header */
  calculatedTotal?: number | null;
  /** Whether to show the mode toggle (hidden for new quotes) */
  showModeToggle?: boolean;
  /** Saving indicator */
  saving?: boolean;
  /** Unsaved changes indicator */
  hasUnsavedChanges?: boolean;

  /** Action buttons rendered in the header bar — contextual based on mode */
  actionButtons?: React.ReactNode;

  /** Active tab */
  activeTab: QuoteTab;
  /** Tab change callback */
  onTabChange: (tab: QuoteTab) => void;

  /** Main content area */
  children: React.ReactNode;

  /** Right sidebar content */
  sidebarContent?: React.ReactNode;
  /** Whether sidebar is expanded */
  sidebarOpen?: boolean;
  /** Toggle sidebar callback */
  onSidebarToggle?: () => void;

  /** Footer totals */
  subtotal?: number | null;
  discount?: number | null;
  gstRate?: number | null;
  gstAmount?: number | null;
  total?: number | null;
  /** Whether to show the footer */
  showFooter?: boolean;
}

export default function QuoteLayout({
  quoteNumber,
  projectName,
  status,
  customerName,
  mode,
  onModeChange,
  calculatedTotal,
  showModeToggle = true,
  saving = false,
  hasUnsavedChanges = false,
  actionButtons,
  activeTab,
  onTabChange,
  children,
  sidebarContent,
  sidebarOpen = false,
  onSidebarToggle,
  subtotal,
  discount,
  gstRate,
  gstAmount,
  total,
  showFooter = false,
}: QuoteLayoutProps) {
  return (
    <div className="space-y-4">
      {/* ── Header Bar ── */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Left: Quote info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl font-bold text-gray-900 truncate">{quoteNumber}</h1>
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(status)}`}
              >
                {getStatusLabel(status)}
              </span>
              {saving && (
                <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                  <svg className="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Saving...
                </span>
              )}
              {hasUnsavedChanges && !saving && (
                <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                  Unsaved changes
                </span>
              )}
            </div>
            <div className="mt-1 flex items-center gap-4 text-sm text-gray-600 flex-wrap">
              {projectName && <span>{projectName}</span>}
              {customerName && (
                <span className="flex items-center gap-1">
                  <svg className="h-4 w-4 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                  {customerName}
                </span>
              )}
            </div>
          </div>

          {/* Centre: View/Edit toggle */}
          {showModeToggle && (
            <div className="flex items-center">
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => onModeChange('view')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === 'view'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  View
                </button>
                <button
                  onClick={() => onModeChange('edit')}
                  className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    mode === 'edit'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  Edit
                </button>
              </div>
            </div>
          )}

          {/* Right: Calculated total */}
          {calculatedTotal != null && (
            <div className="text-right hidden sm:block">
              <p className="text-xs text-gray-500">Calculated Total</p>
              <p className="text-lg font-bold text-primary-600">
                {formatCurrency(calculatedTotal)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Action Buttons ── */}
      {actionButtons && (
        <div className="flex items-center gap-3 flex-wrap">
          {actionButtons}
        </div>
      )}

      {/* ── Tab Bar ── */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => onTabChange('pieces')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'pieces'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pieces &amp; Pricing
          </button>
          <button
            onClick={() => onTabChange('optimiser')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'optimiser'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
              </svg>
              Slab Optimiser
            </div>
          </button>
          <button
            onClick={() => onTabChange('history')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Version History
            </div>
          </button>
        </nav>
      </div>

      {/* ── Main Content + Sidebar ── */}
      <div
        className="flex gap-6 items-start"
        style={{
          display: 'flex',
        }}
      >
        {/* Main content area — takes remaining width, scrollable */}
        <div className="flex-1 min-w-0 overflow-auto">
          {children}
        </div>

        {/* Right sidebar — collapsible */}
        <div
          className="flex-shrink-0 transition-all duration-200 ease-in-out overflow-hidden"
          style={{ width: sidebarOpen ? 350 : 0 }}
        >
          {sidebarOpen && (
            <div className="w-[350px] space-y-6">
              {sidebarContent}
            </div>
          )}
        </div>

        {/* Sidebar collapse/expand toggle button */}
        {onSidebarToggle && (
          <button
            onClick={onSidebarToggle}
            className="flex-shrink-0 self-start mt-1 p-1.5 rounded-md border border-gray-300 bg-white hover:bg-gray-50 text-gray-500 hover:text-gray-700 transition-colors"
            title={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
            aria-label={sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              className={`h-4 w-4 transition-transform duration-200 ${sidebarOpen ? 'rotate-0' : 'rotate-180'}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>
        )}
      </div>

      {/* ── Footer: Totals ── */}
      {showFooter && (
        <div className="card p-6">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal ?? 0)}</span>
              </div>
              {(discount != null && discount > 0) && (
                <div className="flex justify-between text-green-600">
                  <span>Discount:</span>
                  <span className="font-medium">-{formatCurrency(discount)}</span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-gray-600">GST{gstRate != null ? ` (${gstRate}%)` : ''}:</span>
                <span className="font-medium">{formatCurrency(gstAmount ?? 0)}</span>
              </div>
              <div className="flex justify-between text-lg border-t pt-2">
                <span className="font-semibold">Total:</span>
                <span className="font-bold text-primary-600">
                  {formatCurrency(total ?? 0)}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
