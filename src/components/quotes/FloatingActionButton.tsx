'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface FloatingActionButtonProps {
  actionBarRef: React.RefObject<HTMLDivElement | null>;
  onImportDrawing: () => void;
  onFromTemplate: () => void;
  onAddPiece: () => void;
  onSave: () => void;
}

export default function FloatingActionButton({
  actionBarRef,
  onImportDrawing,
  onFromTemplate,
  onAddPiece,
  onSave,
}: FloatingActionButtonProps) {
  const [showFab, setShowFab] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // IntersectionObserver to track action bar visibility
  useEffect(() => {
    if (!actionBarRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setShowFab(!entry.isIntersecting);
      },
      { threshold: 0 }
    );

    observer.observe(actionBarRef.current);
    return () => observer.disconnect();
  }, [actionBarRef]);

  // Close on Escape
  useEffect(() => {
    if (!expanded) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [expanded]);

  // Click outside to close
  useEffect(() => {
    if (!expanded) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [expanded]);

  const handleAction = useCallback((action: () => void) => {
    setExpanded(false);
    action();
  }, []);

  const actions = [
    {
      label: 'Import Drawing',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      ),
      onClick: () => handleAction(onImportDrawing),
    },
    {
      label: 'From Template',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
        </svg>
      ),
      onClick: () => handleAction(onFromTemplate),
    },
    {
      label: 'Add Piece',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
      ),
      onClick: () => handleAction(onAddPiece),
    },
    {
      label: 'Save Draft',
      icon: (
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
      ),
      onClick: () => handleAction(onSave),
    },
  ];

  return (
    <div
      ref={menuRef}
      className={`fixed bottom-6 right-6 z-50 transition-opacity duration-200 ${
        showFab ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
      }`}
    >
      {/* Expanded menu */}
      {expanded && (
        <div className="mb-3 flex flex-col gap-2 items-end">
          {actions.map((action) => (
            <button
              key={action.label}
              onClick={action.onClick}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-gray-700 text-sm font-medium rounded-lg shadow-lg border border-gray-200 hover:bg-gray-50 transition-colors whitespace-nowrap"
            >
              {action.icon}
              {action.label}
            </button>
          ))}
        </div>
      )}

      {/* FAB button */}
      <div className="flex justify-end">
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-200 ${
            expanded
              ? 'bg-gray-700 hover:bg-gray-800 text-white'
              : 'bg-amber-500 hover:bg-amber-600 text-white'
          }`}
          aria-label={expanded ? 'Close action menu' : 'Open action menu'}
        >
          <svg
            className={`h-6 w-6 transition-transform duration-200 ${expanded ? 'rotate-45' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    </div>
  );
}
