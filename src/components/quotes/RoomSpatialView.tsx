'use client';

import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { calculateRoomLayout } from '@/lib/services/room-layout-engine';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import { JOIN_POSITIONS, RELATIONSHIP_DISPLAY } from '@/lib/types/piece-relationship';
import type { RelationshipType } from '@prisma/client';
import toast from 'react-hot-toast';
import { edgeColour, edgeCode, edgeDisplayName } from '@/lib/utils/edge-utils';
import { normaliseRectEdgeSide, rectEdgeDisplayLabel } from '@/lib/utils/edge-side';
import RoomPieceSVG, { type SuppressedEdgeDisplay } from './RoomPieceSVG';
import type { Placement } from '@/types/slab-optimization';
import RelationshipConnector from './RelationshipConnector';
import type { EdgeScope } from './EdgeProfilePopover';
import type { PiecePosition } from '@/lib/services/room-layout-engine';
import type { EdgeBuildupConfig } from '@/types/edge-buildup';

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
  /** @deprecated Unreliable — use pieceTotal or slabCost from calculation_breakdown */
  total_cost: number;
  /** Enriched total from calculation_breakdown — preferred over total_cost */
  pieceTotal?: number;
  /** Material/slab cost only (no fabrication) — displayed in spatial list */
  slabCost?: number;
  edge_top: string | null;
  edge_bottom: string | null;
  edge_left: string | null;
  edge_right: string | null;
  shape_type?: string | null;
  shape_config?: unknown;
  noStripEdges?: string[] | null;
  edgeBuildups?: Record<string, EdgeBuildupConfig> | null;
  piece_features?: Array<{ id: number; name: string; quantity: number }>;
  cutouts?: unknown;
  materialName?: string | null;
  lamination_method?: string | null;
  mitred_corner_treatment?: string | null;
  /** Fabrication category from the assigned material */
  fabricationCategory?: string;
}

