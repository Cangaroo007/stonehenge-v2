'use client';

import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface RoomOption {
  id: string;
  name: string;
}

interface EdgeProfileOption {
  id: string;
  name: string;
}

interface MaterialOption {
  id: number;
  name: string;
  collection?: string | null;
}

export interface PieceContextMenuProps {
  /** Screen position to render the menu at */
  position: { x: number; y: number };
  /** The piece ID being right-clicked */
  pieceId: string;
  /** Piece display name */
  pieceName: string;
  /** Whether the menu is open */
  isOpen: boolean;
  /** Close the menu */
  onClose: () => void;

  // ── Action callbacks ──────────────────────────────────────────────────
  /** Edit piece — scrolls to + expands inline accordion */
  onEdit?: (pieceId: string) => void;
  /** Duplicate piece via API */
  onDuplicate?: (pieceId: string) => void;
  /** Move piece to another room */
  onMoveToRoom?: (pieceId: string, roomId: string) => void;
  /** Apply edge profile to all edges */
  onQuickEdgeAll?: (pieceId: string, profileId: string | null) => void;
  /** Change material */
  onChangeMaterial?: (pieceId: string, materialId: number | null) => void;
  /** Open relationship editor */
  onAddRelationship?: (pieceId: string) => void;
  /** Delete piece with confirmation */
  onDelete?: (pieceId: string) => void;

