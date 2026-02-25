'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { edgeColour, edgeCode, cutoutLabel } from '@/lib/utils/edge-utils';
import EdgeProfilePopover from './EdgeProfilePopover';
import type { EdgeScope } from './EdgeProfilePopover';
import type { ShapeType, ShapeConfig, LShapeConfig, UShapeConfig } from '@/lib/types/shapes';

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
  | 'right-top' | 'right-bottom' | 'inner-horizontal'  // L-shape
  | 'top-left' | 'top-right' | 'outer-left' | 'outer-right' | 'inner-left' | 'inner-right' | 'back';  // U-shape
type EdgeEditMode = 'select' | 'quickEdge';

/** Maps shape edge sides to the 4 standard edge columns for profile lookup */
const L_SHAPE_EDGE_TO_STANDARD: Record<string, EdgeSide | null> = {
  'top': 'top',
  'right-top': 'right',
  'inner-horizontal': null,
  'right-bottom': null,
  'bottom': 'bottom',
  'left': 'left',
};

const U_SHAPE_EDGE_TO_STANDARD: Record<string, EdgeSide | null> = {
  'top-left': 'top',
  'outer-left': 'left',
  'bottom': 'bottom',
  'outer-right': 'right',
  'top-right': null,
  'inner-right': null,
  'back': null,
  'inner-left': null,
};

