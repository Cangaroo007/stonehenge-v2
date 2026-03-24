'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { edgeColour, edgeCode, cutoutLabel } from '@/lib/utils/edge-utils';
import EdgeProfilePopover from './EdgeProfilePopover';
import type { EdgeScope } from './EdgeProfilePopover';
import type {
  ShapeType, ShapeConfig, LShapeConfig, UShapeConfig,
  RadiusEndConfig, FullCircleConfig, ConcaveArcConfig, RoundedRectConfig,
} from '@/lib/types/shapes';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface EdgeTypeOption {
  id: string;
  name: string;
  code?: string;
}

interface CutoutDisplay {
  id: string;
  typeId: string;
  typeName: string;
  quantity: number;
}

export type EdgeSide = 'top' | 'right' | 'bottom' | 'left';
/** Extended edge identifiers for L-shape (6 edges) and U-shape (8 edges) */
export type ShapeEdgeSide =
  | EdgeSide
  | 'r_top' | 'r_btm' | 'inner'  // L-shape
  | 'top_left' | 'top_right' | 'outer_left' | 'outer_right' | 'inner_left' | 'inner_right' | 'back_inner'  // U-shape
  | 'arc_end' | 'arc_body'  // RADIUS_END / FULL_CIRCLE
  | 'arc_left' | 'arc_right' | 'arc_inner' | 'arc_outer'  // CONCAVE_ARC
  | 'corner_tl' | 'corner_tr' | 'corner_bl' | 'corner_br';  // ROUNDED_RECT corners
type EdgeEditMode = 'select' | 'quickEdge';

// ─── Edge Layout Presets ─────────────────────────────────────────────────────

export interface EdgePreset {
  id: string;
  label: string;
  /** Which sides get the selected profile. Others get null. */
  sides: Array<'top' | 'bottom' | 'left' | 'right'>;
  /** If true, always sets all edges to null regardless of selected profile */
  allRaw?: boolean;
}

export const EDGE_PRESETS: EdgePreset[] = [
  { id: 'all-raw',              label: 'All Raw',              sides: [],                              allRaw: true },
  { id: 'front-only',           label: 'Front Only',           sides: ['bottom'] },
  { id: 'front-return-right',   label: 'Front + Return',       sides: ['bottom', 'right'] },
  { id: 'front-return-left',    label: 'Front + Left Return',  sides: ['bottom', 'left'] },
  { id: 'front-both-returns',   label: 'Front + Both Returns', sides: ['bottom', 'left', 'right'] },
  { id: 'front-back',           label: 'Front + Back',         sides: ['bottom', 'top'] },
  { id: 'island',               label: 'All',                   sides: ['top', 'bottom', 'left', 'right'] },
];

export function PresetThumbnail({ sides }: { sides: Array<'top' | 'bottom' | 'left' | 'right'> }) {
  const active = 'stroke-stone-700';
  const inactive = 'stroke-gray-200';
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
      {/* top */}
      <line x1="2" y1="2"  x2="30" y2="2"
        className={sides.includes('top')    ? active : inactive} strokeWidth="2.5" />
      {/* bottom */}
      <line x1="2" y1="18" x2="30" y2="18"
        className={sides.includes('bottom') ? active : inactive} strokeWidth="2.5" />
      {/* left */}
      <line x1="2" y1="2"  x2="2"  y2="18"
        className={sides.includes('left')   ? active : inactive} strokeWidth="2.5" />
      {/* right */}
      <line x1="30" y1="2" x2="30" y2="18"
        className={sides.includes('right')  ? active : inactive} strokeWidth="2.5" />
    </svg>
  );
}

/** Edge segment definition for shape rendering */
interface ShapeEdgeDef {
  side: ShapeEdgeSide;
  x1: number; y1: number;
  x2: number; y2: number;
  labelX: number; labelY: number;
  lengthMm: number;
  label: string;
  arcPath?: string;
}

interface EdgeTemplate {
  id: string;
  name: string;
  description?: string | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  isBuiltIn: boolean;
  suggestedPieceType?: string | null;
}

export interface PieceVisualEditorProps {
  /** Piece dimensions in mm */
  lengthMm: number;
  widthMm: number;

  /** Edge type IDs per side (null = raw / unfinished) */
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;

  /** Resolved edge type names for display (looked up from edgeTypes) */
  edgeTypes: EdgeTypeOption[];

  /** Cutouts on the piece */
  cutouts: CutoutDisplay[];

  /** Oversize join position from left edge (mm) */
  joinAtMm?: number;

  /** Whether the piece is in edit mode */
  isEditMode: boolean;

  /** Whether lamination method is mitred */
  isMitred?: boolean;

  /** Initial quick edge profile to pre-select when the editor mounts (syncs from summary row) */
  initialQuickEdgeProfile?: string | null;

  /** Called when an edge profile changes (edit mode) */
  onEdgeChange?: (side: EdgeSide, profileId: string | null) => void;

  /** Called when multiple edges change at once (template apply, multi-select) */
  onEdgesChange?: (edges: { top?: string | null; bottom?: string | null; left?: string | null; right?: string | null }) => void;

  /** Called to add a cutout (edit mode) */
  onCutoutAdd?: (cutoutTypeId: string) => void;

  /** Called to remove a cutout (edit mode) */
  onCutoutRemove?: (cutoutId: string) => void;

  /** Available cutout types for the add dialog */
  cutoutTypes?: Array<{ id: string; name: string; baseRate: number }>;

  /** Callback for bulk apply — applies edges to scope */
  onBulkApply?: (
    edges: { top: string | null; bottom: string | null; left: string | null; right: string | null },
    scope: 'room' | 'quote'
  ) => void;

  /** Room name for scope selector labels */
  roomName?: string;

  /** Room ID for scope selector filtering */
  roomId?: string;

  /** Callback for scope-aware edge profile application (clickedSide = edge that was clicked) */
  onApplyWithScope?: (profileId: string | null, scope: EdgeScope, clickedSide: string) => void;

  /** Quote ID for per-quote recents strip persistence */
  quoteId?: string | number;

  /** Shape type for L/U shape rendering (defaults to RECTANGLE) */
  shapeType?: ShapeType;

  /** Shape configuration with leg dimensions (required for L/U shapes) */
  shapeConfig?: ShapeConfig;

  /** Called when a shape_config edge changes (INNER, R-BTM, etc.) */
  onShapeEdgeChange?: (edgeId: string, profileId: string | null) => void;

  /** Edge profiles stored in shape_config.edges (keyed by raw edge id) */
  shapeConfigEdges?: Record<string, string | null>;

  /** Edges marked as wall edges (no lamination strip) */
  noStripEdges?: string[];

  /** Build-up depth per edge side — used to show e.g. "MIT 40mm" in labels */
  edgeBuildups?: Record<string, { depth: number }> | null;
  /** Relationship type per edge side — used to show WF or SB instead of N-STR */
  attachedPieceTypes?: Record<string, 'WATERFALL' | 'SPLASHBACK'>;

  /** Called when wall edge state changes for the piece */
  onNoStripEdgesChange?: (noStripEdges: string[]) => void;

  /** Piece attach context — needed for "Attach Waterfall / Splashback" from edge panel */
  pieceId?: number;
  pieceName?: string;
  pieceThickness?: number;
  pieceMaterialId?: number | null;

