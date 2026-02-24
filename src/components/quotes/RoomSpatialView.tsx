'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { calculateRoomLayout } from '@/lib/services/room-layout-engine';
import { suggestRelationships } from '@/lib/services/relationship-suggest-service';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import type { RelationshipSuggestion } from '@/lib/types/piece-relationship';
import { RELATIONSHIP_DISPLAY, JOIN_POSITIONS } from '@/lib/types/piece-relationship';
import type { RelationshipType } from '@prisma/client';
import toast from 'react-hot-toast';
import { edgeColour, edgeCode } from '@/lib/utils/edge-utils';
import RoomPieceSVG from './RoomPieceSVG';
import RelationshipConnector from './RelationshipConnector';
import RelationshipSuggestions from './RelationshipSuggestions';
import type { EdgeScope } from './EdgeProfilePopover';

// ─── Interfaces ──────────────────────────────────────────────────────────────

interface QuotePiece {
  id: number;
  description: string | null;
  name: string | null;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  piece_type?: string | null;
  area_sqm: number;
  total_cost: number;
  /** Enriched total from calculation_breakdown — preferred over total_cost */
  pieceTotal?: number;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  piece_features?: Array<{ id: number; name: string; quantity: number }>;
  cutouts?: unknown;
  materialName?: string | null;
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

interface RoomInfo {
  id: number;
  name: string;
  sortOrder: number;
}

interface RoomSpatialViewProps {
  roomName: string;
  pieces: QuotePiece[];
  relationships: PieceRelationshipData[];
  mode: 'view' | 'edit';
  selectedPieceId?: string | null;
  onPieceSelect?: (pieceId: string) => void;
  roomTotal?: number;
  /** Quote ID for relationship API calls (edit mode) */
  quoteId?: string;
  /** Callback when a relationship is changed via popover (edit mode) */
  onRelationshipChange?: () => void;
  /** Callback when piece edge changes (edit mode, Quick Edge + accordion) */
  onPieceEdgeChange?: (pieceId: string, side: string, profileId: string | null) => void;
  /** Callback when piece material changes (edit mode, accordion) */
  onPieceMaterialChange?: (pieceId: string, materialId: number | null) => void;
  /** Callback to add a cutout to a piece */
  onPieceCutoutAdd?: (pieceId: string, cutoutTypeId: string) => void;
  /** Available edge profiles for Quick Edge mode and accordion */
  edgeProfiles?: EdgeProfileOption[];
  /** Available materials for accordion */
  materials?: MaterialOption[];
  /** Available cutout types for accordion */
  cutoutTypes?: Array<{ id: string; name: string; baseRate: number }>;
  /** Context menu handler — called on right-click with piece data */
  onContextMenu?: (pieceId: string, position: { x: number; y: number }) => void;
  // ── Room management props (edit mode) ──
  roomId?: number;
  allRooms?: RoomInfo[];
  onRoomRename?: (roomId: number, newName: string) => void;
  onRoomMoveUp?: (roomId: number) => void;
  onRoomMoveDown?: (roomId: number) => void;
  onRoomMerge?: (sourceRoomId: number, targetRoomId: number) => void;
  onRoomDelete?: (roomId: number) => void;
  onAddRoomBelow?: (afterRoomId: number) => void;
  onAddPiece?: (roomId: number) => void;
  // ── Room notes props ──
  roomNotes?: string | null;
  onRoomNotesChange?: (roomId: number, notes: string) => void;
  // ── Multi-select props ──
  selectedPieceIds?: Set<string>;
  onPieceMultiSelect?: (pieceId: string, event: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => void;
  /** Callback for batch edge update with scope selector */
  onBatchEdgeUpdate?: (
    profileId: string | null,
    scope: EdgeScope,
    sourcePieceId: number,
    sourceSide: string,
    sourceRoomId: number
  ) => void;
}

// Types that use join position
const POSITION_TYPES: RelationshipType[] = ['WATERFALL', 'SPLASHBACK', 'RETURN'];
const ALL_RELATIONSHIP_TYPES = Object.keys(RELATIONSHIP_DISPLAY) as RelationshipType[];

interface ConnectorPopover {
  relationshipId: string;
  x: number;
  y: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatArea(sqm: number): string {
  return sqm.toFixed(2) + ' m\u00B2';
}

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function inferPieceType(piece: QuotePiece): string | null {
  if (piece.piece_type) return piece.piece_type;

  // Infer from name/description
  const name = (piece.name ?? piece.description ?? '').toLowerCase();
  if (name.includes('splashback') || name.includes('splash back')) return 'SPLASHBACK';
  if (name.includes('waterfall')) return 'WATERFALL';
  if (name.includes('island')) return 'ISLAND';
  if (name.includes('return')) return 'RETURN';
  if (name.includes('window') || name.includes('sill')) return 'WINDOW_SILL';
  if (name.includes('benchtop') || name.includes('bench top')) return 'BENCHTOP';
  return null;
}

function countCutouts(piece: QuotePiece): number {
  if (!piece.piece_features) return 0;
  // Count features that look like cutouts
  return piece.piece_features.reduce((sum, f) => sum + f.quantity, 0);
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function RoomSpatialView({
  roomName,
  pieces,
  relationships,
  mode,
  selectedPieceId,
  onPieceSelect,
  roomTotal,
  quoteId,
  onRelationshipChange,
  onPieceEdgeChange,
  onPieceMaterialChange,
  onPieceCutoutAdd,
  edgeProfiles = [],
  materials = [],
  cutoutTypes = [],
  onContextMenu,
  // Room management
  roomId,
  allRooms = [],
  onRoomRename,
  onRoomMoveUp,
  onRoomMoveDown,
  onRoomMerge,
  onRoomDelete,
  onAddRoomBelow,
  onAddPiece,
  // Room notes
  roomNotes,
  onRoomNotesChange,
  // Multi-select
  selectedPieceIds,
  onPieceMultiSelect,
  // Batch edge update
  onBatchEdgeUpdate,
}: RoomSpatialViewProps) {
  // Calculate layout using the engine (memoised — expensive calculation)
  const layout = useMemo(() => {
    const layoutPieces = pieces.map(p => ({
      id: String(p.id),
      description: p.name ?? p.description ?? 'Piece',
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      piece_type: inferPieceType(p),
    }));

    const layoutRelationships = relationships.map(r => ({
      parentPieceId: r.parentPieceId,
      childPieceId: r.childPieceId,
      relationshipType: r.relationshipType,
      joinPosition: r.joinPosition,
    }));

    return calculateRoomLayout(layoutPieces, layoutRelationships);
  }, [pieces, relationships]);

  // Summary calculations
  const totalArea = useMemo(
    () => pieces.reduce((sum, p) => sum + p.area_sqm, 0),
    [pieces]
  );

  const totalCutouts = useMemo(
    () => pieces.reduce((sum, p) => sum + countCutouts(p), 0),
    [pieces]
  );

  // Build a piece lookup map for RoomPieceSVG
  const pieceMap = useMemo(() => {
    const map = new Map<string, QuotePiece>();
    for (const p of pieces) {
      map.set(String(p.id), p);
    }
    return map;
  }, [pieces]);

  // Hover state for relationship connector highlighting
  const [hoveredPieceId, setHoveredPieceId] = useState<string | null>(null);

  // ── Room management state ──
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(roomName);
  const [showRoomMenu, setShowRoomMenu] = useState(false);
  const [showMergeSubmenu, setShowMergeSubmenu] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const roomMenuRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Room notes state ──
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [editNotesValue, setEditNotesValue] = useState(roomNotes || '');
  const notesTextareaRef = useRef<HTMLTextAreaElement>(null);

  const handleNotesSave = useCallback(() => {
    setIsEditingNotes(false);
    const trimmed = editNotesValue.trim();
    if (trimmed !== (roomNotes || '') && roomId && onRoomNotesChange) {
      onRoomNotesChange(roomId, trimmed);
    }
  }, [editNotesValue, roomNotes, roomId, onRoomNotesChange]);

  const handleNotesKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleNotesSave();
    }
    if (e.key === 'Escape') {
      setEditNotesValue(roomNotes || '');
      setIsEditingNotes(false);
    }
  }, [handleNotesSave, roomNotes]);