interface EdgeProfileOption {
  id: string;
  name: string;
  /** Fabrication categories with configured (non-zero) rates */
  configuredCategories?: string[];
  isMitred?: boolean;
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
  cutoutTypes?: Array<{ id: string; name: string; baseRate: number; configuredCategories?: string[] }>;
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
  /** Optimizer placements — used to overlay join cut lines on pieces */
  optimizerPlacements?: Placement[];
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

function joinPositionLabel(position: string): string {
  return formatJoinPosition(position)
    ?? position.charAt(0) + position.slice(1).toLowerCase();
}

interface ConnectorPopover {
  relationshipId: string;
  x: number;
  y: number;
}

interface SpatialDragState {
  pieceId: string;
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
  moved: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatArea(sqm: number): string {
  return sqm.toFixed(2) + ' m\u00B2';
}

function formatCurrency(amount: number): string {
  return '$' + amount.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function getPieceDisplayTotal(piece: QuotePiece): number | null {
  return piece.pieceTotal ?? piece.slabCost ?? null;
}

function humaniseRelationshipType(type: string): string {
  return type
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function canonicalJoinPositionValue(position: string | null | undefined): '' | 'LEFT' | 'RIGHT' | 'BACK' | 'FRONT' {
  const side = normaliseRectEdgeSide(position);
  if (!side) return '';
  if (side === 'top') return 'BACK';
  if (side === 'bottom') return 'FRONT';
  return side.toUpperCase() as 'LEFT' | 'RIGHT';
}

function formatJoinPosition(position: string | null | undefined): string | null {
  const side = normaliseRectEdgeSide(position);
  return side ? rectEdgeDisplayLabel(side) : null;
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

function getCutoutItems(piece: QuotePiece): Array<{ name: string; quantity: number }> {
  if (piece.piece_features && piece.piece_features.length > 0) {
    return piece.piece_features.map(f => ({
      name: f.name,
      quantity: f.quantity,
    }));
  }

  if (!Array.isArray(piece.cutouts)) return [];

  return (piece.cutouts as Record<string, unknown>[])
    .map(cutout => {
      const name = String(cutout.name ?? cutout.type ?? cutout.typeName ?? cutout.cutoutTypeName ?? '').trim();
      const quantity = Number(cutout.quantity ?? cutout.count ?? 1);
      return {
        name: name || 'Cutout',
        quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
      };
    })
    .filter(cutout => cutout.name);
}

function countCutouts(piece: QuotePiece): number {
  return getCutoutItems(piece).reduce((sum, cutout) => sum + cutout.quantity, 0);
}

const OPPOSITE_EDGE: Record<'top' | 'bottom' | 'left' | 'right', 'top' | 'bottom' | 'left' | 'right'> = {
  top: 'bottom',
  bottom: 'top',
  left: 'right',
  right: 'left',
};

function edgeListIncludes(edges: string[] | null | undefined, side: string): boolean {
  const normalisedSide = normaliseRectEdgeSide(side);
  if (!normalisedSide) return false;
  return (edges ?? []).some(edge => normaliseRectEdgeSide(edge) === normalisedSide);
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
  // Optimizer overlay
  optimizerPlacements,
}: RoomSpatialViewProps) {
  const roomGridKey = useMemo(
    () => `room-grid-${String(roomId ?? roomName).replace(/[^a-zA-Z0-9_-]/g, '-')}`,
    [roomId, roomName]
  );
  const roomGridMajorKey = `${roomGridKey}-major`;

  // Calculate layout using the engine (memoised — expensive calculation)
  const layout = useMemo(() => {
    const layoutPieces = pieces.map(p => ({
      id: String(p.id),
      description: p.name ?? p.description ?? 'Piece',
      length_mm: p.length_mm,
      width_mm: p.width_mm,
      piece_type: inferPieceType(p),
      shape_config: p.shape_config,
    }));

    const layoutRelationships = relationships.map(r => ({
      parentPieceId: r.parentPieceId,
      childPieceId: r.childPieceId,
      relationshipType: r.relationshipType,
      joinPosition: r.joinPosition,
      positionMm: r.positionMm,
      positionReference: r.positionReference,
      coverageMm: r.coverageMm,
    }));

    return calculateRoomLayout(layoutPieces, layoutRelationships);
  }, [pieces, relationships]);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragStateRef = useRef<SpatialDragState | null>(null);
  const [arrangeMode, setArrangeMode] = useState(false);
  const [manualOffsets, setManualOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const [draggedPieceId, setDraggedPieceId] = useState<string | null>(null);

  const arrangedLayoutPieces = useMemo<PiecePosition[]>(() => (
    layout.pieces.map(piece => {
      const offset = manualOffsets[piece.pieceId];
      return offset
        ? { ...piece, x: piece.x + offset.x, y: piece.y + offset.y }
        : piece;
    })
  ), [layout.pieces, manualOffsets]);

  const getSvgPoint = useCallback((event: React.PointerEvent<SVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(svg.getScreenCTM()?.inverse());
  }, []);

  const handlePiecePointerDown = useCallback((
    pieceId: string,
    event: React.PointerEvent<SVGGElement>
  ) => {
    if (!arrangeMode || mode !== 'edit') return;
    if (event.button !== 0) return;

    const point = getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const origin = manualOffsets[pieceId] ?? { x: 0, y: 0 };
    dragStateRef.current = {
      pieceId,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      originX: origin.x,
      originY: origin.y,
      moved: false,
    };
    setDraggedPieceId(pieceId);
    onPieceSelect?.(pieceId);
  }, [arrangeMode, getSvgPoint, manualOffsets, mode, onPieceSelect]);

  const handlePiecePointerMove = useCallback((event: React.PointerEvent<SVGGElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const point = getSvgPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    const dx = point.x - drag.startX;
    const dy = point.y - drag.startY;
    drag.moved = drag.moved || Math.abs(dx) > 2 || Math.abs(dy) > 2;
    setManualOffsets(prev => ({
      ...prev,
      [drag.pieceId]: {
        x: drag.originX + dx,
        y: drag.originY + dy,
      },
    }));
  }, [getSvgPoint]);

  const finishPieceDrag = useCallback((event: React.PointerEvent<SVGGElement>) => {
    const drag = dragStateRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    event.preventDefault();
    event.stopPropagation();
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer capture may already be released if the pointer left the SVG.
    }
    dragStateRef.current = null;
    setDraggedPieceId(null);
  }, []);

  useEffect(() => {
    setManualOffsets(prev => {
      const validIds = new Set(layout.pieces.map(piece => piece.pieceId));
      const next = Object.fromEntries(
        Object.entries(prev).filter(([pieceId]) => validIds.has(pieceId))
      );
      return Object.keys(next).length === Object.keys(prev).length ? prev : next;
    });
  }, [layout.pieces]);

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

  // Compute join positions per piece from optimizer segment placements
  const joinPositionsMap = useMemo(() => {
    const map = new Map<number, number[]>();
    if (!optimizerPlacements) return map;
    const segmentsByParent = new Map<string, Placement[]>();
    for (const p of optimizerPlacements) {
      if (p.isSegment && p.parentPieceId) {
        const existing = segmentsByParent.get(p.parentPieceId) ?? [];
        existing.push(p);
        segmentsByParent.set(p.parentPieceId, existing);
      }
    }
    for (const [parentId, segments] of Array.from(segmentsByParent)) {
      const supportsVerticalJoinOverlay = segments.every(
        segment => (segment.segmentRows ?? 1) === 1 && (segment.segmentRowIndex ?? 0) === 0
      );
      if (!supportsVerticalJoinOverlay) continue;

      const sorted = [...segments].sort(
        (a, b) => (a.segmentColumnIndex ?? a.segmentIndex ?? 0) - (b.segmentColumnIndex ?? b.segmentIndex ?? 0)
      );
      const joins: number[] = [];
      let cumulative = 0;
      for (let i = 0; i < sorted.length - 1; i++) {
        cumulative += sorted[i].segmentWidthMm ?? sorted[i].width;
        joins.push(cumulative);
      }
      map.set(Number(parentId), joins);
    }
    return map;
  }, [optimizerPlacements]);

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
  const visibleEdgeProfiles = useMemo(
    () => edgeProfiles.filter(profile => !profile.isMitred),
    [edgeProfiles]
  );

  useEffect(() => {
    if (quickEdgeProfileId && !visibleEdgeProfiles.some(profile => profile.id === quickEdgeProfileId)) {
      setQuickEdgeProfileId(null);
    }
  }, [quickEdgeProfileId, visibleEdgeProfiles]);

  const getSuppressedEdgeDisplay = useCallback((piece: QuotePiece, side: string): SuppressedEdgeDisplay | null => {
    const normalisedSide = normaliseRectEdgeSide(side);
    if (!normalisedSide) return null;

    for (const rel of relationships) {
      if (rel.relationshipType !== 'WATERFALL' && rel.relationshipType !== 'SPLASHBACK') {
        continue;
      }

      const parentEdge = normaliseRectEdgeSide(rel.joinPosition);
      if (!parentEdge) continue;

      const pieceId = String(piece.id);
      const isParentJoin = rel.parentPieceId === pieceId && parentEdge === normalisedSide;
      const isChildJoin = rel.childPieceId === pieceId && OPPOSITE_EDGE[parentEdge] === normalisedSide;
      if (isParentJoin || isChildJoin) {
        if (rel.relationshipType === 'WATERFALL') {
          return { code: 'WF', colour: '#2563eb', label: 'Waterfall join, not a wall edge - edit the relationship instead' };
        }
        return { code: 'SB', colour: '#059669', label: 'Splashback join, not a wall edge - edit the relationship instead' };
      }
    }

    if (edgeListIncludes(piece.noStripEdges, normalisedSide)) {
      return { code: 'WALL', colour: '#78716c', label: 'Against wall - no return strip or edge polish' };
    }

    return null;
  }, [relationships]);

  const getSuppressedEdges = useCallback((piece: QuotePiece) => {
    const suppressed: Partial<Record<'top' | 'bottom' | 'left' | 'right', SuppressedEdgeDisplay>> = {};
    (['top', 'bottom', 'left', 'right'] as const).forEach(side => {
      const suppression = getSuppressedEdgeDisplay(piece, side);
      if (suppression) suppressed[side] = suppression;
    });
    return suppressed;
  }, [getSuppressedEdgeDisplay]);

  const handleEdgeClick = useCallback((pieceId: string, side: string) => {
    if (!onPieceEdgeChange) return;
    const piece = pieceMap.get(pieceId);
    const suppression = piece ? getSuppressedEdgeDisplay(piece, side) : null;
    if (suppression) {
      toast.error('Use the relationship or wall-edge controls for this edge');
      return;
    }
    onPieceEdgeChange(pieceId, side, quickEdgeProfileId);
    toast.success('Edge updated');
  }, [getSuppressedEdgeDisplay, pieceMap, quickEdgeProfileId, onPieceEdgeChange]);

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
    setPopoverPosition(canonicalJoinPositionValue(rel.joinPosition));
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
        <div className="text-center py-8">
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
      {mode === 'edit' && visibleEdgeProfiles.length > 0 && onPieceEdgeChange && (
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
          {visibleEdgeProfiles.map(ep => (
            <button
              key={ep.id}
              onClick={() => setQuickEdgeProfileId(ep.id)}
              className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
                quickEdgeProfileId === ep.id
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
              }`}
            >
              {edgeDisplayName(ep.name)}
            </button>
          ))}
          <span className="text-[10px] text-blue-500 italic ml-auto">Click any edge to apply</span>
        </div>
      )}

      {mode === 'edit' && (
        <div className="flex items-center gap-2 mb-2 px-1 py-1.5 border border-gray-200 rounded-md bg-gray-50 flex-wrap">
          <button
            type="button"
            onClick={() => setArrangeMode(value => !value)}
            className={`px-2 py-0.5 text-[10px] font-medium rounded border transition-colors ${
              arrangeMode
                ? 'bg-slate-800 text-white border-slate-800'
                : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
            }`}
          >
            Arrange
          </button>
          {Object.keys(manualOffsets).length > 0 && (
            <button
              type="button"
              onClick={() => setManualOffsets({})}
              className="px-2 py-0.5 text-[10px] font-medium rounded border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition-colors"
            >
              Reset layout
            </button>
          )}
          <span className="text-[10px] text-gray-500 italic">
            {arrangeMode
              ? 'Drag pieces to visually check room layout. Pricing is unchanged.'
              : 'Assembly view uses saved polygon geometry where available. Use Arrange to correct rough room layout.'}
          </span>
        </div>
      )}

      {/* SVG canvas */}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${layout.viewBox.width} ${layout.viewBox.height}`}
        className={`w-full h-auto rounded-lg border border-slate-800 bg-slate-950 ${
          arrangeMode
            ? 'cursor-move'
            : mode === 'edit' && onPieceEdgeChange
              ? 'cursor-crosshair'
              : ''
        }`}
        style={{ maxHeight: 560 }}
      >
        <defs>
          <pattern id={roomGridKey} width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(148,163,184,0.12)" strokeWidth="1" />
          </pattern>
          <pattern id={roomGridMajorKey} width="200" height="200" patternUnits="userSpaceOnUse">
            <rect width="200" height="200" fill={`url(#${roomGridKey})`} />
            <path d="M 200 0 L 0 0 0 200" fill="none" stroke="rgba(148,163,184,0.18)" strokeWidth="1.2" />
          </pattern>
        </defs>
        <rect width={layout.viewBox.width} height={layout.viewBox.height} fill={`url(#${roomGridMajorKey})`} />
        <text x={18} y={26} className="fill-slate-400 text-[11px] font-semibold uppercase tracking-wide">
          Spatial assembly
        </text>
        <text x={18} y={44} className="fill-slate-500 text-[10px]">
          {pieces.length} fabrication piece{pieces.length !== 1 ? 's' : ''}{relationships.length > 0 ? ` · ${relationships.length} join/relationship${relationships.length !== 1 ? 's' : ''}` : ' · interpreted layout'}
        </text>
        {/* Relationship connectors (rendered BELOW pieces for z-order) */}
        <g className="relationship-connectors">
          {relationships.map(rel => {
            const parentPos = arrangedLayoutPieces.find(p => p.pieceId === rel.parentPieceId);
            const childPos = arrangedLayoutPieces.find(p => p.pieceId === rel.childPieceId);
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
        {arrangedLayoutPieces.map(pos => {
          const piece = pieceMap.get(pos.pieceId);
          if (!piece) return null;

          return (
            <g
              key={pos.pieceId}
              onPointerDown={(event) => handlePiecePointerDown(pos.pieceId, event)}
              onPointerMove={handlePiecePointerMove}
              onPointerUp={finishPieceDrag}
              onPointerCancel={finishPieceDrag}
              style={{
                cursor: arrangeMode
                  ? draggedPieceId === pos.pieceId ? 'grabbing' : 'grab'
                  : undefined,
              }}
            >
            <RoomPieceSVG
              piece={{
                id: String(piece.id),
                description: piece.name ?? piece.description ?? 'Piece',
                length_mm: piece.length_mm,
                width_mm: piece.width_mm,
                piece_type: inferPieceType(piece),
                shape_type: piece.shape_type,
                shape_config: piece.shape_config,
                thickness_mm: piece.thickness_mm,
                edges: [
                  { position: 'top', profile: piece.edge_top ?? '' },
                  { position: 'bottom', profile: piece.edge_bottom ?? '' },
                  { position: 'left', profile: piece.edge_left ?? '' },
                  { position: 'right', profile: piece.edge_right ?? '' },
                ],
                cutouts: getCutoutItems(piece).map(cutout => ({
                  type: cutout.name,
                  quantity: cutout.quantity,
                })),
                laminationMethod: piece.lamination_method,
                mitredCornerTreatment: piece.mitred_corner_treatment,
                edgeBuildups: piece.edgeBuildups,
              }}
              position={pos}
              scale={layout.scale}
              isSelected={selectedPieceId === String(piece.id) || isPieceMultiSelected(String(piece.id))}
              isEditMode={mode === 'edit'}
              isQuickEdgeMode={mode === 'edit' && !!onPieceEdgeChange && !arrangeMode}
              onPieceClick={onPieceMultiSelect
                ? (pieceId: string, e?: React.MouseEvent) => {
                    if (arrangeMode) return;
                    if (e && (e.ctrlKey || e.metaKey || e.shiftKey)) {
                      onPieceMultiSelect(pieceId, { ctrlKey: e.ctrlKey, shiftKey: e.shiftKey, metaKey: e.metaKey });
                    } else {
                      onPieceSelect?.(pieceId);
                    }
                  }
                : onPieceSelect}
              onEdgeClick={mode === 'edit' && onPieceEdgeChange && !arrangeMode ? handleEdgeClick : undefined}
              onContextMenu={handlePieceContextMenu}
              onMouseEnter={setHoveredPieceId}
              onMouseLeave={() => setHoveredPieceId(null)}
              joinPositionsMm={joinPositionsMap.get(piece.id)}
              suppressedEdges={getSuppressedEdges(piece)}
            />
            </g>
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
                <label className="block text-[10px] font-medium text-gray-500 mb-0.5">Edge / side</label>
                <select
                  value={popoverPosition}
                  onChange={e => setPopoverPosition(e.target.value)}
                  className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">Select side</option>
                  {JOIN_POSITIONS.map(position => (
                    <option key={position} value={position}>{joinPositionLabel(position)}</option>
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
            const parentRelationship = relationships.find(r => r.childPieceId === pieceIdStr);
            const parentPiece = parentRelationship
              ? pieceMap.get(parentRelationship.parentPieceId)
              : null;
            const parentJoinLabel = formatJoinPosition(parentRelationship?.joinPosition);
            const parentRelationshipLabel = parentRelationship
              ? `${humaniseRelationshipType(parentRelationship.relationshipType)}${
                  parentJoinLabel ? ` - ${parentJoinLabel}` : ''
                } of ${parentPiece?.name ?? parentPiece?.description ?? 'parent piece'}`
              : null;

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
                  <span className="flex items-center gap-1.5 min-w-0">
                    {isMultiSelected && (
                      <svg className="h-3 w-3 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    <span className="font-medium text-gray-700 truncate">{pieceName}</span>
                    {parentRelationshipLabel && (
                      <span
                        className="text-[10px] font-medium text-blue-700 bg-blue-50 border border-blue-100 rounded px-1.5 py-0.5 flex-shrink-0"
                        title={parentRelationshipLabel}
                      >
                        Attached
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400 flex-shrink-0 ml-2">
                    {getPieceDisplayTotal(piece) != null ? formatCurrency(getPieceDisplayTotal(piece)!) : '\u2014'}
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
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="h-3 w-3 text-blue-500 rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                    <span className="text-xs font-semibold text-gray-800 truncate">{pieceName}</span>
                    {parentRelationshipLabel && (
                      <span
                        className="text-[10px] font-medium text-blue-700 bg-white/70 border border-blue-200 rounded px-1.5 py-0.5 flex-shrink-0"
                        title={parentRelationshipLabel}
                      >
                        {parentRelationshipLabel}
                      </span>
                    )}
                  </div>
                  <span className="text-xs font-medium text-blue-700">
                    {getPieceDisplayTotal(piece) != null ? formatCurrency(getPieceDisplayTotal(piece)!) : '\u2014'}
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
                      const suppression = getSuppressedEdgeDisplay(piece, side);
                      const code = suppression?.code ?? edgeCode(edgeValue);
                      const colour = suppression?.colour ?? edgeColour(edgeValue);
                      const isRaw = !suppression && (!edgeValue || edgeValue.toLowerCase().includes('raw'));
                      return (
                        <span
                          key={side}
                          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium border cursor-pointer hover:opacity-80 transition-opacity ${
                            isRaw
                              ? 'bg-gray-50 text-gray-400 border-gray-200'
                              : 'text-white border-transparent'
                          }`}
                          style={!isRaw ? { backgroundColor: colour } : undefined}
                          title={suppression?.label ?? `${side}: ${edgeValue ?? 'Raw'} — click to change`}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (suppression) {
                              toast.error('Use the relationship or wall-edge controls for this edge');
                              return;
                            }
                            if (onPieceEdgeChange && visibleEdgeProfiles.length > 0) {
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
                  {(() => {
                    const pieceFab = piece.fabricationCategory;
                    const filteredCutoutTypes = pieceFab
                      ? cutoutTypes.filter(ct => !ct.configuredCategories || ct.configuredCategories.length === 0 || ct.configuredCategories.includes(pieceFab))
                      : cutoutTypes;
                    return (cutoutCount > 0 || (onPieceCutoutAdd && filteredCutoutTypes.length > 0)) ? (
                      <div className="flex items-center gap-2">
                        <span className="text-gray-400 w-4 text-center">&#x1F52A;</span>
                        <span className="text-gray-600">
                          {cutoutCount > 0
                            ? `${cutoutCount} cutout${cutoutCount !== 1 ? 's' : ''}: ${
                                getCutoutItems(piece).map(cutout => `${cutout.quantity}× ${cutout.name}`).join(', ')
                              }`
                            : 'No cutouts'}
                        </span>
                        {onPieceCutoutAdd && filteredCutoutTypes.length > 0 && (
                          <select
                            value=""
                            onChange={e => {
                              if (e.target.value) onPieceCutoutAdd(pieceIdStr, e.target.value);
                            }}
                            onClick={e => e.stopPropagation()}
                            className="px-1 py-0.5 text-[10px] border border-gray-200 rounded bg-white text-blue-600 hover:border-gray-300 cursor-pointer"
                          >
                            <option value="">+ Add</option>
                            {filteredCutoutTypes.map(ct => (
                              <option key={ct.id} value={ct.id}>{ct.name}</option>
                            ))}
                          </select>
                        )}
                        {!pieceFab && (
                          <span className="text-[9px] text-amber-500" title="No fabrication category set — showing all cutout types">⚠️</span>
                        )}
                      </div>
                    ) : null;
                  })()}

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
                          const joinLabel = formatJoinPosition(r.joinPosition);
                          return `${display?.label ?? r.relationshipType}${joinLabel ? ` - ${joinLabel}` : ''} -> ${otherName}`;
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