  /** Called after a waterfall/splashback is created from edge attach.
   *  Receives the new piece ID so the parent can navigate to it. */
  onPieceAttached?: (newPieceId: number) => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const SVG_PADDING = 80;
const MAX_HEIGHT = 300;
const EDGE_HIT_WIDTH = 24;
const ALL_SIDES: EdgeSide[] = ['top', 'bottom', 'left', 'right'];

/** Map of edge profile short codes to full display names (fallback when DB name unavailable) */
export const EDGE_PROFILE_NAMES: Record<string, string> = {
  'RAW': 'Raw / Unfinished',
  'PR': 'Pencil Round',
  'BN': 'Bullnose',
  'HBN': 'Half Bullnose',
  'FE': 'Full Eased',
  'OG': 'Ogee',
  'BV': 'Bevel',
  'M': 'Mitre',
  'MIT': 'Mitre',
  'CML': 'Chamfer',
  'P': 'Polished',
  'WAT': 'Waterfall',
};

/** Get the full display name for an edge profile code or name */
export function getEdgeProfileFullName(codeOrName: string | undefined): string {
  if (!codeOrName) return 'Raw / Unfinished';
  return EDGE_PROFILE_NAMES[codeOrName] || codeOrName;
}

// ── Component ───────────────────────────────────────────────────────────────

export default function PieceVisualEditor({
  lengthMm,
  widthMm,
  edgeTop,
  edgeBottom,
  edgeLeft,
  edgeRight,
  edgeTypes,
  cutouts,
  joinAtMm,
  isEditMode,
  isMitred = false,
  initialQuickEdgeProfile,
  onEdgeChange,
  onEdgesChange,
  onCutoutAdd,
  onCutoutRemove,
  cutoutTypes = [],
  onBulkApply,
  roomName,
  roomId,
  onApplyWithScope,
  quoteId,
  shapeType = 'RECTANGLE',
  shapeConfig,
  onShapeEdgeChange,
  shapeConfigEdges,
  noStripEdges = [],
  edgeBuildups,
  attachedPieceTypes,
  onNoStripEdgesChange,
  pieceId,
  pieceName,
  pieceThickness,
  pieceMaterialId,
  onPieceAttached,
}: PieceVisualEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{
    side: EdgeSide;
    x: number;
    y: number;
  } | null>(null);
  const [showCutoutDialog, setShowCutoutDialog] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null);
  const [hoveredCutout, setHoveredCutout] = useState<string | null>(null);
  // Popover for shape_config edges (INNER, R-BTM, etc.)
  const [shapeEdgePopover, setShapeEdgePopover] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);

  // ── Multi-select & Quick Edge mode state ──────────────────────────────
  const [editMode, setEditMode] = useState<EdgeEditMode>('quickEdge');
  const [selectedEdges, setSelectedEdges] = useState<Set<EdgeSide>>(new Set());
  const [selectedArcEdges, setSelectedArcEdges] = useState<Set<string>>(new Set());
  const [quickEdgeProfile, setQuickEdgeProfile] = useState<string | null>(initialQuickEdgeProfile ?? null);
  const [flashEdge, setFlashEdge] = useState<EdgeSide | null>(null);

  // ── Template state ────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<EdgeTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templatesFetched, setTemplatesFetched] = useState(false);

  // ── Preset state ─────────────────────────────────────────────────────
  const [presetMessage, setPresetMessage] = useState<string | null>(null);

  // ── Bulk apply state ──────────────────────────────────────────────────
  const [bulkApplyInfo, setBulkApplyInfo] = useState<{
    templateName: string;
    edges: { top: string | null; bottom: string | null; left: string | null; right: string | null };
  } | null>(null);

  // ── Scope selector state (shows after multi-select profile apply) ──
  const [scopeApplyInfo, setScopeApplyInfo] = useState<{
    profileName: string;
    profileId: string | null;
    sides: EdgeSide[];
  } | null>(null);

  // ── Shortcuts tooltip ─────────────────────────────────────────────────
  const [showShortcuts, setShowShortcuts] = useState(false);

  // ── Recents strip state (per-quote, persisted to localStorage) ─────
  const recentsKey = quoteId ? `quote-edge-recents-${quoteId}` : null;
  const [recentProfiles, setRecentProfiles] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    if (!recentsKey) return [];
    try {
      const stored = localStorage.getItem(recentsKey);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Initialise recents with defaults if empty and edgeTypes are loaded
  useEffect(() => {
    if (recentProfiles.length > 0 || edgeTypes.length === 0) return;
    // Default recents: Arris, Pencil Round, Raw (find by name match)
    const defaultNames = ['arris', 'pencil round', 'raw'];
    const defaults: string[] = [];
    for (const searchName of defaultNames) {
      const match = edgeTypes.find(
        (et) => et.name.toLowerCase().includes(searchName)
      );
      if (match) defaults.push(match.id);
    }
    if (defaults.length > 0) {
      setRecentProfiles(defaults);
      if (recentsKey) {
        try { localStorage.setItem(recentsKey, JSON.stringify(defaults)); } catch { /* noop */ }
      }
    }
  }, [recentProfiles.length, edgeTypes, recentsKey]);

  // ── Edge attach state (waterfall / splashback) ─────────────────────────
  const [grainMatch, setGrainMatch] = useState(false);
  const [edgeAttachments, setEdgeAttachments] = useState<any[]>([]);

  const handleAttachPiece = async (type: 'WATERFALL' | 'SPLASHBACK', side: string) => {
    if (!quoteId || !pieceId) return;

    const edgeLength = (side === 'left' || side === 'right')
      ? (widthMm ?? 600)
      : (lengthMm ?? 2400);

    const newPieceData = {
      name: `${type === 'WATERFALL' ? 'Waterfall' : 'Splashback'} \u2014 ${side.toUpperCase()} edge of ${pieceName ?? 'Piece'}`,
      pieceType: type,
      shapeType: 'RECTANGLE',
      lengthMm: edgeLength,
      widthMm: type === 'WATERFALL' ? (widthMm ?? 600) : null,
      thicknessMm: type === 'SPLASHBACK' ? 20 : (pieceThickness ?? 20),
      materialId: pieceMaterialId ?? null,
      laminationMethod: type === 'WATERFALL' ? 'MITRED' : 'NONE',
    };

    const pieceRes = await fetch(`/api/quotes/${quoteId}/pieces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPieceData),
    });
    const pieceJson = await pieceRes.json();
    const newPiece = pieceJson.piece ?? pieceJson;

    await fetch(`/api/quotes/${quoteId}/piece-relationships`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sourcePieceId: pieceId,
        targetPieceId: newPiece.id,
        relationType: type,
        side,
        grainMatch,
      }),
    });

    if (onPieceAttached) {
      onPieceAttached(newPiece.id);
    }
  };

  const handleDetach = async (relationshipId: number) => {
    if (!quoteId) return;
    await fetch(
      `/api/quotes/${quoteId}/piece-relationships?relationshipId=${relationshipId}`,
      { method: 'DELETE' }
    );
    setEdgeAttachments(prev => prev.filter(r => r.id !== relationshipId));
  };

  const updateRecents = useCallback(
    (profileId: string) => {
      setRecentProfiles((prev) => {
        const updated = [profileId, ...prev.filter((p) => p !== profileId)].slice(0, 5);
        if (recentsKey) {
          try { localStorage.setItem(recentsKey, JSON.stringify(updated)); } catch { /* noop */ }
        }
        return updated;
      });
    },
    [recentsKey]
  );

  // ── Fetch templates on first open ─────────────────────────────────────
  useEffect(() => {
    if (!isEditMode || templatesFetched) return;
    fetch('/api/edge-templates')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: EdgeTemplate[]) => {
        setTemplates(data);
        setTemplatesFetched(true);
      })
      .catch(() => setTemplatesFetched(true));
  }, [isEditMode, templatesFetched]);

  // ── Resolve edge names ────────────────────────────────────────────────

  const resolveEdgeName = useCallback(
    (edgeId: string | null): string | undefined => {
      if (!edgeId) return undefined;
      return edgeTypes.find((e) => e.id === edgeId)?.name;
    },
    [edgeTypes]
  );

  const edgeNames = useMemo(
    () => ({
      top: resolveEdgeName(edgeTop),
      bottom: resolveEdgeName(edgeBottom),
      left: resolveEdgeName(edgeLeft),
      right: resolveEdgeName(edgeRight),
    }),
    [edgeTop, edgeBottom, edgeLeft, edgeRight, resolveEdgeName]
  );

  const edgeIds: Record<EdgeSide, string | null> = useMemo(
    () => ({ top: edgeTop, bottom: edgeBottom, left: edgeLeft, right: edgeRight }),
    [edgeTop, edgeBottom, edgeLeft, edgeRight]
  );

  // ── SVG sizing ────────────────────────────────────────────────────────

  const layout = useMemo(() => {
    const aspectRatio = lengthMm / widthMm;
    const maxInnerWidth = 500;
    const maxInnerHeight = MAX_HEIGHT - SVG_PADDING * 2;

    let innerW: number;
    let innerH: number;

    if (aspectRatio > maxInnerWidth / maxInnerHeight) {
      innerW = maxInnerWidth;
      innerH = maxInnerWidth / aspectRatio;
    } else {
      innerH = maxInnerHeight;
      innerW = maxInnerHeight * aspectRatio;
    }

    innerW = Math.max(innerW, 100);
    innerH = Math.max(innerH, 40);

    const svgW = innerW + SVG_PADDING * 2;
    const svgH = innerH + SVG_PADDING * 2;

    return { svgW, svgH, innerW, innerH, x: SVG_PADDING, y: SVG_PADDING };
  }, [lengthMm, widthMm]);

  // ── Helpers ───────────────────────────────────────────────────────────

  const clearSelection = useCallback(() => {
    setSelectedEdges(new Set());
    setSelectedArcEdges(new Set());
    setPopover(null);
  }, []);

  const selectAllEdges = useCallback(() => {
    setSelectedEdges(new Set(ALL_SIDES));
  }, []);

  const applyProfileToSelected = useCallback(
    (profileId: string | null) => {
      if (selectedEdges.size === 0) return;
      const sides = Array.from(selectedEdges);
      if (onEdgesChange) {
        const changes: Record<string, string | null> = {};
        selectedEdges.forEach((side) => {
          changes[side] = profileId;
        });
        onEdgesChange(changes as { top?: string | null; bottom?: string | null; left?: string | null; right?: string | null });
      } else if (onEdgeChange) {
        selectedEdges.forEach((side) => {
          onEdgeChange(side, profileId);
        });
      }
      clearSelection();

      // Show scope selector if bulk apply is available
      if (onBulkApply) {
        const profileName = profileId
          ? (edgeTypes.find(e => e.id === profileId)?.name ?? 'Profile')
          : 'Raw';
        setScopeApplyInfo({ profileName, profileId, sides });
      }
    },
    [selectedEdges, onEdgesChange, onEdgeChange, clearSelection, onBulkApply, edgeTypes]
  );

  const applyProfileByIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= edgeTypes.length) return;
      const profile = edgeTypes[index];
      if (editMode === 'quickEdge') {
        setQuickEdgeProfile(profile.id);
      } else if (selectedEdges.size > 0) {
        applyProfileToSelected(profile.id);
      }
    },
    [edgeTypes, editMode, selectedEdges.size, applyProfileToSelected]
  );

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleEdgeClick = useCallback(
    (side: EdgeSide, event: React.MouseEvent) => {
      if (!isEditMode || (!onEdgeChange && !onEdgesChange)) return;
      event.stopPropagation();

      if (editMode === 'quickEdge') {
        // Quick Edge mode: instantly apply selected profile
        if (quickEdgeProfile !== null) {
          if (onEdgeChange) onEdgeChange(side, quickEdgeProfile);
          // Update recents strip
          updateRecents(quickEdgeProfile);
          // Flash animation
          setFlashEdge(side);
          setTimeout(() => setFlashEdge(null), 200);
        }
        return;
      }

      // Select mode
      if (event.shiftKey) {
        // Multi-select toggle
        setSelectedEdges((prev) => {
          const next = new Set(prev);
          if (next.has(side)) {
            next.delete(side);
          } else {
            next.add(side);
          }
          return next;
        });
        setPopover(null);
        return;
      }

      // Single click — if no selection, open popover (backwards compatible)
      if (selectedEdges.size === 0) {
        const svgRect = (event.currentTarget as SVGElement)
          .closest('svg')
          ?.getBoundingClientRect();
        if (!svgRect) return;

        const relX = event.clientX - svgRect.left;
        const relY = event.clientY - svgRect.top;
        setPopover({ side, x: relX, y: relY });
        return;
      }

      // Single click with existing selection — toggle this edge
      setSelectedEdges((prev) => {
        const next = new Set(prev);
        if (next.has(side)) {
          next.delete(side);
        } else {
          next.add(side);
        }
        return next;
      });
    },
    [isEditMode, onEdgeChange, onEdgesChange, editMode, quickEdgeProfile, selectedEdges.size, updateRecents]
  );

  const handleProfileSelect = useCallback(
    (profileId: string | null) => {
      if (!popover || !onEdgeChange) return;
      onEdgeChange(popover.side, profileId);
      if (profileId) updateRecents(profileId);
      setPopover(null);
    },
    [popover, onEdgeChange, updateRecents]
  );

  // Wrapper for scope-aware apply — captures the clicked side from popover state
  const handlePopoverApplyWithScope = useCallback(
    (profileId: string | null, scope: EdgeScope) => {
      if (!onApplyWithScope || !popover) return;
      onApplyWithScope(profileId, scope, popover.side);
      setPopover(null);
    },
    [onApplyWithScope, popover]
  );

  const handleCutoutAddClick = useCallback(
    (cutoutTypeId: string) => {
      if (onCutoutAdd) onCutoutAdd(cutoutTypeId);
      setShowCutoutDialog(false);
    },
    [onCutoutAdd]
  );

  const handleWallEdgeToggle = useCallback((edgeKey: string) => {
    if (!onNoStripEdgesChange) return;
    const current = noStripEdges ?? [];
    const updated = current.includes(edgeKey)
      ? current.filter(k => k !== edgeKey)
      : [...current, edgeKey];
    onNoStripEdgesChange(updated);
  }, [noStripEdges, onNoStripEdgesChange]);

  const handleSvgClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Click on empty space clears selection and closes shape edge popover
      if (editMode === 'select' && selectedEdges.size > 0) {
        clearSelection();
      }
      setShapeEdgePopover(null);
    },
    [editMode, selectedEdges.size, clearSelection]
  );

  const handleTemplateApply = useCallback(
    (template: EdgeTemplate) => {
      const edges = {
        top: template.edgeTop,
        bottom: template.edgeBottom,
        left: template.edgeLeft,
        right: template.edgeRight,
      };

      if (onEdgesChange) {
        onEdgesChange(edges);
      } else if (onEdgeChange) {
        onEdgeChange('top', edges.top);
        onEdgeChange('bottom', edges.bottom);
        onEdgeChange('left', edges.left);
        onEdgeChange('right', edges.right);
      }

      setShowTemplates(false);

      // Show bulk apply prompt if handler available
      if (onBulkApply) {
        setBulkApplyInfo({ templateName: template.name, edges });
      }
    },
    [onEdgesChange, onEdgeChange, onBulkApply]
  );

  // ── Effective shape type (fallback to RECTANGLE if config missing) ───
  const effectiveShapeType: ShapeType = useMemo(() => {
    if (shapeType === 'L_SHAPE' && shapeConfig?.shape === 'L_SHAPE') return 'L_SHAPE';
    if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') return 'U_SHAPE';
    if (shapeType === 'RADIUS_END' && shapeConfig?.shape === 'RADIUS_END') return 'RADIUS_END';
    if (shapeType === 'FULL_CIRCLE' && shapeConfig?.shape === 'FULL_CIRCLE') return 'FULL_CIRCLE';
    if (shapeType === 'CONCAVE_ARC' && shapeConfig?.shape === 'CONCAVE_ARC') return 'CONCAVE_ARC';
    if (shapeType === 'ROUNDED_RECT' && shapeConfig?.shape === 'ROUNDED_RECT') return 'ROUNDED_RECT';
    return 'RECTANGLE';
  }, [shapeType, shapeConfig]);

  const handlePresetApply = useCallback((preset: EdgePreset) => {
    if (!onEdgesChange) return;

    if (!preset.allRaw && !quickEdgeProfile) {
      setPresetMessage('Select an edge profile first');
      setTimeout(() => setPresetMessage(null), 2000);
      return;
    }

    const profileId = preset.allRaw ? null : quickEdgeProfile;
    onEdgesChange({
      top:    preset.sides.includes('top')    ? profileId : null,
      bottom: preset.sides.includes('bottom') ? profileId : null,
      left:   preset.sides.includes('left')   ? profileId : null,
      right:  preset.sides.includes('right')  ? profileId : null,
    });

    // ROUNDED_RECT: also apply to all 4 corner arcs
    if (effectiveShapeType === 'ROUNDED_RECT' && onShapeEdgeChange) {
      const cornerProfileId = preset.allRaw ? null : (preset.sides.length === 4 ? profileId : null);
      onShapeEdgeChange('corner_tl', cornerProfileId);
      onShapeEdgeChange('corner_tr', cornerProfileId);
      onShapeEdgeChange('corner_bl', cornerProfileId);
      onShapeEdgeChange('corner_br', cornerProfileId);
    }
  }, [onEdgesChange, quickEdgeProfile, effectiveShapeType, onShapeEdgeChange]);

  const handleBulkApply = useCallback(
    (scope: 'room' | 'quote') => {
      if (!bulkApplyInfo || !onBulkApply) return;
      onBulkApply(bulkApplyInfo.edges, scope);
      setBulkApplyInfo(null);
    },
    [bulkApplyInfo, onBulkApply]
  );

  const handleScopeApply = useCallback(
    (scope: 'room' | 'quote') => {
      if (!scopeApplyInfo || !onBulkApply) return;
      // Build edges object: apply profileId only to the selected sides
      const edges = {
        top: edgeTop,
        bottom: edgeBottom,
        left: edgeLeft,
        right: edgeRight,
      };
      // Override the sides that were selected
      for (const side of scopeApplyInfo.sides) {
        edges[side] = scopeApplyInfo.profileId;
      }
      onBulkApply(edges, scope);
      setScopeApplyInfo(null);
    },
    [scopeApplyInfo, onBulkApply, edgeTop, edgeBottom, edgeLeft, edgeRight]
  );

  // ── Keyboard shortcuts ────────────────────────────────────────────────

  useEffect(() => {
    if (!isEditMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

      switch (e.key.toLowerCase()) {
        case 's':
          e.preventDefault();
          setEditMode('select');
          break;
        case 'p':
          e.preventDefault();
          setEditMode('quickEdge');
          break;
        case 'a':
          e.preventDefault();
          selectAllEdges();
          break;
        case 'escape':
          clearSelection();
          setEditMode('select');
          setQuickEdgeProfile(null);
          setBulkApplyInfo(null);
          setScopeApplyInfo(null);
          break;
        case 't':
          e.preventDefault();
          setShowTemplates((prev) => !prev);
          break;
        default:
          if (/^[1-9]$/.test(e.key)) {
            e.preventDefault();
            applyProfileByIndex(parseInt(e.key) - 1);
          }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEditMode, selectAllEdges, clearSelection, applyProfileByIndex]);

  // ── Edge rendering data ───────────────────────────────────────────────

  const isCompact = useMemo(
    () => Math.min(lengthMm, widthMm) < 300,
    [lengthMm, widthMm]
  );

  const edgeDefs = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    return {
      top: {
        x1: x, y1: y, x2: x + innerW, y2: y,
        labelX: x + innerW / 2, labelY: y - 24, lengthMm: lengthMm,
      },
      bottom: {
        x1: x, y1: y + innerH, x2: x + innerW, y2: y + innerH,
        labelX: x + innerW / 2, labelY: y + innerH + 28, lengthMm: lengthMm,
      },
      left: {
        x1: x, y1: y, x2: x, y2: y + innerH,
        labelX: x - 24, labelY: y + innerH / 2, lengthMm: widthMm,
      },
      right: {
        x1: x + innerW, y1: y, x2: x + innerW, y2: y + innerH,
        labelX: x + innerW + 24, labelY: y + innerH / 2, lengthMm: widthMm,
      },
    };
  }, [layout, lengthMm, widthMm]);


  // ── L/U shape layout & edge definitions ─────────────────────────────
  const shapeLayout = useMemo(() => {
    if (effectiveShapeType === 'RECTANGLE') return null;

    const { x, y } = layout;

    if (effectiveShapeType === 'L_SHAPE') {
      const cfg = shapeConfig as unknown as LShapeConfig;
      if (!cfg.leg1 || !cfg.leg2) return null;
      const l1l = cfg.leg1.length_mm;  // leg1 length (horizontal top)
      const l1w = cfg.leg1.width_mm;   // leg1 width (vertical top part)
      const l2w = cfg.leg2.width_mm;   // leg2 width (horizontal bottom, narrower)
      const l2l = cfg.leg2.length_mm;  // leg2 length (vertical bottom part)

      // Bounding box in mm
      const boundW = l1l;
      const boundH = l1w + l2l;

      // Scale to fit available inner area
      const maxInnerWidth = 500;
      const maxInnerHeight = MAX_HEIGHT - SVG_PADDING * 2;
      const scaleX = maxInnerWidth / boundW;
      const scaleY = maxInnerHeight / boundH;
      const scale = Math.min(scaleX, scaleY);

      const sw = Math.max(boundW * scale, 100);
      const sh = Math.max(boundH * scale, 40);

      // Scaled dimensions
      const sL1L = (l1l / boundW) * sw;
      const sL1W = (l1w / boundH) * sh;
      const sL2W = (l2w / boundW) * sw;
      const sL2L = (l2l / boundH) * sh;

      // SVG path points (top-left origin)
      // P0(0,0) → P1(l1l,0) → P2(l1l,l1w) → P3(l2w,l1w) → P4(l2w,l1w+l2l) → P5(0,l1w+l2l)
      const p0 = { x: x, y: y };
      const p1 = { x: x + sL1L, y: y };
      const p2 = { x: x + sL1L, y: y + sL1W };
      const p3 = { x: x + sL2W, y: y + sL1W };
      const p4 = { x: x + sL2W, y: y + sL1W + sL2L };
      const p5 = { x: x, y: y + sL1W + sL2L };

      const path = `M ${p0.x},${p0.y} L ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} L ${p5.x},${p5.y} Z`;

      const svgW = sw + SVG_PADDING * 2;
      const svgH = sh + SVG_PADDING * 2;

      // Edge label offset from edge midpoint
      const lo = 24;

      const leg2Net = l2l - l1w;
      const edges: ShapeEdgeDef[] = [
        {
          side: 'top', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
          labelX: (p0.x + p1.x) / 2, labelY: p0.y - lo,
          lengthMm: l1l, label: 'TOP',
        },
        {
          side: 'r_top', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          labelX: p1.x + lo, labelY: (p1.y + p2.y) / 2,
          lengthMm: l2w, label: 'R-TOP',
        },
        {
          side: 'inner', x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y,
          labelX: (p2.x + p3.x) / 2, labelY: p2.y - lo,
          lengthMm: l1l - l2w, label: 'INNER',
        },
        {
          side: 'r_btm', x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y,
          labelX: p3.x + lo, labelY: (p3.y + p4.y) / 2,
          lengthMm: leg2Net, label: 'R-BTM',
        },
        {
          side: 'bottom', x1: p4.x, y1: p4.y, x2: p5.x, y2: p5.y,
          labelX: (p4.x + p5.x) / 2, labelY: p4.y + lo + 4,
          lengthMm: leg2Net, label: 'BTM',
        },
        {
          side: 'left', x1: p5.x, y1: p5.y, x2: p0.x, y2: p0.y,
          labelX: p5.x - lo, labelY: (p5.y + p0.y) / 2,
          lengthMm: l1w, label: 'LEFT',
        },
      ];

      return { path, edges, svgW, svgH };
    }

    if (effectiveShapeType === 'U_SHAPE') {
      const cfg = shapeConfig as unknown as UShapeConfig;
      if (!cfg.leftLeg || !cfg.back || !cfg.rightLeg) return null;
      const lw = cfg.leftLeg.width_mm;
      const ll = cfg.leftLeg.length_mm;   // full outer left height
      const bl = cfg.back.length_mm;      // full horizontal width
      const bw = cfg.back.width_mm;       // back section depth from bottom
      const rw = cfg.rightLeg.width_mm;
      const rl = cfg.rightLeg.length_mm;  // full outer right height

      // Bounding box in mm
      const boundW = bl;
      const boundH = Math.max(ll, rl);

      // Scale to fit available inner area
      const maxInnerWidth = 500;
      const maxInnerHeight = MAX_HEIGHT - SVG_PADDING * 2;
      const scaleX = maxInnerWidth / boundW;
      const scaleY = maxInnerHeight / boundH;
      const scale = Math.min(scaleX, scaleY);

      const sw = Math.max(boundW * scale, 100);
      const sh = Math.max(boundH * scale, 40);

      // Scaled dimensions
      const sLW = (lw / boundW) * sw;
      const sLL = (ll / boundH) * sh;
      const sBW = (bw / boundH) * sh;
      const sRW = (rw / boundW) * sw;
      const sRL = (rl / boundH) * sh;

      // U-shape opens at top, closed at bottom
      // Points clockwise from outer top-left:
      // P0(0,0) → P1(lw,0) → P2(lw,ll-bw) → P3(bl-rw,rl-bw) → P4(bl-rw,0) → P5(bl,0) → P6(bl,rl) → P7(0,ll)
      const sInnerLeftY = sLL - sBW;  // inner-left bottom (where back starts)
      const sInnerRightY = sRL - sBW; // inner-right bottom

      const p0 = { x: x, y: y };
      const p1 = { x: x + sLW, y: y };
      const p2 = { x: x + sLW, y: y + sInnerLeftY };
      const p3 = { x: x + sw - sRW, y: y + sInnerRightY };
      const p4 = { x: x + sw - sRW, y: y };
      const p5 = { x: x + sw, y: y };
      const p6 = { x: x + sw, y: y + sRL };
      const p7 = { x: x, y: y + sLL };

      const path = `M ${p0.x},${p0.y} L ${p1.x},${p1.y} L ${p2.x},${p2.y} L ${p3.x},${p3.y} L ${p4.x},${p4.y} L ${p5.x},${p5.y} L ${p6.x},${p6.y} L ${p7.x},${p7.y} Z`;

      const svgW = sw + SVG_PADDING * 2;
      const svgH = sh + SVG_PADDING * 2;

      const lo = 24;

      const bottomSpan = lw + bl + rw;
      const edges: ShapeEdgeDef[] = [
        {
          side: 'top_left', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
          labelX: (p0.x + p1.x) / 2, labelY: p0.y - lo,
          lengthMm: lw, label: 'T-LEFT',
        },
        {
          side: 'inner_left', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          labelX: p1.x + lo, labelY: (p1.y + p2.y) / 2,
          lengthMm: ll - bw, label: 'IN-L',
        },
        {
          side: 'back_inner', x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y,
          labelX: (p2.x + p3.x) / 2, labelY: Math.max(p2.y, p3.y) + lo,
          lengthMm: bl, label: 'BACK',
        },
        {
          side: 'inner_right', x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y,
          labelX: p3.x - lo, labelY: (p3.y + p4.y) / 2,
          lengthMm: rl - bw, label: 'IN-R',
        },
        {
          side: 'top_right', x1: p4.x, y1: p4.y, x2: p5.x, y2: p5.y,
          labelX: (p4.x + p5.x) / 2, labelY: p4.y - lo,
          lengthMm: rw, label: 'T-RIGHT',
        },
        {
          side: 'outer_right', x1: p5.x, y1: p5.y, x2: p6.x, y2: p6.y,
          labelX: p5.x + lo, labelY: (p5.y + p6.y) / 2,
          lengthMm: rl, label: 'RIGHT',
        },
        {
          side: 'bottom', x1: p6.x, y1: p6.y, x2: p7.x, y2: p7.y,
          labelX: (p6.x + p7.x) / 2, labelY: Math.max(p6.y, p7.y) + lo + 4,
          lengthMm: bottomSpan, label: 'BTM',
        },
        {
          side: 'outer_left', x1: p7.x, y1: p7.y, x2: p0.x, y2: p0.y,
          labelX: p7.x - lo, labelY: (p7.y + p0.y) / 2,
          lengthMm: ll, label: 'LEFT',
        },
      ];

      return { path, edges, svgW, svgH };
    }

    if (effectiveShapeType === 'RADIUS_END') {
      const cfg = shapeConfig as RadiusEndConfig;
      const W = cfg.length_mm ?? lengthMm;
      const H = cfg.width_mm ?? widthMm;
      const R = Math.min(cfg.radius_mm ?? H / 2, H / 2);
      const bothEnds = cfg.curved_ends === 'BOTH';

      const scale = Math.min(
        (500 - SVG_PADDING * 2) / W,
        (300 - SVG_PADDING * 2) / H
      );
      const sW = W * scale;
      const sH = H * scale;
      const sR = R * scale;
      const ox = SVG_PADDING;
      const oy = SVG_PADDING;
      const svgW = sW + SVG_PADDING * 2;
      const svgH = sH + SVG_PADDING * 2;

      // Path: rectangle with arc on right end (and optionally left end)
      let path: string;
      if (bothEnds) {
        path = [
          `M ${ox + sR},${oy}`,
          `L ${ox + sW - sR},${oy}`,
          `A ${sR},${sR} 0 0 1 ${ox + sW - sR},${oy + sH}`,
          `L ${ox + sR},${oy + sH}`,
          `A ${sR},${sR} 0 0 1 ${ox + sR},${oy}`,
          'Z',
        ].join(' ');
      } else {
        path = [
          `M ${ox},${oy}`,
          `L ${ox + sW - sR},${oy}`,
          `A ${sR},${sR} 0 0 1 ${ox + sW - sR},${oy + sH}`,
          `L ${ox},${oy + sH}`,
          'Z',
        ].join(' ');
      }

      const arcLengthMm = Math.PI * R;
      const edges: ShapeEdgeDef[] = [
        { side: 'top', x1: ox, y1: oy, x2: ox + sW - sR, y2: oy,
          labelX: ox + (sW - sR) / 2, labelY: oy - 12,
          lengthMm: W - R, label: 'Top' },
        { side: 'bottom', x1: ox, y1: oy + sH, x2: ox + sW - sR, y2: oy + sH,
          labelX: ox + (sW - sR) / 2, labelY: oy + sH + 16,
          lengthMm: W - R, label: 'Bottom' },
        { side: 'left', x1: ox, y1: oy, x2: ox, y2: oy + sH,
          labelX: ox - 16, labelY: oy + sH / 2,
          lengthMm: H, label: 'Left' },
        { side: 'arc_end', x1: ox + sW - sR, y1: oy, x2: ox + sW - sR, y2: oy + sH,
          labelX: ox + sW + 8, labelY: oy + sH / 2,
          lengthMm: arcLengthMm, label: 'Arc',
          arcPath: `M ${ox + sW - sR},${oy} A ${sR},${sR} 0 0 1 ${ox + sW - sR},${oy + sH}` },
      ];

      return { path, edges, svgW, svgH };
    }

    if (effectiveShapeType === 'FULL_CIRCLE') {
      const cfg = shapeConfig as FullCircleConfig;
      const D = cfg.diameter_mm ?? 900;
      const R = D / 2;

      const scale = (400 - SVG_PADDING * 2) / D;
      const sR = R * scale;
      const cx = SVG_PADDING + sR;
      const cy = SVG_PADDING + sR;
      const svgW = D * scale + SVG_PADDING * 2;
      const svgH = D * scale + SVG_PADDING * 2;

      // Two 180° arcs — SVG cannot render a full 360° arc in one command
      const path = [
        `M ${cx - sR},${cy}`,
        `A ${sR},${sR} 0 1 1 ${cx + sR},${cy}`,
        `A ${sR},${sR} 0 1 1 ${cx - sR},${cy}`,
        'Z',
      ].join(' ');

      const edges: ShapeEdgeDef[] = [
        { side: 'arc_body', x1: cx + sR, y1: cy, x2: cx + sR * 1.2, y2: cy,
          labelX: cx + sR + 12, labelY: cy,
          lengthMm: Math.PI * D, label: 'Circumference',
          arcPath: path },
      ];

      return { path, edges, svgW, svgH };
    }

    if (effectiveShapeType === 'CONCAVE_ARC') {
      const cfg = shapeConfig as ConcaveArcConfig;
      const innerR = cfg.inner_radius_mm ?? 1200;
      const depth = cfg.depth_mm ?? 600;
      const sweepDeg = cfg.sweep_deg ?? 90;
      const sweepRad = (sweepDeg * Math.PI) / 180;
      const halfSweep = sweepRad / 2;
      const outerR = innerR + depth;

      // Chord width at outer radius
      const chordW = 2 * outerR * Math.sin(halfSweep);
      const chordH = outerR - outerR * Math.cos(halfSweep);

      const scale = Math.min(
        (500 - SVG_PADDING * 2) / chordW,
        (400 - SVG_PADDING * 2) / chordH
      );
      const svgW = chordW * scale + SVG_PADDING * 2;
      const svgH = chordH * scale + SVG_PADDING * 2;
      const ox = SVG_PADDING;
      const oy = SVG_PADDING;

      const sInnerR = innerR * scale;
      const sOuterR = outerR * scale;
      const cx = svgW / 2;
      const arcCY = oy + sOuterR; // arc centre below top of SVG

      // Outer arc endpoints
      const oxL = cx - sOuterR * Math.sin(halfSweep);
      const oyL = arcCY - sOuterR * Math.cos(halfSweep);
      const oxR = cx + sOuterR * Math.sin(halfSweep);
      const oyR = arcCY - sOuterR * Math.cos(halfSweep);

      // Inner arc endpoints
      const ixL = cx - sInnerR * Math.sin(halfSweep);
      const iyL = arcCY - sInnerR * Math.cos(halfSweep);
      const ixR = cx + sInnerR * Math.sin(halfSweep);
      const iyR = arcCY - sInnerR * Math.cos(halfSweep);

      const largeArc = sweepDeg > 180 ? 1 : 0;

      const path = [
        `M ${oxL},${oyL}`,
        `A ${sOuterR},${sOuterR} 0 ${largeArc} 1 ${oxR},${oyR}`,
        `L ${ixR},${iyR}`,
        `A ${sInnerR},${sInnerR} 0 ${largeArc} 0 ${ixL},${iyL}`,
        'Z',
      ].join(' ');

      const innerArcLengthMm = innerR * sweepRad;
      const outerArcLengthMm = outerR * sweepRad;
      const sideHeightMm = depth;

      const edges: ShapeEdgeDef[] = [
        { side: 'arc_outer', x1: oxL, y1: oyL, x2: oxR, y2: oyR,
          labelX: cx, labelY: oy - 12,
          lengthMm: outerArcLengthMm, label: 'Outer arc' },
        { side: 'arc_inner', x1: ixL, y1: iyL, x2: ixR, y2: iyR,
          labelX: cx, labelY: arcCY - sInnerR + 12,
          lengthMm: innerArcLengthMm, label: 'Inner arc' },
        { side: 'arc_left', x1: oxL, y1: oyL, x2: ixL, y2: iyL,
          labelX: oxL - 20, labelY: (oyL + iyL) / 2,
          lengthMm: sideHeightMm, label: 'Left' },
        { side: 'arc_right', x1: oxR, y1: oyR, x2: ixR, y2: iyR,
          labelX: oxR + 8, labelY: (oyR + iyR) / 2,
          lengthMm: sideHeightMm, label: 'Right' },
      ];

      return { path, edges, svgW, svgH };
    }

    if (effectiveShapeType === 'ROUNDED_RECT') {
      const cfg = shapeConfig as RoundedRectConfig;
      const W = cfg.length_mm ?? lengthMm;
      const H = cfg.width_mm ?? widthMm;

      const scale = Math.min(
        (500 - SVG_PADDING * 2) / W,
        (300 - SVG_PADDING * 2) / H
      );
      const sW = W * scale;
      const sH = H * scale;
      const ox = SVG_PADDING;
      const oy = SVG_PADDING;
      const svgW = sW + SVG_PADDING * 2;
      const svgH = sH + SVG_PADDING * 2;

      // Resolve per-corner radii, capped to half the smallest dimension
      const maxR = Math.min(W / 2, H / 2);
      const tlMm = Math.min(cfg.individual_corners ? cfg.corner_tl_mm : cfg.corner_radius_mm, maxR);
      const trMm = Math.min(cfg.individual_corners ? cfg.corner_tr_mm : cfg.corner_radius_mm, maxR);
      const brMm = Math.min(cfg.individual_corners ? cfg.corner_br_mm : cfg.corner_radius_mm, maxR);
      const blMm = Math.min(cfg.individual_corners ? cfg.corner_bl_mm : cfg.corner_radius_mm, maxR);

      const tl = tlMm * scale;
      const tr = trMm * scale;
      const br = brMm * scale;
      const bl = blMm * scale;

      // SVG path: start top-left after corner, go clockwise
      const path = [
        `M ${ox + tl} ${oy}`,
        `L ${ox + sW - tr} ${oy}`,
        `A ${tr} ${tr} 0 0 1 ${ox + sW} ${oy + tr}`,
        `L ${ox + sW} ${oy + sH - br}`,
        `A ${br} ${br} 0 0 1 ${ox + sW - br} ${oy + sH}`,
        `L ${ox + bl} ${oy + sH}`,
        `A ${bl} ${bl} 0 0 1 ${ox} ${oy + sH - bl}`,
        `L ${ox} ${oy + tl}`,
        `A ${tl} ${tl} 0 0 1 ${ox + tl} ${oy}`,
        'Z',
      ].join(' ');

      // 4 straight edge segments — each length subtracts corner radii at each end
      const edges: ShapeEdgeDef[] = [
        { side: 'top', x1: ox + tl, y1: oy, x2: ox + sW - tr, y2: oy,
          labelX: ox + sW / 2, labelY: oy - 12,
          lengthMm: W - tlMm - trMm, label: 'Top' },
        { side: 'right', x1: ox + sW, y1: oy + tr, x2: ox + sW, y2: oy + sH - br,
          labelX: ox + sW + 16, labelY: oy + sH / 2,
          lengthMm: H - trMm - brMm, label: 'Right' },
        { side: 'bottom', x1: ox + sW - br, y1: oy + sH, x2: ox + bl, y2: oy + sH,
          labelX: ox + sW / 2, labelY: oy + sH + 16,
          lengthMm: W - blMm - brMm, label: 'Bottom' },
        { side: 'left', x1: ox, y1: oy + sH - bl, x2: ox, y2: oy + tl,
          labelX: ox - 16, labelY: oy + sH / 2,
          lengthMm: H - tlMm - blMm, label: 'Left' },
      ];

      // Corner arc definitions for clickable hit areas + labels
      // Each corner: centre point, radius, start/end angles, arc path, label position
      const MID_ANGLE = Math.PI / 4; // 45° — midpoint of 90° quarter circle
      const cornerArcs: Array<{
        side: string;
        label: string;
        arcPath: string;
        labelX: number;
        labelY: number;
        radius: number;
      }> = [];

      if (tl > 0) {
        const cx = ox + tl, cy = oy + tl;
        // TL arc: from (ox, oy+tl) to (ox+tl, oy) — 270° to 360° (or -90° to 0°)
        cornerArcs.push({
          side: 'corner_tl', label: 'TL',
          arcPath: `M ${ox} ${cy} A ${tl} ${tl} 0 0 1 ${cx} ${oy}`,
          labelX: cx - tl * Math.cos(MID_ANGLE) - 10,
          labelY: cy - tl * Math.sin(MID_ANGLE) - 10,
          radius: tl,
        });
      }
      if (tr > 0) {
        const cx = ox + sW - tr, cy = oy + tr;
        // TR arc: from (cx, oy) to (ox+sW, cy) — 0° to 90°
        cornerArcs.push({
          side: 'corner_tr', label: 'TR',
          arcPath: `M ${cx} ${oy} A ${tr} ${tr} 0 0 1 ${ox + sW} ${cy}`,
          labelX: cx + tr * Math.cos(MID_ANGLE) + 10,
          labelY: cy - tr * Math.sin(MID_ANGLE) - 10,
          radius: tr,
        });
      }
      if (br > 0) {
        const cx = ox + sW - br, cy = oy + sH - br;
        // BR arc: from (ox+sW, cy) to (cx, oy+sH) — 90° to 180°
        cornerArcs.push({
          side: 'corner_br', label: 'BR',
          arcPath: `M ${ox + sW} ${cy} A ${br} ${br} 0 0 1 ${cx} ${oy + sH}`,
          labelX: cx + br * Math.cos(MID_ANGLE) + 10,
          labelY: cy + br * Math.sin(MID_ANGLE) + 10,
          radius: br,
        });
      }
      if (bl > 0) {
        const cx = ox + bl, cy = oy + sH - bl;
        // BL arc: from (cx, oy+sH) to (ox, cy) — 180° to 270°
        cornerArcs.push({
          side: 'corner_bl', label: 'BL',
          arcPath: `M ${cx} ${oy + sH} A ${bl} ${bl} 0 0 1 ${ox} ${cy}`,
          labelX: cx - bl * Math.cos(MID_ANGLE) - 10,
          labelY: cy + bl * Math.sin(MID_ANGLE) + 10,
          radius: bl,
        });
      }

      return { path, edges, svgW, svgH, cornerArcs };
    }

    return null;
  }, [effectiveShapeType, shapeConfig, layout]);

  // ── Cutout positions ──────────────────────────────────────────────────

  const cutoutPositions = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    const pad = 8;

    // For L/U shapes, constrain cutouts to the first leg's area (not the empty corner)
    let cutoutAreaX = x;
    let cutoutAreaY = y;
    let cutoutAreaW = innerW;
    let cutoutAreaH = innerH;

    if (effectiveShapeType === 'L_SHAPE' && shapeConfig) {
      const cfg = shapeConfig as unknown as LShapeConfig;
      if (cfg.leg1 && cfg.leg2) {
        const boundW = cfg.leg1.length_mm;
        const boundH = cfg.leg1.width_mm + cfg.leg2.length_mm;
        // Scale leg1 proportionally to the rendered size
        cutoutAreaW = (cfg.leg1.length_mm / boundW) * innerW;
        cutoutAreaH = (cfg.leg1.width_mm / boundH) * innerH;
      }
    } else if (effectiveShapeType === 'U_SHAPE' && shapeConfig) {
      const cfg = shapeConfig as unknown as UShapeConfig;
      if (cfg.leftLeg && cfg.back) {
        const boundW = cfg.back.length_mm;
        const boundH = cfg.leftLeg.length_mm;
        // Constrain to back section (bottom horizontal bar)
        const backH = (cfg.back.width_mm / boundH) * innerH;
        cutoutAreaY = y + innerH - backH;
        cutoutAreaW = (cfg.back.length_mm / boundW) * innerW;
        cutoutAreaH = backH;
      }
    }

    // Filter out cutouts with missing/invalid data to prevent crashes
    const safeCutouts = cutouts.filter(c => c && typeof c === 'object' && c.typeName);

    return safeCutouts.map((cutout, idx) => {
      const lower = (cutout.typeName || 'unknown').toLowerCase();
      let cw: number;
      let ch: number;
      let shape: 'rect' | 'circle' | 'oval' | 'lines';

      if (lower.includes('undermount') || lower.includes('sink')) {
        cw = cutoutAreaW * 0.35; ch = cutoutAreaH * 0.45; shape = 'rect';
      } else if (lower.includes('hotplate') || lower.includes('cooktop') || lower.includes('flush')) {
        cw = cutoutAreaW * 0.25; ch = cutoutAreaH * 0.4; shape = 'rect';
      } else if (lower.includes('tap')) {
        cw = 16; ch = 16; shape = 'circle';
      } else if (lower.includes('gpo')) {
        cw = 18; ch = 18; shape = 'rect';
      } else if (lower.includes('basin')) {
        cw = cutoutAreaW * 0.2; ch = cutoutAreaH * 0.35; shape = 'oval';
      } else if (lower.includes('drainer') || lower.includes('groove')) {
        cw = cutoutAreaW * 0.25; ch = cutoutAreaH * 0.35; shape = 'lines';
      } else {
        cw = cutoutAreaW * 0.15; ch = cutoutAreaH * 0.3; shape = 'rect';
      }

      const totalCutouts = safeCutouts.length;
      const slotW = (cutoutAreaW - pad * 2) / totalCutouts;
      const cx = cutoutAreaX + pad + slotW * idx + slotW / 2;
      const cy = cutoutAreaY + cutoutAreaH / 2;

      return { ...cutout, cx, cy, w: cw, h: ch, shape };
    });
  }, [cutouts, layout, effectiveShapeType, shapeConfig]);

  // ── Join line position ────────────────────────────────────────────────

  const joinLineX = useMemo(() => {
    if (joinAtMm == null) return null;
    const ratio = joinAtMm / lengthMm;
    return layout.x + layout.innerW * ratio;
  }, [joinAtMm, lengthMm, layout]);

  // ── Legend ────────────────────────────────────────────────────────────

  const legendItems = useMemo(() => {
    const items: Array<{ code: string; name: string; colour: string }> = [];
    const seen = new Set<string>();

    const addIfPresent = (id: string | null) => {
      if (!id || seen.has(id)) return;
      seen.add(id);
      const name = resolveEdgeName(id);
      if (name) {
        items.push({ code: edgeCode(name), name, colour: edgeColour(name) });
      }
    };

    addIfPresent(edgeTop);
    addIfPresent(edgeBottom);
    addIfPresent(edgeLeft);
    addIfPresent(edgeRight);
    // Include profiles from shape_config.edges for L/U shapes
    if (shapeConfigEdges) {
      for (const profileId of Object.values(shapeConfigEdges)) {
        addIfPresent(profileId);
      }
    }

    items.push({ code: 'R', name: 'Raw', colour: '#d1d5db' });
    return items;
  }, [edgeTop, edgeBottom, edgeLeft, edgeRight, shapeConfigEdges, resolveEdgeName]);

  // Check if piece has at least one non-raw edge (for save template button)
  const hasNonRawEdge = !!(edgeTop || edgeBottom || edgeLeft || edgeRight);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Mitred edge read-only label ──────────────────────────────── */}
      {isMitred && isEditMode && (
        <p className="text-xs text-gray-500 italic px-3 py-2">
          Mitred edge — corner treatment set in piece editor.
        </p>
      )}

      {/* ── Edit Mode Toolbar ──────────────────────────────────────────── */}
      {isEditMode && onEdgeChange && !isMitred && (
        <div className="flex items-center gap-1 mb-2 px-1 flex-wrap">
          {/* Mode buttons — Quick Edge first (default mode) */}
          <div className="flex rounded-md border border-gray-200 overflow-hidden">
            <button
              onClick={() => { setEditMode('quickEdge'); clearSelection(); }}
              className={`px-2 py-1 text-[10px] font-medium transition-colors ${
                editMode === 'quickEdge'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="Quick Edge mode (P)"
            >
              Quick Edge
            </button>
            <button
              onClick={() => { setEditMode('select'); clearSelection(); }}
              className={`px-2 py-1 text-[10px] font-medium border-l border-gray-200 transition-colors ${
                editMode === 'select'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}
              title="Select mode (S)"
            >
              Select
            </button>
          </div>

          {/* Profile dropdown (Quick Edge mode or numbered reference) */}
          {editMode === 'quickEdge' && (
            <select
              value={quickEdgeProfile ?? ''}
              onChange={(e) => setQuickEdgeProfile(e.target.value || null)}
              className="px-2 py-1 text-[10px] border border-gray-200 rounded-md bg-white text-gray-700 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              title="Select profile for Quick Edge"
            >
              <option value="">Pick profile...</option>
              <option value="">Raw (no finish)</option>
              {edgeTypes.map((et, idx) => (
                <option key={et.id} value={et.id}>
                  {idx + 1}. {et.name}
                </option>
              ))}
            </select>
          )}

          {/* Select All button */}
          {editMode === 'select' && (
            <button
              onClick={selectAllEdges}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
              title="Select all edges (A)"
            >
              All edges
            </button>
          )}

          {/* RADIUS_END — Both Ends pill */}
          {editMode === 'select' &&
            effectiveShapeType === 'RADIUS_END' &&
            (shapeConfig as any)?.curved_ends === 'BOTH' && (
            <button
              onClick={() => setSelectedArcEdges(new Set(['arc_end_start', 'arc_end_end']))}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
              title="Select both arc ends"
            >
              Both ends
            </button>
          )}

          {/* ROUNDED_RECT — All Corners pill */}
          {editMode === 'select' &&
            effectiveShapeType === 'ROUNDED_RECT' && (
            <button
              onClick={() => setSelectedArcEdges(new Set(['corner_tl', 'corner_tr', 'corner_bl', 'corner_br']))}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
              title="Select all corner arcs"
            >
              All corners
            </button>
          )}

          {/* Separator */}
          <span className="text-gray-300 mx-0.5">|</span>

          {/* Templates dropdown */}
          <div className="relative">
            <button
              onClick={() => setShowTemplates(!showTemplates)}
              className="px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
              title="Edge templates (T)"
            >
              Templates
            </button>
            {showTemplates && (
              <EdgeTemplatePickerInline
                templates={templates}
                edgeTypes={edgeTypes}
                onApply={handleTemplateApply}
                onClose={() => setShowTemplates(false)}
              />
            )}
          </div>

          {/* Save as template */}
          {hasNonRawEdge && (
            <div className="relative">
              <button
                onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                className="px-2 py-1 text-[10px] font-medium text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-md transition-colors"
                title="Save current edges as template"
              >
                Save
              </button>
              {showSaveTemplate && (
                <SaveEdgeTemplateInline
                  edgeTop={edgeTop}
                  edgeBottom={edgeBottom}
                  edgeLeft={edgeLeft}
                  edgeRight={edgeRight}
                  edgeTypes={edgeTypes}
                  resolveEdgeName={resolveEdgeName}
                  onSaved={(newTemplate) => {
                    setTemplates((prev) => [...prev, newTemplate]);
                    setShowSaveTemplate(false);
                  }}
                  onClose={() => setShowSaveTemplate(false)}
                />
              )}
            </div>
          )}

          {/* Shortcuts hint */}
          <div className="relative ml-auto">
            <button
              onMouseEnter={() => setShowShortcuts(true)}
              onMouseLeave={() => setShowShortcuts(false)}
              className="px-1.5 py-1 text-[10px] text-gray-400 hover:text-gray-600"
              title="Keyboard shortcuts"
            >
              KB
            </button>
            {showShortcuts && (
              <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-2 min-w-[160px]">
                <div className="text-[10px] font-semibold text-gray-500 mb-1">Shortcuts</div>
                {[
                  ['P', 'Quick Edge mode'],
                  ['S', 'Select mode'],
                  ['A', 'Select all edges'],
                  ['Esc', 'Clear selection'],
                  ['T', 'Toggle templates'],
                  ['1-9', 'Quick profile'],
                ].map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between text-[10px] text-gray-600 py-0.5">
                    <span className="font-mono bg-gray-100 px-1 rounded text-gray-700">{key}</span>
                    <span className="ml-2">{desc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── Recents Strip (Quick Edge mode, above SVG) ─────────────── */}
      {isEditMode && !isMitred && editMode === 'quickEdge' && recentProfiles.length > 0 && (
        <div className="flex items-center gap-1 mb-1 px-1">
          <span className="text-[9px] text-gray-400 mr-0.5">Recent:</span>
          {recentProfiles.map((profileId) => {
            const et = edgeTypes.find((e) => e.id === profileId);
            if (!et) return null;
            const isActive = quickEdgeProfile === profileId;
            // Abbreviate long names: "Pencil Round" → "P.Round"
            const abbrev = et.name.length > 10
              ? et.name.split(/\s+/).map((w) => w.length > 3 ? w[0] + '.' : w).join('')
              : et.name;
            return (
              <button
                key={profileId}
                onClick={() => setQuickEdgeProfile(profileId)}
                className={`px-2 py-0.5 text-[10px] font-medium rounded-full border transition-colors ${
                  isActive
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50 hover:border-gray-300'
                }`}
                title={et.name}
              >
                {abbrev}
              </button>
            );
          })}
        </div>
      )}

      {/* ── SVG Diagram ────────────────────────────────────────────────── */}
      <svg
        viewBox={`0 0 ${shapeLayout?.svgW ?? layout.svgW} ${shapeLayout?.svgH ?? layout.svgH}`}
        className="w-full max-w-lg"
        style={{ maxHeight: MAX_HEIGHT }}
        preserveAspectRatio="xMidYMid meet"
        onClick={handleSvgClick}
      >
        {/* Flash animation def */}
        <defs>
          <style>{`
            @keyframes edge-flash {
              0% { stroke: #22c55e; stroke-width: 5; }
              100% { stroke: inherit; stroke-width: inherit; }
            }
            .edge-flash { animation: edge-flash 200ms ease-out; }
            @keyframes edge-pulse {
              0%, 100% { stroke-opacity: 1; }
              50% { stroke-opacity: 0.5; }
            }
            .edge-selected { animation: edge-pulse 1s ease-in-out infinite; }
          `}</style>
        </defs>

        {/* ── L/U shape outline ──────────────────────────────────── */}
        {shapeLayout && (
          <>
            <path
              d={shapeLayout.path}
              fill="#f5f5f5"
              stroke="#e5e7eb"
              strokeWidth={1}
            />

            {/* Shape edges — all finishable, all stored in shape_config.edges */}
            {shapeLayout.edges.map((edge) => {
              // For shaped pieces: ALL edges read from shapeConfigEdges
              const isWallEdge = noStripEdges.includes(edge.side);
              const profileId = (() => {
                // RADIUS_END: arc_end comes from shapeConfigEdges (edge_arc_config).
                // Straight edges (top, bottom, left, right) come from rectangle edge columns.
                if (shapeType === 'RADIUS_END' && edge.side !== 'arc_end') {
                  const rectEdges: Record<string, string | null> = { top: edgeTop, bottom: edgeBottom, left: edgeLeft, right: edgeRight };
                  return rectEdges[edge.side] ?? null;
                }
                return shapeConfigEdges?.[edge.side] ?? null;
              })();
              const name = isWallEdge ? undefined : (profileId ? resolveEdgeName(profileId) : undefined);
              const isFinished = !isWallEdge && !!profileId;
              const colour = isWallEdge ? '#78716c' : edgeColour(name);
              const code = isWallEdge ? 'N-STR' : edgeCode(name);
              const isHorizontal = Math.abs(edge.y2 - edge.y1) < Math.abs(edge.x2 - edge.x1);
              const isHovered = hoveredEdge === edge.side;

              return (
                <g key={edge.side}>
                  {/* Hover glow (edit mode only) */}
                  {isHovered && isEditMode && (
                    edge.arcPath ? (
                      <path
                        d={edge.arcPath}
                        fill="none"
                        stroke="#3b82f6" strokeWidth={10} opacity={0.15}
                        className="pointer-events-none transition-opacity duration-100"
                      />
                    ) : (
                      <line
                        x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                        stroke="#3b82f6" strokeWidth={10} opacity={0.15}
                        className="pointer-events-none transition-opacity duration-100"
                      />
                    )
                  )}

                  {/* Visible edge line */}
                  {edge.arcPath ? (
                    <path
                      d={edge.arcPath}
                      fill="none"
                      stroke={colour}
                      strokeWidth={isFinished ? 3 : 1}
                      strokeDasharray={isFinished ? undefined : '4 3'}
                    >
                      <title>{name || 'Raw / Unfinished'}</title>
                    </path>
                  ) : (
                    <line
                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                      stroke={colour}
                      strokeWidth={isFinished ? 3 : 1}
                      strokeDasharray={isFinished ? undefined : '4 3'}
                      opacity={1}
                    >
                      <title>{name || 'Raw / Unfinished'}</title>
                    </line>
                  )}

                  {/* Hit area for clicking — all shaped edges go through onShapeEdgeChange */}
                  {isEditMode && onShapeEdgeChange && (
                    edge.arcPath ? (
                      <path
                        d={edge.arcPath}
                        fill="none"
                        stroke="transparent"
                        strokeWidth={20}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editMode === 'quickEdge' && quickEdgeProfile !== null) {
                            onShapeEdgeChange(edge.side, quickEdgeProfile);
                            updateRecents(quickEdgeProfile);
                            return;
                          }
                          if (e.shiftKey) {
                            setSelectedArcEdges(prev => {
                              const next = new Set(prev);
                              if (next.has(edge.side)) { next.delete(edge.side); } else { next.add(edge.side); }
                              return next;
                            });
                            return;
                          }
                          const svgRect = (e.currentTarget as SVGElement)
                            .closest('svg')
                            ?.getBoundingClientRect();
                          if (!svgRect) return;
                          const relX = e.clientX - svgRect.left;
                          const relY = e.clientY - svgRect.top;
                          setShapeEdgePopover({ edgeId: edge.side, x: relX, y: relY });
                        }}
                        onMouseEnter={() => setHoveredEdge(edge.side)}
                        onMouseLeave={() => setHoveredEdge(null)}
                      >
                        <title>{name || 'Raw / Unfinished'}</title>
                      </path>
                    ) : (
                      <line
                        x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                        stroke="transparent" strokeWidth={EDGE_HIT_WIDTH}
                        style={{ cursor: 'pointer' }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (editMode === 'quickEdge' && quickEdgeProfile !== null) {
                            onShapeEdgeChange(edge.side, quickEdgeProfile);
                            updateRecents(quickEdgeProfile);
                            return;
                          }
                          if (e.shiftKey) {
                            setSelectedArcEdges(prev => {
                              const next = new Set(prev);
                              if (next.has(edge.side)) { next.delete(edge.side); } else { next.add(edge.side); }
                              return next;
                            });
                            return;
                          }
                          const svgRect = (e.currentTarget as SVGElement)
                            .closest('svg')
                            ?.getBoundingClientRect();
                          if (!svgRect) return;
                          const relX = e.clientX - svgRect.left;
                          const relY = e.clientY - svgRect.top;
                          setShapeEdgePopover({ edgeId: edge.side, x: relX, y: relY });
                        }}
                        onMouseEnter={() => setHoveredEdge(edge.side)}
                        onMouseLeave={() => setHoveredEdge(null)}
                      >
                        <title>{name || 'Raw / Unfinished'}</title>
                      </line>
                    )
                  )}

                  {/* Edge label with profile indicator and side abbreviation */}
                  <g>
                    {/* Coloured dot indicator */}
                    <circle
                      cx={edge.labelX + (isHorizontal ? -8 : 0)}
                      cy={edge.labelY + (isHorizontal ? 0 : -8)}
                      r={3}
                      fill={colour}
                    />
                    <text
                      x={edge.labelX + (isHorizontal ? 4 : 0)}
                      y={edge.labelY + (isHorizontal ? 0 : 4)}
                      textAnchor={isHorizontal ? 'middle' : (edge.labelX < (shapeLayout.svgW / 2) ? 'end' : 'start')}
                      dominantBaseline="middle"
                      className={`select-none ${isFinished ? 'text-[9px] font-semibold' : 'text-[8px]'}`}
                      fill={colour}
                    >
                      <title>{isWallEdge ? 'Against wall' : (name || 'Raw / Unfinished')}</title>
                      {(() => {
                        if (isWallEdge) {
                          const attachedType = attachedPieceTypes?.[edge.side];
                          if (attachedType === 'WATERFALL') return `WF ${edge.label}`;
                          if (attachedType === 'SPLASHBACK') return `SB ${edge.label}`;
                          return `N-STR ${edge.label}`;
                        }
                        if (!isFinished) return `RAW ${edge.label}`;
                        const depth = edgeBuildups?.[edge.side]?.depth;
                        if (depth) return `${code} ${depth}mm`;
                        return `${code} ${edge.label}`;
                      })()}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* ── ROUNDED_RECT corner arcs — clickable hit areas + labels ── */}
            {shapeLayout.cornerArcs?.map((arc) => {
              const profileId = shapeConfigEdges?.[arc.side] ?? null;
              const name = profileId ? resolveEdgeName(profileId) : undefined;
              const isFinished = !!profileId;
              const colour = edgeColour(name);
              const code = edgeCode(name);
              const isHovered = hoveredEdge === arc.side;

              return (
                <g key={arc.side}>
                  {/* Hover glow */}
                  {isHovered && isEditMode && (
                    <path
                      d={arc.arcPath}
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth={10}
                      opacity={0.15}
                      className="pointer-events-none transition-opacity duration-100"
                    />
                  )}

                  {/* Visible arc */}
                  <path
                    d={arc.arcPath}
                    fill="none"
                    stroke={colour}
                    strokeWidth={isFinished ? 3 : 1}
                    strokeDasharray={isFinished ? undefined : '4 3'}
                  >
                    <title>{name || 'Raw / Unfinished'}</title>
                  </path>

                  {/* Hit area for clicking */}
                  {isEditMode && onShapeEdgeChange && (
                    <path
                      d={arc.arcPath}
                      fill="none"
                      stroke="transparent"
                      strokeWidth={20}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editMode === 'quickEdge' && quickEdgeProfile !== null) {
                          onShapeEdgeChange(arc.side, quickEdgeProfile);
                          updateRecents(quickEdgeProfile);
                          return;
                        }
                        if (e.shiftKey) {
                          setSelectedArcEdges(prev => {
                            const next = new Set(prev);
                            if (next.has(arc.side)) { next.delete(arc.side); } else { next.add(arc.side); }
                            return next;
                          });
                          return;
                        }
                        const svgRect = (e.currentTarget as SVGElement)
                          .closest('svg')
                          ?.getBoundingClientRect();
                        if (!svgRect) return;
                        const relX = e.clientX - svgRect.left;
                        const relY = e.clientY - svgRect.top;
                        setShapeEdgePopover({ edgeId: arc.side, x: relX, y: relY });
                      }}
                      onMouseEnter={() => setHoveredEdge(arc.side)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    >
                      <title>{name || 'Raw / Unfinished'}</title>
                    </path>
                  )}

                  {/* Corner edge label */}
                  <g>
                    <circle
                      cx={arc.labelX}
                      cy={arc.labelY}
                      r={3}
                      fill={colour}
                    />
                    <text
                      x={arc.labelX}
                      y={arc.labelY + 12}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      className={`select-none ${isFinished ? 'text-[9px] font-semibold' : 'text-[8px]'}`}
                      fill={colour}
                    >
                      <title>{name || 'Raw / Unfinished'}</title>
                      {isFinished ? `${code} ${arc.label}` : `RAW ${arc.label}`}
                    </text>
                  </g>
                </g>
              );
            })}
          </>
        )}

        {/* ── Rectangle outline (default) ──────────────────────── */}
        {!shapeLayout && (
          <rect
            x={layout.x}
            y={layout.y}
            width={layout.innerW}
            height={layout.innerH}
            fill="#f5f5f5"
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        )}

        {/* ── Rectangle-only: join line, edges, dimension labels ─── */}
        {!shapeLayout && (
          <>
            {/* Join line (oversize) */}
            {joinLineX != null && (
              <>
                <line
                  x1={joinLineX}
                  y1={layout.y - 4}
                  x2={joinLineX}
                  y2={layout.y + layout.innerH + 4}
                  stroke="#f59e0b"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                />
                <text
                  x={joinLineX}
                  y={layout.y - 40}
                  textAnchor="middle"
                  className="text-[8px] fill-amber-600"
                >
                  Join at {joinAtMm}mm
                </text>
              </>
            )}

            {/* Edges */}
            {(Object.keys(edgeDefs) as EdgeSide[]).map((side) => {
              const def = edgeDefs[side];
              const isWallEdge = noStripEdges.includes(side);
              const name = isWallEdge ? undefined : edgeNames[side];
              const isFinished = !isWallEdge && !!edgeIds[side];
              const colour = isWallEdge ? '#78716c' : edgeColour(name);
              const code = isWallEdge ? 'N-STR' : edgeCode(name);
              const isHorizontal = side === 'top' || side === 'bottom';
              const isHovered = hoveredEdge === side;
              const isSelected = selectedEdges.has(side);
              const isFlashing = flashEdge === side;

              return (
                <g key={side}>
                  {/* Selected edge highlight (blue border underneath) */}
                  {isSelected && (
                    <line
                      x1={def.x1}
                      y1={def.y1}
                      x2={def.x2}
                      y2={def.y2}
                      stroke="#3b82f6"
                      strokeWidth={6}
                      className="edge-selected"
                    />
                  )}

                  {/* Hover highlight glow (edit mode only) */}
                  {isHovered && isEditMode && (
                    <line
                      x1={def.x1}
                      y1={def.y1}
                      x2={def.x2}
                      y2={def.y2}
                      stroke="#3b82f6"
                      strokeWidth={10}
                      opacity={0.15}
                      className="pointer-events-none transition-opacity duration-100"
                    />
                  )}

                  {/* Visible edge line */}
                  <line
                    x1={def.x1}
                    y1={def.y1}
                    x2={def.x2}
                    y2={def.y2}
                    stroke={isFlashing ? '#22c55e' : colour}
                    strokeWidth={isFlashing ? 5 : (isWallEdge ? 2 : (isFinished ? 3 : 1))}
                    strokeDasharray={isWallEdge ? '6 3' : (isFinished ? undefined : '4 3')}
                    opacity={1}
                    className={isFlashing ? 'edge-flash' : undefined}
                  >
                    <title>{isWallEdge ? 'Against wall' : (name || 'Raw / Unfinished')}</title>
                  </line>

                  {/* Hit area for clicking (edit mode only) */}
                  {isEditMode && (onEdgeChange || onEdgesChange) && (
                    <line
                      x1={def.x1}
                      y1={def.y1}
                      x2={def.x2}
                      y2={def.y2}
                      stroke="transparent"
                      strokeWidth={EDGE_HIT_WIDTH}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleEdgeClick(side, e)}
                      onMouseEnter={() => setHoveredEdge(side)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    >
                      <title>{isWallEdge ? 'Against wall' : (name || 'Raw / Unfinished')}</title>
                    </line>
                  )}

                  {/* Edge profile label */}
                  <text
                    x={def.labelX}
                    y={def.labelY}
                    textAnchor={isHorizontal ? 'middle' : side === 'left' ? 'end' : 'start'}
                    dominantBaseline={isHorizontal ? (side === 'top' ? 'auto' : 'hanging') : 'middle'}
                    className={`select-none ${
                      isWallEdge ? 'text-[9px] font-medium' : (isFinished ? 'text-[10px] font-semibold' : 'text-[9px]')
                    }`}
                    fill={colour}
                  >
                    <title>{isWallEdge ? 'Against wall' : (name || 'Raw / Unfinished')}</title>
                    {(() => {
                      if (isWallEdge) {
                        const attachedType = attachedPieceTypes?.[side];
                        if (attachedType === 'WATERFALL') return 'WF';
                        if (attachedType === 'SPLASHBACK') return 'SB';
                        return 'N-STR';
                      }
                      if (!isFinished) return 'RAW';
                      const depth = edgeBuildups?.[side]?.depth;
                      if (depth) return `${code} ${depth}mm`;
                      return isCompact ? code : `${code} — ${edgeNames[side]}`;
                    })()}
                  </text>
                </g>
              );
            })}

            {/* Dimension labels */}
            <text
              x={layout.x + layout.innerW / 2}
              y={layout.y - 10}
              textAnchor="middle"
              className="text-[10px] fill-gray-500 font-medium"
            >
              {lengthMm}mm
            </text>
            <text
              x={layout.x - 10}
              y={layout.y + layout.innerH / 2}
              textAnchor="middle"
              dominantBaseline="middle"
              className="text-[10px] fill-gray-500 font-medium"
              transform={`rotate(-90, ${layout.x - 10}, ${layout.y + layout.innerH / 2})`}
            >
              {widthMm}mm
            </text>
          </>
        )}

        {/* Cutouts */}
        {cutoutPositions.map((c) => (
          <g
            key={c.id}
            onMouseEnter={() => setHoveredCutout(c.id)}
            onMouseLeave={() => setHoveredCutout(null)}
          >
            <title>{c.typeName}{c.quantity > 1 ? ` (x${c.quantity})` : ''}</title>
            {c.shape === 'circle' ? (
              <circle cx={c.cx} cy={c.cy} r={c.w / 2} fill="none" stroke="#6b7280" strokeWidth={1} strokeDasharray="3 2" />
            ) : c.shape === 'oval' ? (
              <ellipse cx={c.cx} cy={c.cy} rx={c.w / 2} ry={c.h / 2} fill="none" stroke="#6b7280" strokeWidth={1} strokeDasharray="3 2" />
            ) : c.shape === 'lines' ? (
              <>
                <rect x={c.cx - c.w / 2} y={c.cy - c.h / 2} width={c.w} height={c.h} fill="none" stroke="#6b7280" strokeWidth={1} strokeDasharray="3 2" />
                {[0.25, 0.5, 0.75].map((frac) => (
                  <line key={frac} x1={c.cx - c.w / 2 + 3} y1={c.cy - c.h / 2 + c.h * frac} x2={c.cx + c.w / 2 - 3} y2={c.cy - c.h / 2 + c.h * frac} stroke="#9ca3af" strokeWidth={0.5} />
                ))}
              </>
            ) : (
              <rect x={c.cx - c.w / 2} y={c.cy - c.h / 2} width={c.w} height={c.h} fill="none" stroke="#6b7280" strokeWidth={1} strokeDasharray={(c.typeName || '').toLowerCase().includes('undermount') ? '4 2' : undefined} />
            )}

            <text x={c.cx} y={c.cy} textAnchor="middle" dominantBaseline="middle" className="text-[8px] fill-gray-500 select-none">
              {cutoutLabel(c.typeName)}
            </text>

            {isEditMode && onCutoutRemove && hoveredCutout === c.id && (
              <g onClick={(e) => { e.stopPropagation(); onCutoutRemove(c.id); }} style={{ cursor: 'pointer' }}>
                <circle cx={c.cx + c.w / 2 - 2} cy={c.cy - c.h / 2 + 2} r={6} fill="white" stroke="#ef4444" strokeWidth={1} />
                <text x={c.cx + c.w / 2 - 2} y={c.cy - c.h / 2 + 2} textAnchor="middle" dominantBaseline="middle" className="text-[8px] fill-red-500 font-bold select-none">
                  ✕
                </text>
              </g>
            )}
          </g>
        ))}
      </svg>

      {/* Edge profile popover (single-click with scope selector) */}
      {popover && (
        <>
          {isEditMode && onNoStripEdgesChange && (
            <div
              className="absolute z-50"
              style={{ left: popover.x, top: popover.y - 32 }}
            >
              <button
                onClick={() => handleWallEdgeToggle(popover.side)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  noStripEdges.includes(popover.side)
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {noStripEdges.includes(popover.side) ? 'Against wall' : 'Against wall'}
              </button>
              {noStripEdges.includes(popover.side) && (
                <span className="ml-2 text-xs text-slate-400">No lamination</span>
              )}
            </div>
          )}
          {!noStripEdges.includes(popover.side) && (
            <EdgeProfilePopover
              isOpen={true}
              position={{ x: popover.x, y: popover.y }}
              currentProfileId={edgeIds[popover.side]}
              profiles={edgeTypes}
              isMitred={isMitred}
              onSelect={handleProfileSelect}
              onClose={() => setPopover(null)}
              side={onApplyWithScope ? popover.side : undefined}
              roomName={roomName}
              roomId={roomId}
              onApplyWithScope={onApplyWithScope ? handlePopoverApplyWithScope : undefined}
            />
          )}
          {noStripEdges.includes(popover.side) && (
            <div
              className="absolute z-40 bg-white border border-slate-200 rounded-md shadow-lg p-2"
              style={{ left: popover.x, top: popover.y }}
            >
              <div className="text-xs text-slate-500">
                Wall edge — no profile or lamination strip
              </div>
              <button
                onClick={() => setPopover(null)}
                className="mt-1 text-xs text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
          )}

          {/* Attach piece to this edge */}
          {isEditMode && pieceId && quoteId && (
            <div
              className="absolute z-40 bg-white border border-gray-200 rounded-md shadow-lg p-2"
              style={{ left: popover.x, top: (popover.y + 40) }}
            >
              <p className="text-xs font-medium text-gray-500 mb-2">Attach to this edge</p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleAttachPiece('WATERFALL', popover.side)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-700"
                >
                  + Waterfall
                </button>
                <button
                  onClick={() => handleAttachPiece('SPLASHBACK', popover.side)}
                  className="text-xs px-2 py-1 rounded border border-gray-300 hover:bg-gray-50 text-gray-700"
                >
                  + Splashback
                </button>
              </div>
              <label className="flex items-center gap-1.5 mt-2 text-xs text-gray-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={grainMatch}
                  onChange={e => setGrainMatch(e.target.checked)}
                  className="rounded"
                />
                Match grain direction
              </label>

              {/* Show existing attachments for this edge */}
              {edgeAttachments.filter(r => r.side === popover.side).length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-100">
                  {edgeAttachments
                    .filter(r => r.side === popover.side)
                    .map((rel: any) => (
                      <div key={rel.id} className="text-xs text-gray-500 flex items-center justify-between">
                        <span>{'\u21B3'} {rel.relationship_type ?? rel.relation_type} attached</span>
                        <button
                          onClick={() => handleDetach(rel.id)}
                          className="text-red-400 hover:text-red-600 ml-2"
                        >
                          {'\u00D7'}
                        </button>
                      </div>
                    ))}
                  <button
                    onClick={() => handleAttachPiece('WATERFALL', popover.side)}
                    className="text-xs text-gray-400 hover:text-gray-600 mt-1"
                  >
                    + Add another waterfall
                  </button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Popover for shape_config edges (INNER, R-BTM, etc.) */}
      {shapeEdgePopover && onShapeEdgeChange && (
        <>
          {isEditMode && onNoStripEdgesChange && (
            <div
              className="absolute z-50"
              style={{ left: shapeEdgePopover.x, top: shapeEdgePopover.y - 32 }}
            >
              <button
                onClick={() => handleWallEdgeToggle(shapeEdgePopover.edgeId)}
                className={`text-xs px-2 py-1 rounded border transition-colors ${
                  noStripEdges.includes(shapeEdgePopover.edgeId)
                    ? 'bg-slate-700 text-white border-slate-600'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                }`}
              >
                {noStripEdges.includes(shapeEdgePopover.edgeId) ? 'Against wall' : 'Against wall'}
              </button>
              {noStripEdges.includes(shapeEdgePopover.edgeId) && (
                <span className="ml-2 text-xs text-slate-400">No lamination</span>
              )}
            </div>
          )}
          {!noStripEdges.includes(shapeEdgePopover.edgeId) && (
            <EdgeProfilePopover
              isOpen={true}
              position={{ x: shapeEdgePopover.x, y: shapeEdgePopover.y }}
              currentProfileId={shapeConfigEdges?.[shapeEdgePopover.edgeId] ?? null}
              profiles={edgeTypes}
              isMitred={isMitred}
              onSelect={(profileId) => {
                if (selectedArcEdges.size > 0) {
                  selectedArcEdges.forEach(edgeId => {
                    onShapeEdgeChange(edgeId, profileId);
                  });
                  setSelectedArcEdges(new Set());
                } else {
                  onShapeEdgeChange(shapeEdgePopover.edgeId, profileId);
                }
                setShapeEdgePopover(null);
              }}
              onClose={() => setShapeEdgePopover(null)}
            />
          )}
          {noStripEdges.includes(shapeEdgePopover.edgeId) && (
            <div
              className="absolute z-40 bg-white border border-slate-200 rounded-md shadow-lg p-2"
              style={{ left: shapeEdgePopover.x, top: shapeEdgePopover.y }}
            >
              <div className="text-xs text-slate-500">
                Wall edge — no profile or lamination strip
              </div>
              <button
                onClick={() => setShapeEdgePopover(null)}
                className="mt-1 text-xs text-slate-400 hover:text-slate-600"
              >
                Close
              </button>
            </div>
          )}
        </>
      )}

      {/* ── Multi-select action bar ──────────────────────────────────── */}
      {isEditMode && selectedEdges.size > 0 && editMode === 'select' && (
        <div className="flex items-center gap-2 mt-1 px-1 py-1.5 bg-blue-50 border border-blue-200 rounded-md">
          <span className="text-[10px] font-medium text-blue-700">
            {selectedEdges.size} edge{selectedEdges.size > 1 ? 's' : ''} selected
          </span>
          <span className="text-blue-300">|</span>
          <span className="text-[10px] text-blue-600">Apply:</span>
          <select
            onChange={(e) => {
              const val = e.target.value;
              if (val === '__raw__') {
                applyProfileToSelected(null);
              } else if (val) {
                applyProfileToSelected(val);
              }
            }}
            value=""
            className="px-1.5 py-0.5 text-[10px] border border-blue-200 rounded bg-white text-gray-700 focus:ring-1 focus:ring-blue-500"
          >
            <option value="">Choose profile...</option>
            <option value="__raw__">Raw (no finish)</option>
            {edgeTypes.map((et) => (
              <option key={et.id} value={et.id}>{et.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* ── Bulk apply banner ────────────────────────────────────────── */}
      {bulkApplyInfo && onBulkApply && (
        <div className="mt-1 px-2 py-2 bg-green-50 border border-green-200 rounded-md">
          <div className="text-[10px] text-green-800 font-medium mb-1">
            Applied &ldquo;{bulkApplyInfo.templateName}&rdquo; to this piece
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-green-700">Apply to more?</span>
            <button
              onClick={() => handleBulkApply('room')}
              className="px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-100 hover:bg-green-200 border border-green-300 rounded transition-colors"
            >
              All in room
            </button>
            <button
              onClick={() => handleBulkApply('quote')}
              className="px-2 py-0.5 text-[10px] font-medium text-green-700 bg-green-100 hover:bg-green-200 border border-green-300 rounded transition-colors"
            >
              All in quote
            </button>
            <button
              onClick={() => setBulkApplyInfo(null)}
              className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ── Scope apply banner (after multi-select profile application) ── */}
      {scopeApplyInfo && onBulkApply && (
        <div className="mt-1 px-2 py-2 bg-blue-50 border border-blue-200 rounded-md">
          <div className="text-[10px] text-blue-800 font-medium mb-1">
            Applied &ldquo;{scopeApplyInfo.profileName}&rdquo; to {scopeApplyInfo.sides.join(', ')} edge{scopeApplyInfo.sides.length > 1 ? 's' : ''} on this piece
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[10px] text-blue-700">Apply same to:</span>
            <button
              onClick={() => handleScopeApply('room')}
              className="px-2 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded transition-colors"
            >
              All in {roomName || 'room'}
            </button>
            <button
              onClick={() => handleScopeApply('quote')}
              className="px-2 py-0.5 text-[10px] font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 border border-blue-300 rounded transition-colors"
            >
              All in quote
            </button>
            <button
              onClick={() => setScopeApplyInfo(null)}
              className="px-2 py-0.5 text-[10px] text-gray-500 hover:text-gray-700"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center gap-3 mt-1 px-1 flex-wrap">
        {legendItems.map((item) => (
          <span key={item.code} className="flex items-center gap-1 text-[10px] text-gray-500">
            <span
              className="inline-block w-3 h-0.5 rounded"
              style={{ backgroundColor: item.colour }}
            />
            {item.code}={item.name}
          </span>
        ))}
      </div>

      {/* Edit mode hint + add cutout */}
      {isEditMode && (
        <div className="flex items-center gap-3 mt-1 px-1">
          <span className="text-[10px] text-gray-400 italic">
            {editMode === 'quickEdge'
              ? 'Quick Edge mode \u2014 click any edge to apply selected profile'
              : 'Click edge to edit. Shift+click to multi-select.'}
          </span>
          {onCutoutAdd && cutoutTypes.length > 0 && (
            <div className="relative">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowCutoutDialog(!showCutoutDialog);
                }}
                className="text-[10px] text-primary-600 hover:text-primary-700 font-medium"
              >
                + Add Cutout
              </button>
              {showCutoutDialog && (
                <div className="absolute left-0 top-5 z-50">
                  <CutoutAddDialogInline
                    cutoutTypes={cutoutTypes}
                    onAdd={handleCutoutAddClick}
                    onClose={() => setShowCutoutDialog(false)}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Edge Template Picker ──────────────────────────────────────────────────

function EdgeTemplatePickerInline({
  templates,
  edgeTypes,
  onApply,
  onClose,
}: {
  templates: EdgeTemplate[];
  edgeTypes: EdgeTypeOption[];
  onApply: (template: EdgeTemplate) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const resolveName = (id: string | null) => {
    if (!id) return null;
    return edgeTypes.find((e) => e.id === id)?.name ?? null;
  };

  const builtIn = templates.filter((t) => t.isBuiltIn);
  const custom = templates.filter((t) => !t.isBuiltIn);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-7 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[220px] max-h-[300px] overflow-y-auto"
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">
        Edge Templates
      </div>

      {builtIn.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider">
            Built-in
          </div>
          {builtIn.map((t) => (
            <TemplateItem key={t.id} template={t} resolveName={resolveName} onApply={onApply} />
          ))}
        </>
      )}

      {custom.length > 0 && (
        <>
          <div className="px-3 py-1 text-[10px] font-medium text-gray-400 uppercase tracking-wider border-t border-gray-100 mt-1 pt-1">
            Custom
          </div>
          {custom.map((t) => (
            <TemplateItem key={t.id} template={t} resolveName={resolveName} onApply={onApply} />
          ))}
        </>
      )}

      {templates.length === 0 && (
        <div className="px-3 py-2 text-xs text-gray-400 italic">
          No templates available
        </div>
      )}
    </div>
  );
}

function TemplateItem({
  template,
  resolveName,
  onApply,
}: {
  template: EdgeTemplate;
  resolveName: (id: string | null) => string | null;
  onApply: (template: EdgeTemplate) => void;
}) {
  const dots = [template.edgeTop, template.edgeRight, template.edgeBottom, template.edgeLeft];

  return (
    <button
      onClick={(e) => { e.stopPropagation(); onApply(template); }}
      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors flex items-center gap-2"
    >
      <span className="flex gap-0.5 flex-shrink-0">
        {dots.map((edgeId, i) => (
          <span
            key={i}
            className="inline-block w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: edgeId ? edgeColour(resolveName(edgeId) ?? '') : '#d1d5db' }}
          />
        ))}
      </span>
      <span className="flex-1 truncate">{template.name}</span>
      {template.suggestedPieceType && (
        <span className="text-[9px] text-gray-400 bg-gray-100 px-1 rounded flex-shrink-0">
          {template.suggestedPieceType}
        </span>
      )}
    </button>
  );
}

// ── Save Edge Template Dialog ─────────────────────────────────────────────

function SaveEdgeTemplateInline({
  edgeTop,
  edgeBottom,
  edgeLeft,
  edgeRight,
  edgeTypes,
  resolveEdgeName,
  onSaved,
  onClose,
}: {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  edgeTypes: EdgeTypeOption[];
  resolveEdgeName: (id: string | null) => string | undefined;
  onSaved: (template: EdgeTemplate) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [name, setName] = useState('');
  const [isShared, setIsShared] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');

    try {
      const resp = await fetch('/api/edge-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          edgeTop,
          edgeBottom,
          edgeLeft,
          edgeRight,
          isShared,
        }),
      });

      if (!resp.ok) {
        const data = await resp.json();
        throw new Error(data.error || 'Failed to save template');
      }

      const template = await resp.json();
      onSaved(template as EdgeTemplate);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const edgeSummary: Array<[string, string | null]> = [
    ['Top', edgeTop],
    ['Bottom', edgeBottom],
    ['Left', edgeLeft],
    ['Right', edgeRight],
  ];

  return (
    <div
      ref={ref}
      className="absolute left-0 top-7 z-50 bg-white border border-gray-200 rounded-lg shadow-lg p-3 min-w-[240px]"
    >
      <div className="text-xs font-semibold text-gray-700 mb-2">Save Edge Template</div>

      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Template name"
        className="w-full px-2 py-1 text-xs border border-gray-200 rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500 mb-2"
        autoFocus
      />

      <div className="text-[10px] text-gray-500 mb-1">Current edges:</div>
      <div className="space-y-0.5 mb-2">
        {edgeSummary.map(([label, id]) => (
          <div key={label} className="text-[10px] text-gray-600 flex justify-between">
            <span>{label}:</span>
            <span className="font-medium">{resolveEdgeName(id) ?? 'Raw'}</span>
          </div>
        ))}
      </div>

      <label className="flex items-center gap-1.5 text-[10px] text-gray-600 mb-2">
        <input
          type="checkbox"
          checked={isShared}
          onChange={(e) => setIsShared(e.target.checked)}
          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
        />
        Share with organisation
      </label>

      {error && <div className="text-[10px] text-red-500 mb-1">{error}</div>}

      <div className="flex items-center gap-1.5 justify-end">
        <button
          onClick={onClose}
          className="px-2 py-1 text-[10px] text-gray-500 hover:text-gray-700"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-2 py-1 text-[10px] font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}

// ── Inline Cutout Add (to avoid circular import) ────────────────────────────

function CutoutAddDialogInline({
  cutoutTypes,
  onAdd,
  onClose,
}: {
  cutoutTypes: Array<{ id: string; name: string; baseRate: number }>;
  onAdd: (cutoutTypeId: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[200px]"
    >
      <div className="px-3 py-1.5 text-xs font-semibold text-gray-500 border-b border-gray-100">
        Select Cutout Type
      </div>
      <div className="max-h-[180px] overflow-y-auto">
        {cutoutTypes.map((ct) => (
          <button
            key={ct.id}
            onClick={(e) => {
              e.stopPropagation();
              onAdd(ct.id);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 transition-colors"
          >
            {ct.name}
          </button>
        ))}
      </div>
    </div>
  );
}