  // Auto-focus and auto-resize notes textarea
  useEffect(() => {
    if (isEditingNotes && notesTextareaRef.current) {
      notesTextareaRef.current.focus();
      const el = notesTextareaRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [isEditingNotes]);

  // Close room menu on outside click
  useEffect(() => {
    if (!showRoomMenu) return;
    const handler = (e: MouseEvent) => {
      if (roomMenuRef.current && !roomMenuRef.current.contains(e.target as Node)) {
        setShowRoomMenu(false);
        setShowMergeSubmenu(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showRoomMenu]);

  // Focus input when editing name
  useEffect(() => {
    if (isEditingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [isEditingName]);

  const handleNameSave = useCallback(() => {
    const trimmed = editNameValue.trim();
    if (trimmed && trimmed !== roomName && roomId && onRoomRename) {
      onRoomRename(roomId, trimmed);
    }
    setIsEditingName(false);
  }, [editNameValue, roomName, roomId, onRoomRename]);

  const handleNameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleNameSave();
    if (e.key === 'Escape') {
      setEditNameValue(roomName);
      setIsEditingName(false);
    }
  }, [handleNameSave, roomName]);

  // Check if multi-selected
  const isPieceMultiSelected = useCallback((pieceId: string) => {
    return selectedPieceIds?.has(pieceId) ?? false;
  }, [selectedPieceIds]);

  const multiSelectCount = selectedPieceIds?.size ?? 0;

  // ── Quick Edge mode state — always-on in edit mode ──
  const [quickEdgeProfileId, setQuickEdgeProfileId] = useState<string | null>(null);

  const handleEdgeClick = useCallback((pieceId: string, side: string) => {
    if (!onPieceEdgeChange) return;
    onPieceEdgeChange(pieceId, side, quickEdgeProfileId);
    toast.success('Edge updated');
  }, [quickEdgeProfileId, onPieceEdgeChange]);

  // Connector popover state (edit mode)
  const [connectorPopover, setConnectorPopover] = useState<ConnectorPopover | null>(null);
  const [popoverType, setPopoverType] = useState<RelationshipType>('WATERFALL');
  const [popoverPosition, setPopoverPosition] = useState<string>('');
  const [popoverNotes, setPopoverNotes] = useState('');
  const [popoverSaving, setPopoverSaving] = useState(false);

  const handleConnectorClick = useCallback((relationshipId: string, midpoint: { x: number; y: number }) => {
    const rel = relationships.find(r => r.id === relationshipId);
    if (!rel) return;
    setConnectorPopover({ relationshipId, x: midpoint.x, y: midpoint.y });
    setPopoverType(rel.relationshipType);
    setPopoverPosition(rel.joinPosition ?? '');
    setPopoverNotes(rel.notes ?? '');
  }, [relationships]);

  const handlePopoverSave = useCallback(async () => {
    if (!connectorPopover || !quoteId) return;
    setPopoverSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships/${connectorPopover.relationshipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          relationshipType: popoverType,
          joinPosition: POSITION_TYPES.includes(popoverType) ? popoverPosition || null : null,
          notes: popoverNotes || null,
        }),
      });
      if (!res.ok) throw new Error('Failed to update');
      toast.success('Relationship updated');
      onRelationshipChange?.();
      setConnectorPopover(null);
    } catch {
      toast.error('Failed to update relationship');
    } finally {
      setPopoverSaving(false);
    }
  }, [connectorPopover, quoteId, popoverType, popoverPosition, popoverNotes, onRelationshipChange]);

  const handlePopoverDelete = useCallback(async () => {
    if (!connectorPopover || !quoteId) return;
    setPopoverSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships/${connectorPopover.relationshipId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete');
      toast.success('Relationship deleted');
      onRelationshipChange?.();
      setConnectorPopover(null);
    } catch {
      toast.error('Failed to delete relationship');
    } finally {
      setPopoverSaving(false);
    }
  }, [connectorPopover, quoteId, onRelationshipChange]);

  // Unique relationship types for the legend
  const uniqueRelationshipTypes = useMemo(() =>
    Array.from(new Set(relationships.map(r => r.relationshipType))),
    [relationships]
  );

  // ── Suggestion engine (edit mode only) ──
  const [dismissedSuggestions, setDismissedSuggestions] = useState<Set<string>>(new Set());

  const suggestions = useMemo(() => {
    if (mode !== 'edit') return [];
    return suggestRelationships(
      pieces.map(p => ({
        id: String(p.id),
        description: p.name ?? p.description ?? 'Piece',
        piece_type: inferPieceType(p),
        length_mm: p.length_mm,
        width_mm: p.width_mm,
        room_name: roomName,
      })),
      relationships.map(r => ({ parentPieceId: r.parentPieceId, childPieceId: r.childPieceId }))
    );
  }, [pieces, relationships, mode, roomName]);

  const visibleSuggestions = useMemo(
    () => suggestions.filter(s => {
      const key = `${s.parentPieceId}-${s.childPieceId}-${s.suggestedType}`;
      return !dismissedSuggestions.has(key);
    }),
    [suggestions, dismissedSuggestions]
  );

  // Piece name lookup for suggestion cards
  const pieceNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of pieces) {
      map.set(String(p.id), p.name ?? p.description ?? 'Piece');
    }
    return map;
  }, [pieces]);

  const handleSuggestionAccept = useCallback(async (suggestion: RelationshipSuggestion) => {
    if (!quoteId) return;
    try {
      const res = await fetch(`/api/quotes/${quoteId}/relationships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentPieceId: suggestion.parentPieceId,
          childPieceId: suggestion.childPieceId,
          relationshipType: suggestion.suggestedType,
          joinPosition: suggestion.suggestedPosition ?? undefined,
        }),
      });
      if (!res.ok) throw new Error('Failed to create relationship');
      toast.success('Relationship created from suggestion');
      // Remove from view immediately
      const key = `${suggestion.parentPieceId}-${suggestion.childPieceId}-${suggestion.suggestedType}`;
      setDismissedSuggestions(prev => new Set(prev).add(key));
      onRelationshipChange?.();
    } catch {
      toast.error('Failed to create relationship');
    }
  }, [quoteId, onRelationshipChange]);

  const handleSuggestionDismiss = useCallback((suggestion: RelationshipSuggestion) => {
    const key = `${suggestion.parentPieceId}-${suggestion.childPieceId}-${suggestion.suggestedType}`;
    setDismissedSuggestions(prev => new Set(prev).add(key));
  }, []);

  // ── Context menu handler ──
  const handlePieceContextMenu = useCallback((pieceId: string, e: React.MouseEvent) => {
    if (mode !== 'edit' || !onContextMenu) return;
    e.preventDefault();
    onContextMenu(pieceId, { x: e.clientX, y: e.clientY });
  }, [mode, onContextMenu]);

  // ── Accordion: selected piece data ──
  const selectedPiece = useMemo(() => {
    if (!selectedPieceId) return null;
    return pieceMap.get(selectedPieceId) ?? null;
  }, [selectedPieceId, pieceMap]);

  // Get relationships for selected piece
  const selectedPieceRelationships = useMemo(() => {
    if (!selectedPieceId) return [];
    return relationships.filter(
      r => r.parentPieceId === selectedPieceId || r.childPieceId === selectedPieceId
    );
  }, [selectedPieceId, relationships]);

  // ── Room header renderer (shared between empty and populated states) ──
  const renderRoomHeader = () => (
    <div className="flex justify-between items-center mb-3">
      <div className="flex items-center gap-2">
        {/* Editable room name (edit mode) */}
        {mode === 'edit' && isEditingName ? (
          <input
            ref={nameInputRef}
            type="text"
            value={editNameValue}
            onChange={e => setEditNameValue(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={handleNameKeyDown}
            className="text-sm font-semibold text-gray-700 border border-blue-300 rounded px-1 py-0.5 focus:ring-1 focus:ring-blue-500 focus:outline-none"
            style={{ width: Math.max(80, editNameValue.length * 8 + 20) }}
          />
        ) : (
          <h3
            className={`text-sm font-semibold text-gray-700 ${
              mode === 'edit' && onRoomRename ? 'cursor-pointer hover:text-blue-600' : ''
            }`}
            onClick={() => {
              if (mode === 'edit' && onRoomRename) {
                setEditNameValue(roomName);
                setIsEditingName(true);
              }
            }}
            title={mode === 'edit' ? 'Click to rename' : undefined}
          >
            {roomName}
          </h3>
        )}
        {/* + Piece button (edit mode) */}
        {mode === 'edit' && onAddPiece && roomId && (
          <button
            onClick={() => onAddPiece(roomId)}
            className="px-2 py-0.5 text-[10px] font-medium rounded-md border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition-colors"
          >
            + Piece
          </button>
        )}
        {/* Room actions menu (edit mode) */}
        {mode === 'edit' && roomId && (
          <div className="relative" ref={roomMenuRef}>
            <button
              onClick={() => setShowRoomMenu(!showRoomMenu)}
              className="px-1.5 py-0.5 text-[10px] font-medium rounded-md border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 transition-colors"
              title="Room actions"
            >
              &#x22EF;
            </button>
            {showRoomMenu && (
              <div className="absolute left-0 top-full mt-1 z-20 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
                {onRoomRename && (
                  <button
                    onClick={() => {
                      setShowRoomMenu(false);
                      setEditNameValue(roomName);
                      setIsEditingName(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Rename room
                  </button>
                )}
                {onRoomMoveUp && (
                  <button
                    onClick={() => { onRoomMoveUp(roomId); setShowRoomMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Move up
                  </button>
                )}
                {onRoomMoveDown && (
                  <button
                    onClick={() => { onRoomMoveDown(roomId); setShowRoomMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Move down
                  </button>
                )}
                {onRoomMerge && allRooms.length > 1 && (
                  <div className="relative">
                    <button
                      onClick={() => setShowMergeSubmenu(!showMergeSubmenu)}
                      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                    >
                      <span>Merge into...</span>
                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                    {showMergeSubmenu && (
                      <div className="absolute left-full top-0 ml-1 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                        {allRooms
                          .filter(r => r.id !== roomId)
                          .map(r => (
                            <button
                              key={r.id}
                              onClick={() => {
                                if (confirm(`Merge all pieces from "${roomName}" into "${r.name}"?`)) {
                                  onRoomMerge(roomId, r.id);
                                }
                                setShowRoomMenu(false);
                                setShowMergeSubmenu(false);
                              }}
                              className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                            >
                              {r.name}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
                {onAddRoomBelow && (
                  <button
                    onClick={() => { onAddRoomBelow(roomId); setShowRoomMenu(false); }}
                    className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Add room below
                  </button>
                )}
                {onRoomDelete && (
                  <>
                    <div className="border-t border-gray-100 my-1" />
                    {!showDeleteConfirm ? (
                      <button
                        onClick={() => setShowDeleteConfirm(true)}
                        className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50"
                      >
                        Delete room
                      </button>
                    ) : (
                      <div className="px-3 py-1.5 space-y-1">
                        <p className="text-[10px] text-red-600">
                          Pieces will move to Unassigned
                        </p>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => {
                              onRoomDelete(roomId);
                              setShowRoomMenu(false);
                              setShowDeleteConfirm(false);
                            }}
                            className="px-2 py-0.5 text-[10px] text-white bg-red-600 rounded hover:bg-red-700"
                          >
                            Delete
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(false)}
                            className="px-2 py-0.5 text-[10px] text-gray-500 border border-gray-200 rounded hover:bg-gray-50"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-500">
        {pieces.length} piece{pieces.length !== 1 ? 's' : ''}
        {roomTotal != null && ` | ${formatCurrency(roomTotal)}`}
      </span>
    </div>
  );

  // ── Room notes renderer ──
  const renderRoomNotes = () => {
    // Edit mode: editable notes
    if (mode === 'edit' && onRoomNotesChange && roomId) {
      if (isEditingNotes) {
        return (
          <div className="mb-2">
            <textarea
              ref={notesTextareaRef}
              value={editNotesValue}
              onChange={e => {
                setEditNotesValue(e.target.value);
                // Auto-resize
                const el = e.target;
                el.style.height = 'auto';
                el.style.height = el.scrollHeight + 'px';
              }}
              onBlur={handleNotesSave}
              onKeyDown={handleNotesKeyDown}
              placeholder="Add room notes..."
              rows={2}
              className="w-full text-xs text-gray-600 border border-blue-300 rounded px-2 py-1 focus:ring-1 focus:ring-blue-500 focus:outline-none resize-none"
            />
            <p className="text-[10px] text-gray-400 mt-0.5">Enter to save, Shift+Enter for newline, Escape to cancel</p>
          </div>
        );
      }

      if (roomNotes) {
        return (
          <div className="mb-2 flex items-start gap-1.5 group">
            <span className="text-xs text-gray-500 truncate flex-1" title={roomNotes}>
              {roomNotes}
            </span>
            <button
              onClick={() => {
                setEditNotesValue(roomNotes || '');
                setIsEditingNotes(true);
              }}
              className="text-[10px] text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0"
            >
              Edit note
            </button>
          </div>
        );
      }

      // No notes yet — show subtle "Add note" link
      return (
        <div className="mb-2">
          <button
            onClick={() => {
              setEditNotesValue('');
              setIsEditingNotes(true);
            }}
            className="text-[10px] text-gray-400 hover:text-blue-500 transition-colors"
          >
            + Add note
          </button>
        </div>
      );
    }

    // View mode: read-only notes
    if (roomNotes) {
      return (
        <p className="text-xs text-gray-500 mb-2">{roomNotes}</p>
      );
    }

    return null;
  };

  // ── Empty room ──
  if (pieces.length === 0) {
    return (
      <div className="border rounded-lg p-4 mb-6">
        {renderRoomHeader()}
        {renderRoomNotes()}
        <div className="text-centre py-8">
          <p className="text-sm text-gray-400">No pieces in this room yet</p>
          {mode === 'edit' && onAddPiece && roomId && (
            <button
              className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              onClick={() => onAddPiece(roomId)}
            >
              + Add Piece
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-4 mb-6">
      {/* Room header with management controls */}
      {renderRoomHeader()}
      {renderRoomNotes()}

      {/* Edge profile palette — always visible in edit mode */}
      {mode === 'edit' && edgeProfiles.length > 0 && onPieceEdgeChange && (
        <div className="flex items-center gap-1 mb-2 px-1 py-1.5 bg-blue-50 border border-blue-200 rounded-md flex-wrap">
          <button
            onClick={() => setQuickEdgeProfileId(null)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              quickEdgeProfileId === null
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            Raw
          </button>
          {edgeProfiles.map(ep => (
            <button
              key={ep.id}
              onClick={() => setQuickEdgeProfileId(ep.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                quickEdgeProfileId === ep.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {ep.name}
            </button>
          ))}
          <span className="text-[10px] text-blue-500 italic ml-auto">Click any edge to apply</span>
        </div>
      )}

      {/* Relationship suggestions (edit mode, above SVG) */}
      {mode === 'edit' && (
        <RelationshipSuggestions
          suggestions={visibleSuggestions}
          pieceNames={pieceNameMap}
          onAccept={handleSuggestionAccept}
          onDismiss={handleSuggestionDismiss}
        />
      )}

      {/* SVG canvas */}
      <svg
        viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
        className={`w-full h-auto ${mode === 'edit' && onPieceEdgeChange ? 'cursor-crosshair' : ''}`}
        style={{ maxHeight: 500 }}
      >
        {/* Relationship connectors (rendered BELOW pieces for z-order) */}
        <g className="relationship-connectors">
          {relationships.map(rel => {
            const parentPos = layout.pieces.find(p => p.pieceId === rel.parentPieceId);
            const childPos = layout.pieces.find(p => p.pieceId === rel.childPieceId);
            if (!parentPos || !childPos) return null;

            const isInvolved = hoveredPieceId === rel.parentPieceId || hoveredPieceId === rel.childPieceId;
            return (
              <RelationshipConnector
                key={rel.id}
                relationship={rel}
                parentPosition={parentPos}
                childPosition={childPos}
                scale={layout.scale}
                isHighlighted={isInvolved}
                isDimmed={hoveredPieceId != null && !isInvolved}
                isEditMode={mode === 'edit'}
                onConnectorClick={mode === 'edit' ? handleConnectorClick : undefined}
              />
            );
          })}
        </g>

        {/* Piece rectangles */}
        {layout.pieces.map(pos => {
          const piece = pieceMap.get(pos.pieceId);
          if (!piece) return null;

          return (
            <RoomPieceSVG
              key={pos.pieceId}
              piece={{
                id: String(piece.id),
                description: piece.name ?? piece.description ?? 'Piece',
                length_mm: piece.length_mm,
                width_mm: piece.width_mm,
                piece_type: inferPieceType(piece),
                thickness_mm: piece.thickness_mm,
                edges: [
                  { position: 'top', profile: piece.edge_top ?? '' },
                  { position: 'bottom', profile: piece.edge_bottom ?? '' },
                  { position: 'left', profile: piece.edge_left ?? '' },
                  { position: 'right', profile: piece.edge_right ?? '' },
                ],
                cutouts: piece.piece_features?.map(f => ({
                  type: f.name,
                  quantity: f.quantity,
                })),
              }}
              position={pos}
              scale={layout.scale}
              isSelected={selectedPieceId === String(piece.id) || isPieceMultiSelected(String(piece.id))}
              isEditMode={mode === 'edit'}
              isQuickEdgeMode={mode === 'edit' && !!onPieceEdgeChange}
              onPieceClick={onPieceMultiSelect
                ? (pieceId: string, e?: React.MouseEvent) => {
                    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                      onPieceMultiSelect(pieceId, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey });
                    } else {
                      onPieceSelect?.(pieceId);
                    }
                  }
                : onPieceSelect}
              onEdgeClick={mode === 'edit' && onPieceEdgeChange ? handleEdgeClick : undefined}
              onContextMenu={handlePieceContextMenu}
              onMouseEnter={setHoveredPieceId}
              onMouseLeave={() => setHoveredPieceId(null)}
            />
          );
        })}
      </svg>


      {/* Connector Popover Editor (edit mode) */}
      {connectorPopover && mode === 'edit' && quoteId && (
        <div className="relative">
          <div
            className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg p-3 space-y-2"
            style={{
              left: `${(connectorPopover.x / layout.viewBox.width) * 100}%`,
              top: -8,
              transform: 'translateX(-50%)',
              width: 240,
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-gray-700">Edit Connector</span>
              <button
                onClick={() => setConnectorPopover(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Type</label>
              <select
                value={popoverType}
                onChange={e => setPopoverType(e.target.value as RelationshipType)}
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                {ALL_RELATIONSHIP_TYPES.map(t => (
                  <option key={t} value={t}>{RELATIONSHIP_DISPLAY[t].label}</option>
                ))}
              </select>
            </div>
            {POSITION_TYPES.includes(popoverType) && (
              <div>
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Position</label>
                <select
                  value={popoverPosition}
                  onChange={e => setPopoverPosition(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">None</option>
                  {JOIN_POSITIONS.map(pos => (
                    <option key={pos} value={pos}>{pos}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Notes</label>
              <input
                type="text"
                value={popoverNotes}
                onChange={e => setPopoverNotes(e.target.value)}
                placeholder="Optional"
                className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-center justify-between pt-1">
              <button
                onClick={handlePopoverDelete}
                disabled={popoverSaving}
                className="text-xs text-red-500 hover:text-red-700 disabled:opacity-50"
              >
                Delete
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setConnectorPopover(null)}
                  className="px-2 py-1 text-xs text-gray-600 bg-white border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handlePopoverSave}
                  disabled={popoverSaving}
                  className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50"
                >
                  {popoverSaving ? 'Saving\u2026' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Inline Editing Accordion (Task A) — below SVG ── */}
      {mode === 'edit' && (
        <div className="mt-3 space-y-1">
          {pieces.map(piece => {
            const pieceIdStr = String(piece.id);
            const isSelected = selectedPieceId === pieceIdStr;
            const pieceName = piece.name ?? piece.description ?? 'Piece';
            const cutoutCount = countCutouts(piece);
            const pieceRelationships = relationships.filter(
              r => r.parentPieceId === pieceIdStr || r.childPieceId === pieceIdStr
            );

            const isMultiSelected = isPieceMultiSelected(pieceIdStr);

            if (!isSelected) {
              // Collapsed one-line summary
              return (
                <button
                  key={pieceIdStr}
                  onClick={(e) => {
                    if (onPieceMultiSelect && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                      onPieceMultiSelect(pieceIdStr, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey });
                    } else {
                      onPieceSelect?.(pieceIdStr);
                    }
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs rounded-md border transition-colors flex items-center justify-between ${
                    isMultiSelected
                      ? 'bg-blue-50 border-blue-300 ring-1 ring-blue-300'
                      : 'bg-gray-50 hover:bg-gray-100 border-gray-100'
                  }`}
                >
                  <span className="flex items-center gap-1.5">
                    {isMultiSelected && (
                      <svg className="h-3 w-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="font-medium text-gray-700 truncate">{pieceName}</span>
                  </span>
                  <span className="text-gray-400 flex-shrink-0 ml-2">
                    {piece.pieceTotal != null ? formatCurrency(piece.pieceTotal) : '\u2014'}
                  </span>
                </button>
              );
            }

            // Expanded accordion panel
            return (
              <div
                key={pieceIdStr}
                className="bg-white border border-blue-200 rounded-lg shadow-sm overflow-hidden"
              >
                {/* Accordion header */}
                <button
                  onClick={() => onPieceSelect?.(pieceIdStr)}
                  className="w-full text-left px-3 py-2 flex items-center justify-between bg-blue-50 hover:bg-blue-100 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <svg className="h-3 w-3 text-blue-500 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-800">{pieceName}</span>
                  </div>
                  <span className="text-xs font-medium text-blue-700">
                    {piece.pieceTotal != null ? formatCurrency(piece.pieceTotal) : '\u2014'}
                  </span>
                </button>

                {/* Accordion body */}
                <div className="px-3 py-2 space-y-2 text-xs">
                  {/* Dimensions */}
                  <div className="flex items-center gap-2 text-gray-600">
                    <span className="text-gray-400 w-4 text-center">&#x1F4D0;</span>
                    <span>
                      {piece.length_mm} &times; {piece.width_mm} mm
                      &middot; {piece.thickness_mm}mm
                    </span>
                  </div>

                  {/* Edges — clickable badges */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-gray-400 w-4 text-center">&#x1F3A8;</span>
                    <span className="text-gray-500">Edges:</span>
                    {(['top', 'bottom', 'left', 'right'] as const).map(side => {
                      const edgeValue = piece[`edge_${side}` as keyof QuotePiece] as string | null;
                      const code = edgeCode(edgeValue);
                      const colour = edgeColour(edgeValue);
                      const isRaw = !edgeValue || edgeValue.toLowerCase().includes('raw');
                      return (
                        <span
                          key={side}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer hover:opacity-80 transition-opacity ${
                            isRaw
                              ? 'bg-gray-50 text-gray-400 border-gray-200'
                              : 'text-white border-transparent'
                          }`}
                          style={!isRaw ? { backgroundColor: colour } : undefined}
                          title={`${side}: ${edgeValue ?? 'Raw'} — click to change`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onPieceEdgeChange && edgeProfiles.length > 0) {
                              handleEdgeClick(pieceIdStr, side);
                            }
                          }}
                        >
                          {code}
                        </span>
                      );
                    })}
                  </div>

                  {/* Material */}
                  {(piece.materialName || materials.length > 0) && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-4 text-center">&#x1FAA8;</span>
                      <span className="text-gray-600">
                        {piece.materialName || 'No material'}
                      </span>
                      {onPieceMaterialChange && materials.length > 0 && (
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) {
                              onPieceMaterialChange(pieceIdStr, parseInt(e.target.value));
                            }
                          }}
                          onClick={e => e.stopPropagation()}
                          className="px-1 py-0.5 text-[10px] border border-gray-200 rounded bg-white text-gray-500 hover:border-gray-300 cursor-pointer"
                        >
                          <option value="">Change</option>
                          {materials.map(m => (
                            <option key={m.id} value={m.id}>
                              {m.name}{m.collection ? ` (${m.collection})` : ''}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Cutouts */}
                  {(cutoutCount > 0 || (onPieceCutoutAdd && cutoutTypes.length > 0)) && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-4 text-center">&#x1F52A;</span>
                      <span className="text-gray-600">
                        {cutoutCount > 0
                          ? `${cutoutCount} cutout${cutoutCount !== 1 ? 's' : ''}: ${
                              piece.piece_features?.map(f => `${f.quantity}× ${f.name}`).join(', ') ?? ''
                            }`
                          : 'No cutouts'}
                      </span>
                      {onPieceCutoutAdd && cutoutTypes.length > 0 && (
                        <select
                          value=""
                          onChange={e => {
                            if (e.target.value) onPieceCutoutAdd(pieceIdStr, e.target.value);
                          }}
                          onClick={e => e.stopPropagation()}
                          className="px-1 py-0.5 text-[10px] border border-gray-200 rounded bg-white text-blue-600 hover:border-gray-300 cursor-pointer"
                        >
                          <option value="">+ Add</option>
                          {cutoutTypes.map(ct => (
                            <option key={ct.id} value={ct.id}>{ct.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Relationships */}
                  {pieceRelationships.length > 0 && (
                    <div className="flex items-center gap-2">
                      <span className="text-gray-400 w-4 text-center">&#x1F517;</span>
                      <span className="text-gray-600">
                        {pieceRelationships.length} relationship{pieceRelationships.length !== 1 ? 's' : ''}:
                        {' '}
                        {pieceRelationships.map(r => {
                          const display = RELATIONSHIP_DISPLAY[r.relationshipType];
                          const isParent = r.parentPieceId === pieceIdStr;
                          const otherId = isParent ? r.childPieceId : r.parentPieceId;
                          const otherPiece = pieceMap.get(otherId);
                          const otherName = otherPiece
                            ? (otherPiece.name ?? otherPiece.description ?? 'Piece')
                            : 'Unknown';
                          return `${display?.label ?? r.relationshipType} → ${otherName}`;
                        }).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Relationship legend — only show if room has relationships */}
      {uniqueRelationshipTypes.length > 0 && (
        <div className="flex flex-wrap gap-3 mt-2 text-xs">
          {uniqueRelationshipTypes.map(type => (
            <div key={type} className="flex items-center gap-1">
              <span
                className="w-4 h-0.5 inline-block"
                style={{ backgroundColor: RELATIONSHIP_DISPLAY[type].colour }}
              />
              <span className="text-muted-foreground">
                {RELATIONSHIP_DISPLAY[type].label}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Room summary bar */}
      <div className="flex gap-4 text-xs text-gray-500 mt-2">
        <span>{pieces.length} piece{pieces.length !== 1 ? 's' : ''}</span>
        <span>{formatArea(totalArea)}</span>
        {totalCutouts > 0 && <span>{totalCutouts} cutout{totalCutouts !== 1 ? 's' : ''}</span>}
        {relationships.length > 0 && (
          <span>{relationships.length} connection{relationships.length !== 1 ? 's' : ''}</span>
        )}
      </div>
    </div>
  );
}