/** Edge segment definition for shape rendering */
interface ShapeEdgeDef {
  side: ShapeEdgeSide;
  x1: number; y1: number;
  x2: number; y2: number;
  labelX: number; labelY: number;
  lengthMm: number;
  label: string;
  standardEdge: EdgeSide | null;
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
}: PieceVisualEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [popover, setPopover] = useState<{
    side: EdgeSide;
    x: number;
    y: number;
  } | null>(null);
  const [showCutoutDialog, setShowCutoutDialog] = useState(false);
  const [hoveredEdge, setHoveredEdge] = useState<EdgeSide | null>(null);
  const [hoveredCutout, setHoveredCutout] = useState<string | null>(null);

  // ── Multi-select & Quick Edge mode state ──────────────────────────────
  const [editMode, setEditMode] = useState<EdgeEditMode>('quickEdge');
  const [selectedEdges, setSelectedEdges] = useState<Set<EdgeSide>>(new Set());
  const [quickEdgeProfile, setQuickEdgeProfile] = useState<string | null>(null);
  const [flashEdge, setFlashEdge] = useState<EdgeSide | null>(null);

  // ── Template state ────────────────────────────────────────────────────
  const [templates, setTemplates] = useState<EdgeTemplate[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templatesFetched, setTemplatesFetched] = useState(false);

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

  const handleSvgClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      // Click on empty space clears selection
      if (editMode === 'select' && selectedEdges.size > 0) {
        clearSelection();
      }
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

  // ── Effective shape type (fallback to RECTANGLE if config missing) ───
  const effectiveShapeType: ShapeType = useMemo(() => {
    if (shapeType === 'L_SHAPE' && shapeConfig?.shape === 'L_SHAPE') return 'L_SHAPE';
    if (shapeType === 'U_SHAPE' && shapeConfig?.shape === 'U_SHAPE') return 'U_SHAPE';
    return 'RECTANGLE';
  }, [shapeType, shapeConfig]);

  // ── L/U shape layout & edge definitions ─────────────────────────────
  const shapeLayout = useMemo(() => {
    if (effectiveShapeType === 'RECTANGLE') return null;

    const { x, y } = layout;

    if (effectiveShapeType === 'L_SHAPE') {
      const cfg = shapeConfig as unknown as LShapeConfig;
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

      const edges: ShapeEdgeDef[] = [
        {
          side: 'top', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
          labelX: (p0.x + p1.x) / 2, labelY: p0.y - lo,
          lengthMm: l1l, label: 'TOP', standardEdge: 'top',
        },
        {
          side: 'right-top', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          labelX: p1.x + lo, labelY: (p1.y + p2.y) / 2,
          lengthMm: l1w, label: 'R-TOP', standardEdge: 'right',
        },
        {
          side: 'inner-horizontal', x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y,
          labelX: (p2.x + p3.x) / 2, labelY: p2.y - lo,
          lengthMm: l1l - l2w, label: 'INNER', standardEdge: null,
        },
        {
          side: 'right-bottom', x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y,
          labelX: p3.x + lo, labelY: (p3.y + p4.y) / 2,
          lengthMm: l2l, label: 'R-BTM', standardEdge: null,
        },
        {
          side: 'bottom', x1: p4.x, y1: p4.y, x2: p5.x, y2: p5.y,
          labelX: (p4.x + p5.x) / 2, labelY: p4.y + lo + 4,
          lengthMm: l2w, label: 'BTM', standardEdge: 'bottom',
        },
        {
          side: 'left', x1: p5.x, y1: p5.y, x2: p0.x, y2: p0.y,
          labelX: p5.x - lo, labelY: (p5.y + p0.y) / 2,
          lengthMm: l1w + l2l, label: 'LEFT', standardEdge: 'left',
        },
      ];

      return { path, edges, svgW, svgH };
    }

    if (effectiveShapeType === 'U_SHAPE') {
      const cfg = shapeConfig as unknown as UShapeConfig;
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

      const edges: ShapeEdgeDef[] = [
        {
          side: 'top-left', x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
          labelX: (p0.x + p1.x) / 2, labelY: p0.y - lo,
          lengthMm: lw, label: 'T-LEFT', standardEdge: 'top',
        },
        {
          side: 'inner-left', x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y,
          labelX: p1.x + lo, labelY: (p1.y + p2.y) / 2,
          lengthMm: ll - bw, label: 'IN-L', standardEdge: null,
        },
        {
          side: 'back', x1: p2.x, y1: p2.y, x2: p3.x, y2: p3.y,
          labelX: (p2.x + p3.x) / 2, labelY: Math.max(p2.y, p3.y) + lo,
          lengthMm: bl - lw - rw, label: 'BACK', standardEdge: null,
        },
        {
          side: 'inner-right', x1: p3.x, y1: p3.y, x2: p4.x, y2: p4.y,
          labelX: p3.x - lo, labelY: (p3.y + p4.y) / 2,
          lengthMm: rl - bw, label: 'IN-R', standardEdge: null,
        },
        {
          side: 'top-right', x1: p4.x, y1: p4.y, x2: p5.x, y2: p5.y,
          labelX: (p4.x + p5.x) / 2, labelY: p4.y - lo,
          lengthMm: rw, label: 'T-RIGHT', standardEdge: null,
        },
        {
          side: 'outer-right', x1: p5.x, y1: p5.y, x2: p6.x, y2: p6.y,
          labelX: p5.x + lo, labelY: (p5.y + p6.y) / 2,
          lengthMm: rl, label: 'RIGHT', standardEdge: 'right',
        },
        {
          side: 'bottom', x1: p6.x, y1: p6.y, x2: p7.x, y2: p7.y,
          labelX: (p6.x + p7.x) / 2, labelY: Math.max(p6.y, p7.y) + lo + 4,
          lengthMm: bl, label: 'BTM', standardEdge: 'bottom',
        },
        {
          side: 'outer-left', x1: p7.x, y1: p7.y, x2: p0.x, y2: p0.y,
          labelX: p7.x - lo, labelY: (p7.y + p0.y) / 2,
          lengthMm: ll, label: 'LEFT', standardEdge: 'left',
        },
      ];

      return { path, edges, svgW, svgH };
    }

    return null;
  }, [effectiveShapeType, shapeConfig, layout]);

  // ── Cutout positions ──────────────────────────────────────────────────

  const cutoutPositions = useMemo(() => {
    const { x, y, innerW, innerH } = layout;
    const pad = 8;

    // Filter out cutouts with missing/invalid data to prevent crashes
    const safeCutouts = cutouts.filter(c => c && typeof c === 'object' && c.typeName);

    return safeCutouts.map((cutout, idx) => {
      const lower = (cutout.typeName || 'unknown').toLowerCase();
      let cw: number;
      let ch: number;
      let shape: 'rect' | 'circle' | 'oval' | 'lines';

      if (lower.includes('undermount') || lower.includes('sink')) {
        cw = innerW * 0.35; ch = innerH * 0.45; shape = 'rect';
      } else if (lower.includes('hotplate') || lower.includes('cooktop') || lower.includes('flush')) {
        cw = innerW * 0.25; ch = innerH * 0.4; shape = 'rect';
      } else if (lower.includes('tap')) {
        cw = 16; ch = 16; shape = 'circle';
      } else if (lower.includes('gpo')) {
        cw = 18; ch = 18; shape = 'rect';
      } else if (lower.includes('basin')) {
        cw = innerW * 0.2; ch = innerH * 0.35; shape = 'oval';
      } else if (lower.includes('drainer') || lower.includes('groove')) {
        cw = innerW * 0.25; ch = innerH * 0.35; shape = 'lines';
      } else {
        cw = innerW * 0.15; ch = innerH * 0.3; shape = 'rect';
      }

      const totalCutouts = safeCutouts.length;
      const slotW = (innerW - pad * 2) / totalCutouts;
      const cx = x + pad + slotW * idx + slotW / 2;
      const cy = y + innerH / 2;

      return { ...cutout, cx, cy, w: cw, h: ch, shape };
    });
  }, [cutouts, layout]);

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

    items.push({ code: 'R', name: 'Raw', colour: '#d1d5db' });
    return items;
  }, [edgeTop, edgeBottom, edgeLeft, edgeRight, resolveEdgeName]);

  // Check if piece has at least one non-raw edge (for save template button)
  const hasNonRawEdge = !!(edgeTop || edgeBottom || edgeLeft || edgeRight);

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div
      ref={containerRef}
      className="relative w-full"
      onClick={(e) => e.stopPropagation()}
    >
      {/* ── Edit Mode Toolbar ──────────────────────────────────────────── */}
      {isEditMode && onEdgeChange && (
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
      {isEditMode && editMode === 'quickEdge' && recentProfiles.length > 0 && (
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

            {/* Shape edges */}
            {shapeLayout.edges.map((edge) => {
              const stdEdge = edge.standardEdge;
              const profileId = stdEdge ? edgeIds[stdEdge] : null;
              const name = profileId ? resolveEdgeName(profileId) : undefined;
              const isFinished = !!profileId;
              const colour = edgeColour(name);
              const code = edgeCode(name);
              const isHorizontal = Math.abs(edge.y2 - edge.y1) < Math.abs(edge.x2 - edge.x1);
              const isHovered = hoveredEdge === (stdEdge ?? edge.side);
              const isSelected = stdEdge ? selectedEdges.has(stdEdge) : false;
              const isFlashing = stdEdge ? flashEdge === stdEdge : false;

              return (
                <g key={edge.side}>
                  {/* Selected edge highlight */}
                  {isSelected && (
                    <line
                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                      stroke="#3b82f6" strokeWidth={6}
                      className="edge-selected"
                    />
                  )}

                  {/* Hover glow (edit mode only) */}
                  {isHovered && isEditMode && (
                    <line
                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                      stroke="#3b82f6" strokeWidth={10} opacity={0.15}
                      className="pointer-events-none transition-opacity duration-100"
                    />
                  )}

                  {/* Visible edge line */}
                  <line
                    x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                    stroke={isFlashing ? '#22c55e' : colour}
                    strokeWidth={isFlashing ? 5 : (isFinished ? 3 : 1)}
                    strokeDasharray={isFinished ? undefined : '4 3'}
                    opacity={1}
                    className={isFlashing ? 'edge-flash' : undefined}
                  >
                    <title>{name || 'Raw / Unfinished'}</title>
                  </line>

                  {/* Hit area for clicking (edit mode, mapped edges only) */}
                  {isEditMode && stdEdge && (onEdgeChange || onEdgesChange) && (
                    <line
                      x1={edge.x1} y1={edge.y1} x2={edge.x2} y2={edge.y2}
                      stroke="transparent" strokeWidth={EDGE_HIT_WIDTH}
                      style={{ cursor: 'pointer' }}
                      onClick={(e) => handleEdgeClick(stdEdge, e)}
                      onMouseEnter={() => setHoveredEdge(stdEdge)}
                      onMouseLeave={() => setHoveredEdge(null)}
                    >
                      <title>{name || 'Raw / Unfinished'}</title>
                    </line>
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
                      <title>{name || 'Raw / Unfinished'}</title>
                      {isFinished ? `${code} ${edge.label}` : `RAW ${edge.label}`}
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
              const name = edgeNames[side];
              const isFinished = !!edgeIds[side];
              const colour = edgeColour(name);
              const code = edgeCode(name);
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
                    strokeWidth={isFlashing ? 5 : (isFinished ? 3 : 1)}
                    strokeDasharray={isFinished ? undefined : '4 3'}
                    opacity={1}
                    className={isFlashing ? 'edge-flash' : undefined}
                  >
                    <title>{name || 'Raw / Unfinished'}</title>
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
                      <title>{name || 'Raw / Unfinished'}</title>
                    </line>
                  )}

                  {/* Edge profile label */}
                  <text
                    x={def.labelX}
                    y={def.labelY}
                    textAnchor={isHorizontal ? 'middle' : side === 'left' ? 'end' : 'start'}
                    dominantBaseline={isHorizontal ? (side === 'top' ? 'auto' : 'hanging') : 'middle'}
                    className={`select-none ${
                      isFinished ? 'text-[10px] font-semibold' : 'text-[9px]'
                    }`}
                    fill={colour}
                  >
                    <title>{name || 'Raw / Unfinished'}</title>
                    {isFinished
                      ? (isCompact ? code : `${code} — ${edgeNames[side]}`)
                      : 'RAW'}
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