  // ── Data for submenus ─────────────────────────────────────────────────
  rooms?: RoomOption[];
  edgeProfiles?: EdgeProfileOption[];
  materials?: MaterialOption[];
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PieceContextMenu({
  position,
  pieceId,
  pieceName,
  isOpen,
  onClose,
  onEdit,
  onDuplicate,
  onMoveToRoom,
  onQuickEdgeAll,
  onChangeMaterial,
  onAddRelationship,
  onDelete,
  rooms = [],
  edgeProfiles = [],
  materials = [],
}: PieceContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [activeSubmenu, setActiveSubmenu] = useState<'rooms' | 'edges' | 'materials' | null>(null);

  // ── Position clamping (keep within viewport) ──────────────────────────

  const clampedPosition = useCallback(() => {
    if (typeof window === 'undefined') return position;
    const menuWidth = 220;
    const menuHeight = 320;
    const x = Math.min(position.x, window.innerWidth - menuWidth - 8);
    const y = Math.min(position.y, window.innerHeight - menuHeight - 8);
    return { x: Math.max(8, x), y: Math.max(8, y) };
  }, [position]);

  // ── Close on click outside / Escape ───────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    // Delay adding click listener to avoid immediate close from the context menu event
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  // Reset submenu when menu closes
  useEffect(() => {
    if (!isOpen) setActiveSubmenu(null);
  }, [isOpen]);

  if (!isOpen) return null;

  const pos = clampedPosition();

  const menuContent = (
    <div
      ref={menuRef}
      className="fixed z-[9999] bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[200px]"
      style={{ left: pos.x, top: pos.y }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Header */}
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100 truncate">
        {pieceName}
      </div>

      {/* Edit piece */}
      <MenuItem
        icon={<EditIcon />}
        label="Edit piece"
        shortcut="E"
        onClick={() => { onEdit?.(pieceId); onClose(); }}
      />

      {/* Duplicate piece */}
      <MenuItem
        icon={<CopyIcon />}
        label="Duplicate piece"
        shortcut="D"
        onClick={() => { onDuplicate?.(pieceId); onClose(); }}
      />

      {/* Separator */}
      <div className="my-1 border-t border-gray-100" />

      {/* Move to room — submenu */}
      {rooms.length > 0 && (
        <SubMenuItem
          icon={<MoveIcon />}
          label="Move to room..."
          isActive={activeSubmenu === 'rooms'}
          onHover={() => setActiveSubmenu('rooms')}
        >
          {rooms.map(room => (
            <MenuItem
              key={room.id}
              label={room.name}
              onClick={() => { onMoveToRoom?.(pieceId, room.id); onClose(); }}
            />
          ))}
          <div className="my-1 border-t border-gray-100" />
          <MenuItem
            label="+ New room..."
            onClick={() => { onMoveToRoom?.(pieceId, '__new__'); onClose(); }}
            className="text-blue-600"
          />
        </SubMenuItem>
      )}

      {/* Quick Edge all — submenu */}
      {edgeProfiles.length > 0 && (
        <SubMenuItem
          icon={<QuickEdgeIcon />}
          label="Quick Edge all..."
          isActive={activeSubmenu === 'edges'}
          onHover={() => setActiveSubmenu('edges')}
        >
          <MenuItem
            label="Raw (no finish)"
            onClick={() => { onQuickEdgeAll?.(pieceId, null); onClose(); }}
          />
          {edgeProfiles.map(profile => (
            <MenuItem
              key={profile.id}
              label={profile.name}
              onClick={() => { onQuickEdgeAll?.(pieceId, profile.id); onClose(); }}
            />
          ))}
        </SubMenuItem>
      )}

      {/* Change material — submenu */}
      {materials.length > 0 && (
        <SubMenuItem
          icon={<MaterialIcon />}
          label="Change material..."
          isActive={activeSubmenu === 'materials'}
          onHover={() => setActiveSubmenu('materials')}
        >
          <MenuItem
            label="No material"
            onClick={() => { onChangeMaterial?.(pieceId, null); onClose(); }}
          />
          {materials.slice(0, 20).map(mat => (
            <MenuItem
              key={mat.id}
              label={`${mat.name}${mat.collection ? ` (${mat.collection})` : ''}`}
              onClick={() => { onChangeMaterial?.(pieceId, mat.id); onClose(); }}
            />
          ))}
        </SubMenuItem>
      )}

      {/* Add relationship */}
      <MenuItem
        icon={<LinkIcon />}
        label="Add relationship"
        shortcut="R"
        onClick={() => { onAddRelationship?.(pieceId); onClose(); }}
      />

      {/* Separator */}
      <div className="my-1 border-t border-gray-100" />

      {/* Delete piece */}
      <MenuItem
        icon={<TrashIcon />}
        label="Delete piece"
        shortcut="Del"
        onClick={() => { onDelete?.(pieceId); onClose(); }}
        className="text-red-600 hover:bg-red-50"
      />
    </div>
  );

  return createPortal(menuContent, document.body);
}

// ── MenuItem ────────────────────────────────────────────────────────────────

function MenuItem({
  icon,
  label,
  shortcut,
  onClick,
  className = '',
}: {
  icon?: React.ReactNode;
  label: string;
  shortcut?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2 ${className}`}
    >
      {icon && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 truncate">{label}</span>
      {shortcut && (
        <span className="text-[10px] text-gray-400 font-mono bg-gray-100 px-1 rounded flex-shrink-0">
          {shortcut}
        </span>
      )}
    </button>
  );
}

// ── SubMenuItem ─────────────────────────────────────────────────────────────

function SubMenuItem({
  icon,
  label,
  isActive,
  onHover,
  children,
}: {
  icon?: React.ReactNode;
  label: string;
  isActive: boolean;
  onHover: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="relative" onMouseEnter={onHover}>
      <button
        className="w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 transition-colors flex items-center gap-2"
      >
        {icon && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">{icon}</span>}
        <span className="flex-1">{label}</span>
        <svg className="h-3 w-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
      {isActive && (
        <div className="absolute left-full top-0 ml-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 min-w-[180px] max-h-[250px] overflow-y-auto z-[10000]">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Icons (inline SVG) ──────────────────────────────────────────────────────

function EditIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
    </svg>
  );
}

function MoveIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
    </svg>
  );
}

function QuickEdgeIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
    </svg>
  );
}

function MaterialIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

// ── Long-press hook for mobile ──────────────────────────────────────────────

export function useLongPress(
  callback: (e: React.TouchEvent | React.MouseEvent) => void,
  ms = 300
) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const start = useCallback(
    (e: React.TouchEvent | React.MouseEvent) => {
      timerRef.current = setTimeout(() => {
        callback(e);
      }, ms);
    },
    [callback, ms]
  );

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  return {
    onTouchStart: start,
    onTouchEnd: clear,
    onTouchMove: clear,
  };
}
