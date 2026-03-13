'use client';

import { useState, useEffect, useMemo } from 'react';
import CutoutSelector from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import PieceVisualEditor from './PieceVisualEditor';
import AutocompleteInput from '@/components/ui/AutocompleteInput';
import type { ShapeType, LShapeConfig, UShapeConfig, RadiusEndConfig, FullCircleConfig, ConcaveArcConfig, RoundedRectConfig } from '@/lib/types/shapes';
import { getShapeGeometry } from '@/lib/types/shapes';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface Material {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
}

interface EdgeType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  baseRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface ThicknessOption {
  id: string;
  name: string;
  value: number;
  multiplier: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface EdgeSelections {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

export interface InlinePieceData {
  id: number;
  name: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  materialName: string | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  cutouts: PieceCutout[];
  quote_rooms: { id: number; name: string };
  shapeType?: string | null;
  shapeConfig?: Record<string, unknown> | null;
  overrideMaterialCost?: number | null;
  stripWidthOverrides?: Record<string, number> | null;
  lamination_method?: 'NONE' | 'LAMINATED' | 'MITRED';
  piece_type?: string | null;
}

export interface InlinePieceEditorProps {
  piece: InlinePieceData;
  materials: Material[];
  edgeTypes: EdgeType[];
  cutoutTypes: CutoutType[];
  thicknessOptions: ThicknessOption[];
  roomNames: string[];
  onSave: (pieceId: number, data: Record<string, unknown>, roomName: string) => void;
  saving: boolean;
  /** When true, renders in "create new piece" mode with a name field */
  isNew?: boolean;
  /** Called when the user cancels creating a new piece */
  onCancel?: () => void;
  /** Autocomplete suggestions for piece names */
  pieceSuggestions?: string[];
  /** Autocomplete suggestions for room names */
  roomSuggestions?: string[];
  /** Grain matching surcharge percentage from tenant config (e.g. 15 for 15%) */
  grainMatchingSurchargePercent?: number;
  /** Called after a new material is created via the quick-add modal */
  onMaterialCreated?: () => void;
  /** Quote ID needed for strip width PATCH calls */
  quoteId?: number | string;
  /** Callback after strip width override changes — parent triggers re-optimise */
  onStripWidthChange?: () => void;
}

// ── Constants ───────────────────────────────────────────────────────────────

const STANDARD_ROOMS = [
  'Kitchen',
  'Kitchen Island',
  'Bathroom',
  'Ensuite',
  'Laundry',
  'Outdoor Kitchen',
  'Bar',
  'Other',
];

// ── Shape selector SVG icons ─────────────────────────────────────────────────

function RectangleIcon({ selected }: { selected: boolean }) {
  return (
    <svg viewBox="0 0 48 32" className="w-12 h-8" aria-hidden="true">
      <rect x="6" y="6" width="36" height="20" rx="1"
        fill={selected ? '#1d4ed8' : '#d1d5db'} fillOpacity={selected ? 0.15 : 0.3}
        stroke={selected ? '#1d4ed8' : '#9ca3af'} strokeWidth="1.5" />
    </svg>
  );
}

function LShapeIcon({ selected }: { selected: boolean }) {
  const fill = selected ? '#1d4ed8' : '#9ca3af';
  const bg = selected ? 'rgba(29,78,216,0.15)' : 'rgba(209,213,219,0.3)';
  return (
    <svg viewBox="0 0 48 32" className="w-12 h-8" aria-hidden="true">
      <path d="M8 4 h10 v16 h22 v8 H8 Z" fill={bg} stroke={fill} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function UShapeIcon({ selected }: { selected: boolean }) {
  const fill = selected ? '#1d4ed8' : '#9ca3af';
  const bg = selected ? 'rgba(29,78,216,0.15)' : 'rgba(209,213,219,0.3)';
  return (
    <svg viewBox="0 0 48 32" className="w-12 h-8" aria-hidden="true">
      <path d="M4 4 h10 v16 h20 v-16 h10 v28 H4 Z" fill={bg} stroke={fill} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function RadiusEndIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
      <path
        d="M2 2 L20 2 Q30 2 30 10 Q30 18 20 18 L2 18 Z"
        stroke={selected ? '#4f46e5' : '#9ca3af'}
        strokeWidth="1.5"
        fill={selected ? '#eef2ff' : 'none'}
      />
    </svg>
  );
}

function FullCircleIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <circle
        cx="12" cy="12" r="10"
        stroke={selected ? '#4f46e5' : '#9ca3af'}
        strokeWidth="1.5"
        fill={selected ? '#eef2ff' : 'none'}
      />
    </svg>
  );
}

function ConcaveArcIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="32" height="24" viewBox="0 0 32 24" fill="none">
      <path
        d="M2 2 L30 2 L30 22 Q16 10 2 22 Z"
        stroke={selected ? '#4f46e5' : '#9ca3af'}
        strokeWidth="1.5"
        fill={selected ? '#eef2ff' : 'none'}
      />
    </svg>
  );
}

function RoundedRectIcon({ selected }: { selected: boolean }) {
  return (
    <svg width="32" height="20" viewBox="0 0 32 20" fill="none">
      <rect x="1" y="1" width="30" height="18" rx="4" ry="4"
        stroke={selected ? '#4f46e5' : '#9ca3af'}
        strokeWidth="1.5"
        fill={selected ? '#eef2ff' : 'none'}
      />
    </svg>
  );
}

// ── Name generation helpers ──────────────────────────────────────────────────

function generateShapeName(shapeType: ShapeType, room: string): string {
  const roomLabel = room || 'Kitchen';
  switch (shapeType) {
    case 'L_SHAPE': return `L-Shaped ${roomLabel} Benchtop`;
    case 'U_SHAPE': return `U-Shaped ${roomLabel} Benchtop`;
    case 'RADIUS_END': return `Radius End ${roomLabel} Benchtop`;
    case 'FULL_CIRCLE': return `Circular ${roomLabel} Piece`;
    case 'CONCAVE_ARC': return `Curved ${roomLabel} Benchtop`;
    case 'ROUNDED_RECT': return `Rounded Rectangle ${roomLabel}`;
    default: return '';
  }
}

// ── Strip Width Constants ────────────────────────────────────────────────────

const STRIP_WIDTH_DEFAULT = 60; // mm — standard/waterfall
const STRIP_WIDTH_MITRE = 40;   // mm — mitre edges

function getDefaultStripWidthForEdge(edgeName: string): number {
  if (edgeName.toLowerCase().includes('mitre')) return STRIP_WIDTH_MITRE;
  return STRIP_WIDTH_DEFAULT;
}

/** Derive which edges produce strips based on shape type and edge selections */
function getStripEdges(
  shapeType: ShapeType,
  edgeSelections: { edgeTop: string | null; edgeBottom: string | null; edgeLeft: string | null; edgeRight: string | null },
): string[] {
  if (shapeType === 'RECTANGLE') {
    const edges: string[] = [];
    if (edgeSelections.edgeTop) edges.push('top');
    if (edgeSelections.edgeBottom) edges.push('bottom');
    if (edgeSelections.edgeLeft) edges.push('left');
    if (edgeSelections.edgeRight) edges.push('right');
    return edges;
  }
  if (shapeType === 'L_SHAPE') {
    // L-shape: 6 possible edges
    return ['top', 'left', 'r_top', 'inner', 'r_btm', 'bottom'];
  }
  if (shapeType === 'U_SHAPE') {
    // U-shape: 8 possible edges
    return ['top_left', 'outer_left', 'inner_left', 'bottom', 'back_inner', 'top_right', 'outer_right', 'inner_right'];
  }
  // For other shapes, only include edges that have an edge profile
  const edges: string[] = [];
  if (edgeSelections.edgeTop) edges.push('top');
  if (edgeSelections.edgeBottom) edges.push('bottom');
  if (edgeSelections.edgeLeft) edges.push('left');
  if (edgeSelections.edgeRight) edges.push('right');
  return edges;
}

function humaniseEdgeName(edge: string): string {
  return edge.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

// ── Per-Edge Strip Width Table ──────────────────────────────────────────────

function PerEdgeStripWidthTable({
  piece,
  edgeSelections,
  shapeType,
  stripWidthOverrides,
  setStripWidthOverrides,
  quoteId,
  onStripWidthChange,
}: {
  piece: InlinePieceData;
  edgeSelections: { edgeTop: string | null; edgeBottom: string | null; edgeLeft: string | null; edgeRight: string | null };
  shapeType: ShapeType;
  stripWidthOverrides: Record<string, number>;
  setStripWidthOverrides: (v: Record<string, number>) => void;
  quoteId?: number | string;
  onStripWidthChange?: () => void;
}) {
  const edges = getStripEdges(shapeType, edgeSelections);
  const [applyingAll, setApplyingAll] = useState(false);
  const [applyMessage, setApplyMessage] = useState<string | null>(null);

  if (edges.length === 0) return null;

  const handleEdgeSave = async (edge: string, value: string) => {
    const parsed = parseInt(value);
    if (isNaN(parsed) || parsed <= 0) return;

    const defaultWidth = getDefaultStripWidthForEdge(edge);
    let updated: Record<string, number>;
    if (parsed === defaultWidth) {
      // Remove override if value matches default
      const { [edge]: _, ...rest } = stripWidthOverrides;
      updated = rest;
    } else {
      updated = { ...stripWidthOverrides, [edge]: parsed };
    }
    setStripWidthOverrides(updated);

    if (quoteId && piece.id) {
      try {
        const res = await fetch(`/api/quotes/${quoteId}/pieces/${piece.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripWidthOverrides: Object.keys(updated).length > 0 ? updated : null }),
        });
        if (res.ok) onStripWidthChange?.();
      } catch { /* non-critical */ }
    }
  };

  const handleReset = async (edge: string) => {
    const { [edge]: _, ...rest } = stripWidthOverrides;
    setStripWidthOverrides(rest);

    if (quoteId && piece.id) {
      try {
        const res = await fetch(`/api/quotes/${quoteId}/pieces/${piece.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripWidthOverrides: Object.keys(rest).length > 0 ? rest : null }),
        });
        if (res.ok) onStripWidthChange?.();
      } catch { /* non-critical */ }
    }
  };

  const handleApplyToAll = async () => {
    if (!quoteId) return;
    setApplyingAll(true);
    setApplyMessage(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces`);
      if (!res.ok) throw new Error('Failed to fetch pieces');
      const allPieces: Array<{ id: number; thicknessMm: number }> = await res.json();
      const targets = allPieces.filter(p => p.thicknessMm >= 40 && p.id !== piece.id);
      const overridePayload = Object.keys(stripWidthOverrides).length > 0 ? stripWidthOverrides : null;

      // Sequential PATCHes to avoid rate limiting
      for (const target of targets) {
        await fetch(`/api/quotes/${quoteId}/pieces/${target.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stripWidthOverrides: overridePayload }),
        });
      }

      // Single re-optimise after all PATCHes
      onStripWidthChange?.();
      setApplyMessage(`Applied strip widths to ${targets.length} piece${targets.length !== 1 ? 's' : ''}`);
      setTimeout(() => setApplyMessage(null), 4000);
    } catch {
      setApplyMessage('Failed to apply strip widths');
      setTimeout(() => setApplyMessage(null), 4000);
    } finally {
      setApplyingAll(false);
    }
  };

  return (
    <div className="mt-3">
      <label className="block text-xs font-medium text-gray-600 mb-1.5">
        Strip Widths
        <span className="ml-1 text-gray-400 font-normal">(per edge — overrides tenant defaults)</span>
      </label>
      <table className="w-full text-xs border border-gray-200 rounded-lg overflow-hidden">
        <thead>
          <tr className="bg-gray-50 text-gray-500 uppercase tracking-wider">
            <th className="text-left py-1.5 px-2 font-medium">Edge</th>
            <th className="text-left py-1.5 px-2 font-medium">Width (mm)</th>
            <th className="text-left py-1.5 px-2 font-medium w-12">Action</th>
          </tr>
        </thead>
        <tbody>
          {edges.map((edge) => {
            const defaultWidth = getDefaultStripWidthForEdge(edge);
            const overrideValue = stripWidthOverrides[edge];
            const displayValue = overrideValue ?? defaultWidth;
            const isOverridden = overrideValue != null && overrideValue !== defaultWidth;

            return (
              <tr key={edge} className="border-t border-gray-100">
                <td className="py-1.5 px-2 text-gray-700">{humaniseEdgeName(edge)}</td>
                <td className="py-1 px-2">
                  <input
                    type="number"
                    min="1"
                    defaultValue={displayValue}
                    onBlur={(e) => handleEdgeSave(edge, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                    onClick={(e) => e.stopPropagation()}
                    className={`w-16 px-2 py-1 text-xs border rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500 ${
                      isOverridden
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-gray-300'
                    }`}
                  />
                </td>
                <td className="py-1 px-2">
                  {isOverridden && (
                    <button
                      onClick={(e) => { e.stopPropagation(); handleReset(edge); }}
                      className="text-amber-500 hover:text-amber-700 text-sm"
                      title="Reset to default"
                    >
                      ↺
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {quoteId && (
        <button
          onClick={(e) => { e.stopPropagation(); handleApplyToAll(); }}
          disabled={applyingAll}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 disabled:text-gray-400 font-medium"
        >
          {applyingAll ? 'Applying...' : 'Apply to all 40mm pieces'}
        </button>
      )}
      {applyMessage && (
        <p className="text-xs text-green-600 mt-1">{applyMessage}</p>
      )}
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InlinePieceEditor({
  piece,
  materials,
  edgeTypes,
  cutoutTypes,
  thicknessOptions,
  roomNames,
  onSave,
  saving,
  isNew = false,
  onCancel,
  pieceSuggestions = [],
  roomSuggestions = [],
  grainMatchingSurchargePercent = 15,
  onMaterialCreated,
  quoteId,
  onStripWidthChange,
}: InlinePieceEditorProps) {
  // ── Local form state ────────────────────────────────────────────────────
  const [pieceName, setPieceName] = useState(piece.name || '');
  const [lengthMm, setLengthMm] = useState(piece.lengthMm.toString());
  const [widthMm, setWidthMm] = useState(piece.widthMm.toString());
  const [thicknessMm, setThicknessMm] = useState(piece.thicknessMm);
  const [laminationMethod, setLaminationMethod] = useState<'NONE' | 'LAMINATED' | 'MITRED'>(piece.lamination_method ?? 'NONE');
  const [thicknessMode, setThicknessMode] = useState<'20mm' | '40mm' | 'custom'>(() => {
    const t = piece.thicknessMm;
    if (t === 20) return '20mm';
    if (t === 40) return '40mm';
    return 'custom';
  });
  const [customThickness, setCustomThickness] = useState<string>(() => {
    const t = piece.thicknessMm;
    return t !== 20 && t !== 40 ? t.toString() : '';
  });
  const [materialId, setMaterialId] = useState<number | null>(piece.materialId);
  const [overrideMaterialCost, setOverrideMaterialCost] = useState<string>(
    piece.overrideMaterialCost != null ? String(piece.overrideMaterialCost) : ''
  );
  const [stripWidthOverrides, setStripWidthOverrides] = useState<Record<string, number>>(
    (piece.stripWidthOverrides as unknown as Record<string, number>) ?? {}
  );
  const [mitredCornerTreatment, setMitredCornerTreatment] =
    useState<'RAW' | 'SQUARE_TOP' | 'ROUND_TOP'>('RAW');
  const [roomName, setRoomName] = useState(piece.quote_rooms?.name || 'Kitchen');
  const [localPieceType, setLocalPieceType] = useState<string>(
    piece.piece_type ?? 'BENCHTOP'
  );
  const [edgeSelections, setEdgeSelections] = useState<EdgeSelections>({
    edgeTop: piece.edgeTop || null,
    edgeBottom: piece.edgeBottom || null,
    edgeLeft: piece.edgeLeft || null,
    edgeRight: piece.edgeRight || null,
  });
  const [cutouts, setCutouts] = useState<PieceCutout[]>(
    Array.isArray(piece.cutouts) ? piece.cutouts : []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // ── Quick-add material modal state ─────────────────────────────────────
  const [showNewMaterialModal, setShowNewMaterialModal] = useState(false);
  const [newMat, setNewMat] = useState({
    name: '',
    fabricationCategory: 'ENGINEERED',
    slabLengthMm: '',
    slabWidthMm: '',
    pricePerSlab: '',
    collection: '',
    pricePerSqm: 0,
  });
  const [newMatSaving, setNewMatSaving] = useState(false);
  const [newMatError, setNewMatError] = useState<string | null>(null);

  const calculatedPricePerSqm = useMemo(() => {
    const price = parseFloat(newMat.pricePerSlab);
    const length = parseInt(newMat.slabLengthMm);
    const width = parseInt(newMat.slabWidthMm);
    if (!price || !length || !width || price <= 0 || length <= 0 || width <= 0) return null;
    const slabAreaSqm = (length * width) / 1_000_000;
    return Math.round((price / slabAreaSqm) * 100) / 100;
  }, [newMat.pricePerSlab, newMat.slabLengthMm, newMat.slabWidthMm]);

  // ── Shape state (K2: L/U shape wizard) ─────────────────────────────────
  const [shapeType, setShapeType] = useState<ShapeType>('RECTANGLE');
  // L-Shape leg dimensions
  const [leg1Length, setLeg1Length] = useState('3200');
  const [leg1Width, setLeg1Width] = useState('600');
  const [leg2Length, setLeg2Length] = useState('1800');
  const [leg2Width, setLeg2Width] = useState('600');
  // U-Shape leg dimensions
  const [leftLegLength, setLeftLegLength] = useState('2400');
  const [leftLegWidth, setLeftLegWidth] = useState('600');
  const [backLength, setBackLength] = useState('3200');
  const [backWidth, setBackWidth] = useState('600');
  const [rightLegLength, setRightLegLength] = useState('2400');
  const [rightLegWidth, setRightLegWidth] = useState('600');
  // Same width checkbox
  const [sameWidth, setSameWidth] = useState(true);
  // Track whether user has manually edited the piece name
  const [nameManuallyEdited, setNameManuallyEdited] = useState(false);
  // Grain matching opt-in for L/U shaped pieces
  const [grainMatched, setGrainMatched] = useState(false);

  // ── Curved shape state (C2–C4) ───────────────────────────────────────────
  // RADIUS_END
  const [radiusEndLength, setRadiusEndLength] = useState('2400');
  const [radiusEndWidth, setRadiusEndWidth] = useState('900');
  const [radiusEndRadius, setRadiusEndRadius] = useState('450');
  const [radiusEndCurvedEnds, setRadiusEndCurvedEnds] = useState<'ONE' | 'BOTH'>('ONE');
  // FULL_CIRCLE
  const [circleDiameter, setCircleDiameter] = useState('900');
  // CONCAVE_ARC
  const [arcInnerRadius, setArcInnerRadius] = useState('1200');
  const [arcDepth, setArcDepth] = useState('600');
  const [arcSweepDeg, setArcSweepDeg] = useState<90 | 120 | 180>(90);
  const [arcCurvedEnds, setArcCurvedEnds] = useState(false);
  // ROUNDED_RECT state
  const [rrLength, setRrLength]         = useState(2400);
  const [rrWidth, setRrWidth]           = useState(900);
  const [rrCornerRadius, setRrCornerRadius] = useState(100);
  const [rrIndividual, setRrIndividual] = useState(false);
  const [rrCornerTL, setRrCornerTL]     = useState(100);
  const [rrCornerTR, setRrCornerTR]     = useState(100);
  const [rrCornerBR, setRrCornerBR]     = useState(100);
  const [rrCornerBL, setRrCornerBL]     = useState(100);

  // ── Reset form when piece changes ───────────────────────────────────────
  useEffect(() => {
    setPieceName(piece.name || '');
    setLengthMm(piece.lengthMm.toString());
    setWidthMm(piece.widthMm.toString());
    setThicknessMm(piece.thicknessMm);
    if (piece.thicknessMm === 20) {
      setThicknessMode('20mm');
      setCustomThickness('');
    } else if (piece.thicknessMm === 40) {
      setThicknessMode('40mm');
      setCustomThickness('');
    } else {
      setThicknessMode('custom');
      setCustomThickness(piece.thicknessMm.toString());
    }
    setMaterialId(piece.materialId);
    setOverrideMaterialCost(
      piece.overrideMaterialCost != null ? String(piece.overrideMaterialCost) : ''
    );
    setStripWidthOverrides(
      (piece.stripWidthOverrides as unknown as Record<string, number>) ?? {}
    );
    setMitredCornerTreatment(
      ((piece as unknown as Record<string, unknown>).mitredCornerTreatment as 'RAW' | 'SQUARE_TOP' | 'ROUND_TOP') ?? 'RAW'
    );
    setRoomName(piece.quote_rooms?.name || 'Kitchen');
    setEdgeSelections({
      edgeTop: piece.edgeTop || null,
      edgeBottom: piece.edgeBottom || null,
      edgeLeft: piece.edgeLeft || null,
      edgeRight: piece.edgeRight || null,
    });
    setCutouts(Array.isArray(piece.cutouts) ? piece.cutouts : []);
    setErrors({});
    // Recover shape type from piece data — covers GET list (shapeType) and shapeConfig.shape fallback
    const recoveredShape = (piece.shapeType || ((piece.shapeConfig as Record<string, unknown>)?.shape as string) || 'RECTANGLE') as ShapeType;
    setShapeType(recoveredShape);
    setSameWidth(true);
    setNameManuallyEdited(false);
    setGrainMatched(false);
  }, [piece]);

  // ── Initialise L/U shape dimensions from saved shapeConfig on edit ──────
  useEffect(() => {
    if (!piece?.shapeConfig) return;
    const cfg = piece.shapeConfig as Record<string, unknown>;
    if (cfg.shape === 'L_SHAPE') {
      const leg1 = cfg.leg1 as { length_mm: number; width_mm: number } | undefined;
      const leg2 = cfg.leg2 as { length_mm: number; width_mm: number } | undefined;
      if (leg1) {
        setLeg1Length(String(leg1.length_mm));
        setLeg1Width(String(leg1.width_mm));
      }
      if (leg2) {
        setLeg2Length(String(leg2.length_mm));
        setLeg2Width(String(leg2.width_mm));
      }
      if (leg1 && leg2 && leg1.width_mm !== leg2.width_mm) {
        setSameWidth(false);
      }
    }
    if (cfg.shape === 'U_SHAPE') {
      const left = cfg.leftLeg as { length_mm: number; width_mm: number } | undefined;
      const back = cfg.back as { length_mm: number; width_mm: number } | undefined;
      const right = cfg.rightLeg as { length_mm: number; width_mm: number } | undefined;
      if (left) {
        setLeftLegLength(String(left.length_mm));
        setLeftLegWidth(String(left.width_mm));
      }
      if (back) {
        setBackLength(String(back.length_mm));
        setBackWidth(String(back.width_mm));
      }
      if (right) {
        setRightLegLength(String(right.length_mm));
        setRightLegWidth(String(right.width_mm));
      }
      if (left && back && right && !(left.width_mm === back.width_mm && back.width_mm === right.width_mm)) {
        setSameWidth(false);
      }
    }
  }, [piece]);

  // ── Same-width sync: when checked, copy lead width to other legs ───────
  useEffect(() => {
    if (!sameWidth) return;
    if (shapeType === 'L_SHAPE') {
      setLeg2Width(leg1Width);
    } else if (shapeType === 'U_SHAPE') {
      setBackWidth(leftLegWidth);
      setRightLegWidth(leftLegWidth);
    }
  }, [sameWidth, shapeType, leg1Width, leftLegWidth]);

  // ── Auto-generate name when shape/room changes (only for new pieces) ──
  useEffect(() => {
    if (!isNew || nameManuallyEdited) return;
    if (shapeType !== 'RECTANGLE') {
      const suggested = generateShapeName(shapeType, roomName);
      setPieceName(suggested);
    } else {
      // Reset name if switching back to Rectangle
      setPieceName('');
    }
  }, [shapeType, roomName, isNew, nameManuallyEdited]);

  // ── Live area calculation for L/U shapes ──────────────────────────────
  const shapeGeometry = useMemo(() => {
    if (shapeType === 'L_SHAPE') {
      const config: LShapeConfig = {
        shape: 'L_SHAPE',
        leg1: { length_mm: parseInt(leg1Length) || 0, width_mm: parseInt(leg1Width) || 0 },
        leg2: { length_mm: parseInt(leg2Length) || 0, width_mm: parseInt(leg2Width) || 0 },
      };
      return getShapeGeometry('L_SHAPE', config, 0, 0);
    }
    if (shapeType === 'U_SHAPE') {
      const config: UShapeConfig = {
        shape: 'U_SHAPE',
        leftLeg: { length_mm: parseInt(leftLegLength) || 0, width_mm: parseInt(leftLegWidth) || 0 },
        back: { length_mm: parseInt(backLength) || 0, width_mm: parseInt(backWidth) || 0 },
        rightLeg: { length_mm: parseInt(rightLegLength) || 0, width_mm: parseInt(rightLegWidth) || 0 },
      };
      return getShapeGeometry('U_SHAPE', config, 0, 0);
    }
    if (shapeType === 'RADIUS_END') {
      const config: RadiusEndConfig = {
        shape: 'RADIUS_END',
        length_mm: parseInt(radiusEndLength) || 0,
        width_mm: parseInt(radiusEndWidth) || 0,
        radius_mm: parseInt(radiusEndRadius) || 0,
        curved_ends: radiusEndCurvedEnds,
      };
      return getShapeGeometry('RADIUS_END', config, 0, 0);
    }
    if (shapeType === 'FULL_CIRCLE') {
      const config: FullCircleConfig = {
        shape: 'FULL_CIRCLE',
        diameter_mm: parseInt(circleDiameter) || 0,
      };
      return getShapeGeometry('FULL_CIRCLE', config, 0, 0);
    }
    if (shapeType === 'CONCAVE_ARC') {
      const config: ConcaveArcConfig = {
        shape: 'CONCAVE_ARC',
        inner_radius_mm: parseInt(arcInnerRadius) || 0,
        depth_mm: parseInt(arcDepth) || 0,
        sweep_deg: arcSweepDeg,
        curved_ends: arcCurvedEnds,
      };
      return getShapeGeometry('CONCAVE_ARC', config, 0, 0);
    }
    if (shapeType === 'ROUNDED_RECT') {
      const config: RoundedRectConfig = {
        shape: 'ROUNDED_RECT',
        length_mm: rrLength,
        width_mm: rrWidth,
        corner_radius_mm: rrCornerRadius,
        individual_corners: rrIndividual,
        corner_tl_mm: rrIndividual ? rrCornerTL : rrCornerRadius,
        corner_tr_mm: rrIndividual ? rrCornerTR : rrCornerRadius,
        corner_br_mm: rrIndividual ? rrCornerBR : rrCornerRadius,
        corner_bl_mm: rrIndividual ? rrCornerBL : rrCornerRadius,
      };
      return getShapeGeometry('ROUNDED_RECT', config, 0, 0);
    }
    return null;
  }, [shapeType, leg1Length, leg1Width, leg2Length, leg2Width, leftLegLength, leftLegWidth, backLength, backWidth, rightLegLength, rightLegWidth, radiusEndLength, radiusEndWidth, radiusEndRadius, radiusEndCurvedEnds, circleDiameter, arcInnerRadius, arcDepth, arcSweepDeg, arcCurvedEnds, rrLength, rrWidth, rrCornerRadius, rrIndividual, rrCornerTL, rrCornerTR, rrCornerBR, rrCornerBL]);

  // Current shape config for SVG rendering (mirrors the save payload config)
  const currentShapeConfig = useMemo(() => {
    if (shapeType === 'L_SHAPE') {
      return {
        shape: 'L_SHAPE' as const,
        leg1: { length_mm: parseInt(leg1Length) || 0, width_mm: parseInt(leg1Width) || 0 },
        leg2: { length_mm: parseInt(leg2Length) || 0, width_mm: parseInt(leg2Width) || 0 },
      };
    }
    if (shapeType === 'U_SHAPE') {
      return {
        shape: 'U_SHAPE' as const,
        leftLeg: { length_mm: parseInt(leftLegLength) || 0, width_mm: parseInt(leftLegWidth) || 0 },
        back: { length_mm: parseInt(backLength) || 0, width_mm: parseInt(backWidth) || 0 },
        rightLeg: { length_mm: parseInt(rightLegLength) || 0, width_mm: parseInt(rightLegWidth) || 0 },
      };
    }
    return null;
  }, [shapeType, leg1Length, leg1Width, leg2Length, leg2Width, leftLegLength, leftLegWidth, backLength, backWidth, rightLegLength, rightLegWidth]);

  // ── Derived state ───────────────────────────────────────────────────────
  const allRoomOptions = Array.from(new Set([...STANDARD_ROOMS, ...roomNames]));

  // ── Handlers ────────────────────────────────────────────────────────────

  const handleThicknessMode = (mode: '20mm' | '40mm' | 'custom') => {
    setThicknessMode(mode);
    if (mode === '20mm') {
      setThicknessMm(20);
      setCustomThickness('');
    } else if (mode === '40mm') {
      setThicknessMm(40);
      setCustomThickness('');
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next.thicknessMm;
      return next;
    });
  };

  const handleCustomThicknessChange = (value: string) => {
    setCustomThickness(value);
    const num = parseInt(value);
    if (!isNaN(num) && num >= 20) {
      setThicknessMm(num);
      if (num === 20) {
        setThicknessMode('20mm');
        setCustomThickness('');
      } else if (num === 40) {
        setThicknessMode('40mm');
        setCustomThickness('');
      }
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (isNew && !pieceName.trim()) {
      newErrors.pieceName = 'Name is required';
    }

    // Validate dimensions based on shape type
    if (shapeType === 'RECTANGLE') {
      const length = parseInt(lengthMm);
      if (!lengthMm || isNaN(length) || length <= 0) {
        newErrors.lengthMm = 'Length must be greater than 0';
      }
      const width = parseInt(widthMm);
      if (!widthMm || isNaN(width) || width <= 0) {
        newErrors.widthMm = 'Width must be greater than 0';
      }
    } else if (shapeType === 'L_SHAPE') {
      const l1l = parseInt(leg1Length); const l1w = parseInt(leg1Width);
      const l2l = parseInt(leg2Length); const l2w = parseInt(leg2Width);
      if (!l1l || l1l <= 0) newErrors.leg1Length = 'Required';
      if (!l1w || l1w <= 0) newErrors.leg1Width = 'Required';
      if (!l2l || l2l <= 0) newErrors.leg2Length = 'Required';
      if (!l2w || l2w <= 0) newErrors.leg2Width = 'Required';
    } else if (shapeType === 'U_SHAPE') {
      const ll = parseInt(leftLegLength); const lw = parseInt(leftLegWidth);
      const bl = parseInt(backLength); const bw = parseInt(backWidth);
      const rl = parseInt(rightLegLength); const rw = parseInt(rightLegWidth);
      if (!ll || ll <= 0) newErrors.leftLegLength = 'Required';
      if (!lw || lw <= 0) newErrors.leftLegWidth = 'Required';
      if (!bl || bl <= 0) newErrors.backLength = 'Required';
      if (!bw || bw <= 0) newErrors.backWidth = 'Required';
      if (!rl || rl <= 0) newErrors.rightLegLength = 'Required';
      if (!rw || rw <= 0) newErrors.rightLegWidth = 'Required';
    }

    if (thicknessMode === 'custom') {
      const t = parseInt(customThickness);
      if (!customThickness || isNaN(t)) {
        newErrors.thicknessMm = 'Please enter a thickness value';
      } else if (t < 20) {
        newErrors.thicknessMm = 'Thickness must be at least 20mm';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSaveNewMaterial = async () => {
    if (!newMat.name.trim()) {
      setNewMatError('Name is required');
      return;
    }
    setNewMatSaving(true);
    setNewMatError(null);
    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newMat.name.trim(),
          collection: newMat.collection.trim() || null,
          fabricationCategory: newMat.fabricationCategory,
          slabLengthMm: newMat.slabLengthMm ? parseInt(newMat.slabLengthMm) : null,
          slabWidthMm: newMat.slabWidthMm ? parseInt(newMat.slabWidthMm) : null,
          pricePerSlab: newMat.pricePerSlab ? parseFloat(newMat.pricePerSlab) : null,
          pricePerSqm: calculatedPricePerSqm ?? 0,
          isActive: true,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setNewMatError(err.error || 'Failed to create material');
        return;
      }
      const created = await res.json();
      setMaterialId(created.id);
      setShowNewMaterialModal(false);
      setNewMat({ name: '', fabricationCategory: 'ENGINEERED', slabLengthMm: '', slabWidthMm: '', pricePerSlab: '', collection: '', pricePerSqm: 0 });
      onMaterialCreated?.();
    } catch {
      setNewMatError('Failed to create material');
    } finally {
      setNewMatSaving(false);
    }
  };

  const handleSave = () => {
    if (!validate()) return;

    const selectedMaterial = materials.find(m => m.id === materialId);

    // Cutouts: always use local state since CutoutSelector is rendered for all pieces.
    const payload: Record<string, unknown> = {
      pieceType: localPieceType,
      thicknessMm,
      laminationMethod,
      mitredCornerTreatment,
      materialId,
      materialName: selectedMaterial?.name || null,
      overrideMaterialCost: overrideMaterialCost !== ''
        ? parseFloat(overrideMaterialCost)
        : null,
      stripWidthOverrides: Object.keys(stripWidthOverrides).length > 0
        ? stripWidthOverrides
        : null,
      cutouts,
    };

    // Shape-specific dimension handling
    if (shapeType === 'RECTANGLE') {
      payload.lengthMm = parseInt(lengthMm);
      payload.widthMm = parseInt(widthMm);
      payload.shapeType = 'RECTANGLE';
      payload.shapeConfig = null;
      // Only include rectangle edge fields for RECTANGLE pieces
      payload.edgeTop = isNew ? edgeSelections.edgeTop : piece.edgeTop;
      payload.edgeBottom = isNew ? edgeSelections.edgeBottom : piece.edgeBottom;
      payload.edgeLeft = isNew ? edgeSelections.edgeLeft : piece.edgeLeft;
      payload.edgeRight = isNew ? edgeSelections.edgeRight : piece.edgeRight;
    } else if (shapeType === 'L_SHAPE') {
      const config: LShapeConfig = {
        shape: 'L_SHAPE',
        leg1: { length_mm: parseInt(leg1Length), width_mm: parseInt(leg1Width) },
        leg2: { length_mm: parseInt(leg2Length), width_mm: parseInt(leg2Width) },
      };
      const geo = getShapeGeometry('L_SHAPE', config, 0, 0);
      payload.shapeType = 'L_SHAPE';
      // Preserve existing shape_config.edges when updating dimensions
      const existingEdges = (piece.shapeConfig as unknown as Record<string, unknown>)?.edges;
      payload.shapeConfig = existingEdges ? { ...config, edges: existingEdges } : config;
      // Bounding box in existing fields for backward compat
      payload.lengthMm = geo.boundingLength_mm;
      payload.widthMm = geo.boundingWidth_mm;
    } else if (shapeType === 'U_SHAPE') {
      const config: UShapeConfig = {
        shape: 'U_SHAPE',
        leftLeg: { length_mm: parseInt(leftLegLength), width_mm: parseInt(leftLegWidth) },
        back: { length_mm: parseInt(backLength), width_mm: parseInt(backWidth) },
        rightLeg: { length_mm: parseInt(rightLegLength), width_mm: parseInt(rightLegWidth) },
      };
      const geo = getShapeGeometry('U_SHAPE', config, 0, 0);
      payload.shapeType = 'U_SHAPE';
      // Preserve existing shape_config.edges when updating dimensions
      const existingEdges = (piece.shapeConfig as unknown as Record<string, unknown>)?.edges;
      payload.shapeConfig = existingEdges ? { ...config, edges: existingEdges } : config;
      // Bounding box in existing fields for backward compat
      payload.lengthMm = geo.boundingLength_mm;
      payload.widthMm = geo.boundingWidth_mm;
    } else if (shapeType === 'RADIUS_END') {
      const config: RadiusEndConfig = {
        shape: 'RADIUS_END',
        length_mm: parseInt(radiusEndLength) || 0,
        width_mm: parseInt(radiusEndWidth) || 0,
        radius_mm: parseInt(radiusEndRadius) || 0,
        curved_ends: radiusEndCurvedEnds,
      };
      payload.shapeType = 'RADIUS_END';
      payload.shapeConfig = config;
      payload.lengthMm = parseInt(radiusEndLength) || 0;
      payload.widthMm = parseInt(radiusEndWidth) || 0;
    } else if (shapeType === 'FULL_CIRCLE') {
      const config: FullCircleConfig = {
        shape: 'FULL_CIRCLE',
        diameter_mm: parseInt(circleDiameter) || 0,
      };
      payload.shapeType = 'FULL_CIRCLE';
      payload.shapeConfig = config;
      // Bounding box for optimizer: diameter × diameter
      payload.lengthMm = parseInt(circleDiameter) || 0;
      payload.widthMm = parseInt(circleDiameter) || 0;
    } else if (shapeType === 'CONCAVE_ARC') {
      const config: ConcaveArcConfig = {
        shape: 'CONCAVE_ARC',
        inner_radius_mm: parseInt(arcInnerRadius) || 0,
        depth_mm: parseInt(arcDepth) || 0,
        sweep_deg: arcSweepDeg,
        curved_ends: arcCurvedEnds,
      };
      payload.shapeType = 'CONCAVE_ARC';
      payload.shapeConfig = config;
      // Bounding box: use inner_radius_mm as both dimensions (conservative)
      payload.lengthMm = parseInt(arcInnerRadius) * 2 || 0;
      payload.widthMm = parseInt(arcDepth) || 0;
    } else if (shapeType === 'ROUNDED_RECT') {
      const rrConfig: RoundedRectConfig = {
        shape: 'ROUNDED_RECT',
        length_mm: rrLength,
        width_mm: rrWidth,
        corner_radius_mm: rrCornerRadius,
        individual_corners: rrIndividual,
        corner_tl_mm: rrIndividual ? rrCornerTL : rrCornerRadius,
        corner_tr_mm: rrIndividual ? rrCornerTR : rrCornerRadius,
        corner_br_mm: rrIndividual ? rrCornerBR : rrCornerRadius,
        corner_bl_mm: rrIndividual ? rrCornerBL : rrCornerRadius,
      };
      payload.shapeConfig = rrConfig as unknown as Record<string, unknown>;
      payload.shapeType   = 'ROUNDED_RECT';
      payload.lengthMm    = rrLength;
      payload.widthMm     = rrWidth;
    }

    // Grain matching: only relevant for L/U shapes, always false for rectangles
    payload.requiresGrainMatch = shapeType !== 'RECTANGLE' ? grainMatched : false;

    // Include name for new pieces
    if (isNew) {
      payload.name = pieceName.trim();
    }

    onSave(
      piece.id,
      payload,
      roomName
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────

  const parsedLength = parseInt(lengthMm) || 0;
  const parsedWidth = parseInt(widthMm) || 0;
  // laminationMethod is now managed as local state (line ~445), not derived from piece cast

  // Dimension input helper — reused across shapes
  const dimInput = (
    label: string, value: string, setter: (v: string) => void, errorKey: string
  ) => (
    <div className="flex-1 min-w-0">
      <label className="block text-[10px] text-gray-500 mb-0.5">{label}</label>
      <input
        type="number"
        value={value}
        onChange={(e) => setter(e.target.value)}
        min="1"
        className={`w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
          errors[errorKey] ? 'border-red-500' : 'border-gray-300'
        }`}
        onClick={(e) => e.stopPropagation()}
      />
      {errors[errorKey] && <p className="mt-0.5 text-xs text-red-500">{errors[errorKey]}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Shape selector — K2: L/U shape wizard (new and edit mode) */}
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1.5">
          Shape
        </label>
        <div className="flex gap-2">
          {([
            { type: 'RECTANGLE' as ShapeType, label: 'Rectangle', Icon: RectangleIcon },
            { type: 'L_SHAPE' as ShapeType, label: 'L-Shape', Icon: LShapeIcon },
            { type: 'U_SHAPE' as ShapeType, label: 'U-Shape', Icon: UShapeIcon },
            { type: 'RADIUS_END' as ShapeType, label: 'Radius End', Icon: RadiusEndIcon },
            { type: 'FULL_CIRCLE' as ShapeType, label: 'Circle', Icon: FullCircleIcon },
            { type: 'ROUNDED_RECT' as ShapeType, label: 'Rounded Rect', Icon: RoundedRectIcon },
          ]).map(({ type, label, Icon }) => (
            <button
              key={type}
              type="button"
              onClick={(e) => { e.stopPropagation(); setShapeType(type); }}
              className={`flex flex-col items-center gap-1 px-4 py-2.5 rounded-lg border-2 transition-all ${
                shapeType === type
                  ? 'border-primary-600 bg-primary-50 text-primary-700'
                  : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Icon selected={shapeType === type} />
              <span className="text-xs font-medium">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Name field (new piece only) */}
      {isNew && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Piece Name
          </label>
          <AutocompleteInput
            value={pieceName}
            onChange={(name) => { setPieceName(name); setNameManuallyEdited(true); }}
            suggestions={pieceSuggestions}
            placeholder="e.g. Main Kitchen Benchtop"
            className={`w-full max-w-sm px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.pieceName ? 'border-red-500' : 'border-gray-300'
            }`}
            stopPropagation
          />
          {errors.pieceName && <p className="mt-0.5 text-xs text-red-500">{errors.pieceName}</p>}
        </div>
      )}

      {/* Piece type */}
      <div>
        <label className="block text-[10px] text-gray-500 mb-0.5">Piece Type</label>
        <select
          value={localPieceType}
          onChange={(e) => setLocalPieceType(e.target.value)}
          className="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
        >
          <option value="BENCHTOP">Benchtop</option>
          <option value="ISLAND">Island</option>
          <option value="SPLASHBACK">Splashback</option>
          <option value="WATERFALL">Waterfall</option>
          <option value="VANITY">Vanity</option>
          <option value="SHELF">Shelf</option>
          <option value="PANEL">Panel</option>
          <option value="OTHER">Other</option>
        </select>
      </div>

      {/* ── RECTANGLE dimensions (existing flow — unchanged) ─────────── */}
      {shapeType === 'RECTANGLE' && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Dimensions (mm)
            </label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={lengthMm}
                onChange={(e) => setLengthMm(e.target.value)}
                min="1"
                className={`w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  errors.lengthMm ? 'border-red-500' : 'border-gray-300'
                }`}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-gray-400 text-sm flex-shrink-0">&times;</span>
              <input
                type="number"
                value={widthMm}
                onChange={(e) => setWidthMm(e.target.value)}
                min="1"
                className={`w-full px-2 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                  errors.widthMm ? 'border-red-500' : 'border-gray-300'
                }`}
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-gray-400 text-xs flex-shrink-0">mm</span>
            </div>
            {errors.lengthMm && <p className="mt-0.5 text-xs text-red-500">{errors.lengthMm}</p>}
            {errors.widthMm && <p className="mt-0.5 text-xs text-red-500">{errors.widthMm}</p>}
          </div>

          {/* Thickness */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Thickness
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleThicknessMode('20mm'); }}
                  className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                    thicknessMode === '20mm'
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  20mm
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleThicknessMode('40mm'); }}
                  className={`px-2.5 py-1 text-xs font-medium border-l border-gray-300 transition-colors ${
                    thicknessMode === '40mm'
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  40mm
                </button>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); handleThicknessMode('custom'); }}
                  className={`px-2.5 py-1 text-xs font-medium border-l border-gray-300 transition-colors ${
                    thicknessMode === 'custom'
                      ? 'bg-gray-900 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  Custom
                </button>
              </div>
              {thicknessMode === 'custom' && (
                <input
                  type="number"
                  value={customThickness}
                  onChange={(e) => handleCustomThicknessChange(e.target.value)}
                  placeholder="e.g. 60"
                  min={20}
                  step={1}
                  className={`w-20 px-2 py-1 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    errors.thicknessMm ? 'border-red-500' : 'border-gray-300'
                  }`}
                  onClick={(e) => e.stopPropagation()}
                />
              )}
            </div>
            {thicknessMm > 20 && (
              <div className="mt-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  40mm Build-up Method
                </label>
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                  {(['NONE', 'LAMINATED', 'MITRED'] as const).map((method) => (
                    <button
                      key={method}
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setLaminationMethod(method); }}
                      className={`px-2.5 py-1 text-xs font-medium transition-colors border-l first:border-l-0 border-gray-300 ${
                        laminationMethod === method
                          ? 'bg-gray-900 text-white'
                          : 'bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {method === 'NONE' ? 'None' : method === 'LAMINATED' ? 'Laminated' : 'Mitred'}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {errors.thicknessMm && <p className="mt-0.5 text-xs text-red-500">{errors.thicknessMm}</p>}
          </div>

          {/* Material */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Material
            </label>
            <div className="flex items-center gap-1">
              <select
                value={materialId || ''}
                onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)}
                onClick={(e) => e.stopPropagation()}
                className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Select material (optional)</option>
                {materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name}
                    {material.collection ? ` - ${material.collection}` : ''}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setShowNewMaterialModal(true); }}
                className="shrink-0 px-2 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors"
                title="Add new material"
              >
                + New
              </button>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const overrideInput = document.getElementById(`override-cost-${piece.id}`);
                if (overrideInput) {
                  overrideInput.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  (overrideInput as HTMLInputElement).focus();
                }
              }}
              className="mt-1 text-xs text-primary-600 hover:text-primary-700 hover:underline"
            >
              Using a supplier quote? Override the price below ↓
            </button>
            <div className="mt-2">
              {/* Labour only toggle */}
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="checkbox"
                  id={`labour-only-${piece.id}`}
                  checked={overrideMaterialCost === '0'}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setOverrideMaterialCost('0');
                    } else {
                      setOverrideMaterialCost('');
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                />
                <label
                  htmlFor={`labour-only-${piece.id}`}
                  className="text-sm text-gray-700 cursor-pointer select-none"
                  onClick={(e) => e.stopPropagation()}
                >
                  Labour only — no material cost
                </label>
              </div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Material Cost Override
                <span className="ml-1 text-gray-400 font-normal">(ex GST — overrides catalogue price)</span>
              </label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                <input
                  id={`override-cost-${piece.id}`}
                  type="number"
                  step="0.01"
                  min="0"
                  value={overrideMaterialCost}
                  onChange={(e) => setOverrideMaterialCost(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  disabled={overrideMaterialCost === '0'}
                  placeholder="Leave blank to use catalogue price"
                  className={`w-full pl-6 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                    overrideMaterialCost !== ''
                      ? 'border-amber-400 bg-amber-50'
                      : 'border-gray-300'
                  }`}
                />
              </div>
              {overrideMaterialCost !== '' && (
                <p className="text-xs text-amber-600 mt-1">
                  ⚠ Catalogue price overridden — margin does not apply to this piece.
                </p>
              )}
            </div>
            {(thicknessMm >= 40 || laminationMethod === 'LAMINATED' || laminationMethod === 'MITRED') && (
              <PerEdgeStripWidthTable
                piece={piece}
                edgeSelections={edgeSelections}
                shapeType={shapeType}
                stripWidthOverrides={stripWidthOverrides}
                setStripWidthOverrides={setStripWidthOverrides}
                quoteId={quoteId}
                onStripWidthChange={onStripWidthChange}
              />
            )}
            {laminationMethod === 'MITRED' && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Mitre Corner Treatment
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  How the top corner of the 45° mitre is finished.
                </p>
                <div className="flex gap-2">
                  {(['RAW', 'SQUARE_TOP', 'ROUND_TOP'] as const).map(treatment => (
                    <button
                      key={treatment}
                      onClick={(e) => { e.stopPropagation(); setMitredCornerTreatment(treatment); }}
                      className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                        mitredCornerTreatment === treatment
                          ? 'bg-stone-800 text-white border-stone-800'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                      }`}
                    >
                      {treatment === 'RAW' ? 'Raw'
                        : treatment === 'SQUARE_TOP' ? 'Square Top'
                        : 'Round Top'}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── L-SHAPE dimensions (K2) ──────────────────────────────────── */}
      {shapeType === 'L_SHAPE' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 space-y-3">
            <p className="text-xs font-semibold text-blue-800">L-Shape Dimensions</p>
            {/* Back (long run) */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Back</p>
              <div className="flex items-center gap-2">
                {dimInput('Length (mm)', leg1Length, setLeg1Length, 'leg1Length')}
                <span className="text-gray-400 text-sm mt-4">&times;</span>
                {dimInput('Width (mm)', leg1Width, (v) => { setLeg1Width(v); if (sameWidth) setLeg2Width(v); }, 'leg1Width')}
              </div>
            </div>
            {/* Return */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Return</p>
              <div className="flex items-center gap-2">
                {dimInput('Length (mm)', leg2Length, setLeg2Length, 'leg2Length')}
                <span className="text-gray-400 text-sm mt-4">&times;</span>
                {dimInput('Width (mm)', leg2Width, sameWidth ? () => {} : setLeg2Width, 'leg2Width')}
              </div>
            </div>
            {/* Same width checkbox */}
            <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={sameWidth}
                onChange={(e) => { setSameWidth(e.target.checked); }}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-gray-600">Same width on both legs</span>
            </label>
            {/* Calculated area + corner joins */}
            {shapeGeometry && shapeGeometry.totalAreaSqm > 0 && (
              <div className="flex items-center gap-4 pt-1 border-t border-blue-100">
                <span className="text-xs text-gray-600">
                  Calculated area: <strong>{shapeGeometry.totalAreaSqm.toFixed(2)} m&sup2;</strong>
                </span>
                <span className="text-xs text-gray-600">
                  Corner joins: <strong>{shapeGeometry.cornerJoins}</strong>
                </span>
              </div>
            )}
          </div>
          {/* Thickness + Material row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Thickness</label>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleThicknessMode('20mm'); }} className={`px-2.5 py-1 text-xs font-medium transition-colors ${thicknessMode === '20mm' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>20mm</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleThicknessMode('40mm'); }} className={`px-2.5 py-1 text-xs font-medium border-l border-gray-300 transition-colors ${thicknessMode === '40mm' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>40mm</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleThicknessMode('custom'); }} className={`px-2.5 py-1 text-xs font-medium border-l border-gray-300 transition-colors ${thicknessMode === 'custom' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>Custom</button>
                </div>
                {thicknessMode === 'custom' && (
                  <input type="number" value={customThickness} onChange={(e) => handleCustomThicknessChange(e.target.value)} placeholder="e.g. 60" min={20} step={1} className={`w-20 px-2 py-1 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 ${errors.thicknessMm ? 'border-red-500' : 'border-gray-300'}`} onClick={(e) => e.stopPropagation()} />
                )}
              </div>
              {thicknessMm > 20 && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">40mm Build-up Method</label>
                  <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                    {(['NONE', 'LAMINATED', 'MITRED'] as const).map((method) => (
                      <button key={method} type="button" onClick={(e) => { e.stopPropagation(); setLaminationMethod(method); }} className={`px-2.5 py-1 text-xs font-medium transition-colors border-l first:border-l-0 border-gray-300 ${laminationMethod === method ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                        {method === 'NONE' ? 'None' : method === 'LAMINATED' ? 'Laminated' : 'Mitred'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {errors.thicknessMm && <p className="mt-0.5 text-xs text-red-500">{errors.thicknessMm}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <div className="flex items-center gap-1">
                <select value={materialId || ''} onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)} onClick={(e) => e.stopPropagation()} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                  <option value="">Select material (optional)</option>
                  {materials.map((material) => (<option key={material.id} value={material.id}>{material.name}{material.collection ? ` - ${material.collection}` : ''}</option>))}
                </select>
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowNewMaterialModal(true); }} className="shrink-0 px-2 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors" title="Add new material">+ New</button>
              </div>
              <div className="mt-2">
                {/* Labour only toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id={`labour-only-${piece.id}`}
                    checked={overrideMaterialCost === '0'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setOverrideMaterialCost('0');
                      } else {
                        setOverrideMaterialCost('');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label
                    htmlFor={`labour-only-${piece.id}`}
                    className="text-sm text-gray-700 cursor-pointer select-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Labour only — no material cost
                  </label>
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Material Cost Override
                  <span className="ml-1 text-gray-400 font-normal">(ex GST — overrides catalogue price)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                  <input
                    id={`override-cost-${piece.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={overrideMaterialCost}
                    onChange={(e) => setOverrideMaterialCost(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={overrideMaterialCost === '0'}
                    placeholder="Leave blank to use catalogue price"
                    className={`w-full pl-6 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                      overrideMaterialCost !== ''
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-300'
                    }`}
                  />
                </div>
                {overrideMaterialCost !== '' && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Catalogue price overridden — margin does not apply to this piece.
                  </p>
                )}
              </div>
              {(thicknessMm >= 40 || laminationMethod === 'LAMINATED' || laminationMethod === 'MITRED') && (
                <PerEdgeStripWidthTable
                  piece={piece}
                  edgeSelections={edgeSelections}
                  shapeType={shapeType}
                  stripWidthOverrides={stripWidthOverrides}
                  setStripWidthOverrides={setStripWidthOverrides}
                  quoteId={quoteId}
                  onStripWidthChange={onStripWidthChange}
                />
              )}
              {laminationMethod === 'MITRED' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Mitre Corner Treatment
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    How the top corner of the 45° mitre is finished.
                  </p>
                  <div className="flex gap-2">
                    {(['RAW', 'SQUARE_TOP', 'ROUND_TOP'] as const).map(treatment => (
                      <button
                        key={treatment}
                        onClick={(e) => { e.stopPropagation(); setMitredCornerTreatment(treatment); }}
                        className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                          mitredCornerTreatment === treatment
                            ? 'bg-stone-800 text-white border-stone-800'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {treatment === 'RAW' ? 'Raw'
                          : treatment === 'SQUARE_TOP' ? 'Square Top'
                          : 'Round Top'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── U-SHAPE dimensions (K2) ──────────────────────────────────── */}
      {shapeType === 'U_SHAPE' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-purple-100 bg-purple-50/30 p-3 space-y-3">
            <p className="text-xs font-semibold text-purple-800">U-Shape Dimensions</p>
            {/* Left Leg */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Left Leg</p>
              <div className="flex items-center gap-2">
                {dimInput('Length (mm)', leftLegLength, setLeftLegLength, 'leftLegLength')}
                <span className="text-gray-400 text-sm mt-4">&times;</span>
                {dimInput('Width (mm)', leftLegWidth, (v) => {
                  setLeftLegWidth(v);
                  if (sameWidth) { setBackWidth(v); setRightLegWidth(v); }
                }, 'leftLegWidth')}
              </div>
            </div>
            {/* Back */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Back</p>
              <div className="flex items-center gap-2">
                {dimInput('Length (mm)', backLength, setBackLength, 'backLength')}
                <span className="text-gray-400 text-sm mt-4">&times;</span>
                {dimInput('Width (mm)', backWidth, sameWidth ? () => {} : setBackWidth, 'backWidth')}
              </div>
            </div>
            {/* Right Leg */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Right Leg</p>
              <div className="flex items-center gap-2">
                {dimInput('Length (mm)', rightLegLength, setRightLegLength, 'rightLegLength')}
                <span className="text-gray-400 text-sm mt-4">&times;</span>
                {dimInput('Width (mm)', rightLegWidth, sameWidth ? () => {} : setRightLegWidth, 'rightLegWidth')}
              </div>
            </div>
            {/* Same width checkbox */}
            <label className="flex items-center gap-2 cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="checkbox"
                checked={sameWidth}
                onChange={(e) => { setSameWidth(e.target.checked); }}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-gray-600">Same width on all legs</span>
            </label>
            {/* Calculated area + corner joins */}
            {shapeGeometry && shapeGeometry.totalAreaSqm > 0 && (
              <div className="flex items-center gap-4 pt-1 border-t border-purple-100">
                <span className="text-xs text-gray-600">
                  Calculated area: <strong>{shapeGeometry.totalAreaSqm.toFixed(2)} m&sup2;</strong>
                </span>
                <span className="text-xs text-gray-600">
                  Corner joins: <strong>{shapeGeometry.cornerJoins}</strong>
                </span>
              </div>
            )}
          </div>
          {/* Thickness + Material row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Thickness</label>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleThicknessMode('20mm'); }} className={`px-2.5 py-1 text-xs font-medium transition-colors ${thicknessMode === '20mm' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>20mm</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleThicknessMode('40mm'); }} className={`px-2.5 py-1 text-xs font-medium border-l border-gray-300 transition-colors ${thicknessMode === '40mm' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>40mm</button>
                  <button type="button" onClick={(e) => { e.stopPropagation(); handleThicknessMode('custom'); }} className={`px-2.5 py-1 text-xs font-medium border-l border-gray-300 transition-colors ${thicknessMode === 'custom' ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>Custom</button>
                </div>
                {thicknessMode === 'custom' && (
                  <input type="number" value={customThickness} onChange={(e) => handleCustomThicknessChange(e.target.value)} placeholder="e.g. 60" min={20} step={1} className={`w-20 px-2 py-1 text-xs border rounded-lg focus:ring-2 focus:ring-primary-500 ${errors.thicknessMm ? 'border-red-500' : 'border-gray-300'}`} onClick={(e) => e.stopPropagation()} />
                )}
              </div>
              {thicknessMm > 20 && (
                <div className="mt-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">40mm Build-up Method</label>
                  <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
                    {(['NONE', 'LAMINATED', 'MITRED'] as const).map((method) => (
                      <button key={method} type="button" onClick={(e) => { e.stopPropagation(); setLaminationMethod(method); }} className={`px-2.5 py-1 text-xs font-medium transition-colors border-l first:border-l-0 border-gray-300 ${laminationMethod === method ? 'bg-gray-900 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                        {method === 'NONE' ? 'None' : method === 'LAMINATED' ? 'Laminated' : 'Mitred'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {errors.thicknessMm && <p className="mt-0.5 text-xs text-red-500">{errors.thicknessMm}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <div className="flex items-center gap-1">
                <select value={materialId || ''} onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)} onClick={(e) => e.stopPropagation()} className="flex-1 px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                  <option value="">Select material (optional)</option>
                  {materials.map((material) => (<option key={material.id} value={material.id}>{material.name}{material.collection ? ` - ${material.collection}` : ''}</option>))}
                </select>
                <button type="button" onClick={(e) => { e.stopPropagation(); setShowNewMaterialModal(true); }} className="shrink-0 px-2 py-1.5 text-xs font-medium text-primary-600 border border-primary-200 rounded-lg hover:bg-primary-50 transition-colors" title="Add new material">+ New</button>
              </div>
              <div className="mt-2">
                {/* Labour only toggle */}
                <div className="flex items-center gap-2 mb-2">
                  <input
                    type="checkbox"
                    id={`labour-only-${piece.id}`}
                    checked={overrideMaterialCost === '0'}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setOverrideMaterialCost('0');
                      } else {
                        setOverrideMaterialCost('');
                      }
                    }}
                    onClick={(e) => e.stopPropagation()}
                    className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  />
                  <label
                    htmlFor={`labour-only-${piece.id}`}
                    className="text-sm text-gray-700 cursor-pointer select-none"
                    onClick={(e) => e.stopPropagation()}
                  >
                    Labour only — no material cost
                  </label>
                </div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Material Cost Override
                  <span className="ml-1 text-gray-400 font-normal">(ex GST — overrides catalogue price)</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                  <input
                    id={`override-cost-${piece.id}`}
                    type="number"
                    step="0.01"
                    min="0"
                    value={overrideMaterialCost}
                    onChange={(e) => setOverrideMaterialCost(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    disabled={overrideMaterialCost === '0'}
                    placeholder="Leave blank to use catalogue price"
                    className={`w-full pl-6 pr-3 py-1.5 text-sm border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
                      overrideMaterialCost !== ''
                        ? 'border-amber-400 bg-amber-50'
                        : 'border-gray-300'
                    }`}
                  />
                </div>
                {overrideMaterialCost !== '' && (
                  <p className="text-xs text-amber-600 mt-1">
                    ⚠ Catalogue price overridden — margin does not apply to this piece.
                  </p>
                )}
              </div>
              {(thicknessMm >= 40 || laminationMethod === 'LAMINATED' || laminationMethod === 'MITRED') && (
                <PerEdgeStripWidthTable
                  piece={piece}
                  edgeSelections={edgeSelections}
                  shapeType={shapeType}
                  stripWidthOverrides={stripWidthOverrides}
                  setStripWidthOverrides={setStripWidthOverrides}
                  quoteId={quoteId}
                  onStripWidthChange={onStripWidthChange}
                />
              )}
              {laminationMethod === 'MITRED' && (
                <div className="mt-3">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Mitre Corner Treatment
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    How the top corner of the 45° mitre is finished.
                  </p>
                  <div className="flex gap-2">
                    {(['RAW', 'SQUARE_TOP', 'ROUND_TOP'] as const).map(treatment => (
                      <button
                        key={treatment}
                        onClick={(e) => { e.stopPropagation(); setMitredCornerTreatment(treatment); }}
                        className={`px-3 py-1.5 text-xs rounded border transition-colors ${
                          mitredCornerTreatment === treatment
                            ? 'bg-stone-800 text-white border-stone-800'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {treatment === 'RAW' ? 'Raw'
                          : treatment === 'SQUARE_TOP' ? 'Square Top'
                          : 'Round Top'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── RADIUS_END dimensions ──────────────────────────────────── */}
      {shapeType === 'RADIUS_END' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            A rectangular piece with one or both short ends replaced by a curved arc.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Length (mm)</label>
              <input type="number" min="1" value={radiusEndLength}
                onChange={(e) => setRadiusEndLength(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Width (mm)</label>
              <input type="number" min="1" value={radiusEndWidth}
                onChange={(e) => setRadiusEndWidth(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arc Radius (mm)</label>
              <input type="number" min="1" value={radiusEndRadius}
                onChange={(e) => setRadiusEndRadius(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              <p className="text-xs text-gray-400 mt-0.5">Usually = half the width</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Curved Ends</label>
              <div className="flex gap-2 mt-1">
                {(['ONE', 'BOTH'] as const).map((opt) => (
                  <button key={opt} type="button"
                    onClick={(e) => { e.stopPropagation(); setRadiusEndCurvedEnds(opt); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      radiusEndCurvedEnds === opt
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {opt === 'ONE' ? 'One End' : 'Both Ends'}
                  </button>
                ))}
              </div>
            </div>
          </div>
          {shapeGeometry && (
            <p className="text-xs text-gray-500">
              Area: <strong>{shapeGeometry.totalAreaSqm.toFixed(3)} m²</strong>
            </p>
          )}
        </div>
      )}

      {/* ── FULL_CIRCLE dimensions ─────────────────────────────────── */}
      {shapeType === 'FULL_CIRCLE' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            A complete circular piece. Enter the diameter.
          </p>
          <div className="max-w-xs">
            <label className="block text-xs font-medium text-gray-600 mb-1">Diameter (mm)</label>
            <input type="number" min="1" value={circleDiameter}
              onChange={(e) => setCircleDiameter(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
          </div>
          {shapeGeometry && (
            <p className="text-xs text-gray-500">
              Area: <strong>{shapeGeometry.totalAreaSqm.toFixed(3)} m²</strong>
              <span className="ml-2 text-gray-400">(π × r²)</span>
            </p>
          )}
        </div>
      )}

      {/* ── CONCAVE_ARC dimensions ─────────────────────────────────── */}
      {shapeType === 'CONCAVE_ARC' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            A piece with a concave inner arc — e.g. curved breakfast bar or bay window benchtop.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Inner Radius (mm)</label>
              <input type="number" min="1" value={arcInnerRadius}
                onChange={(e) => setArcInnerRadius(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Depth (mm)</label>
              <input type="number" min="1" value={arcDepth}
                onChange={(e) => setArcDepth(e.target.value)}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" />
              <p className="text-xs text-gray-400 mt-0.5">Front to back at deepest point</p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Arc Sweep</label>
              <div className="flex gap-2 mt-1">
                {([90, 120, 180] as const).map((deg) => (
                  <button key={deg} type="button"
                    onClick={(e) => { e.stopPropagation(); setArcSweepDeg(deg); }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      arcSweepDeg === deg
                        ? 'border-primary-600 bg-primary-50 text-primary-700'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}>
                    {deg}°
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Curved Ends</label>
              <button type="button"
                onClick={(e) => { e.stopPropagation(); setArcCurvedEnds(!arcCurvedEnds); }}
                className={`mt-1 px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                  arcCurvedEnds
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}>
                {arcCurvedEnds ? 'Yes — ends are curved' : 'No — ends are straight'}
              </button>
            </div>
          </div>
          {shapeGeometry && (
            <p className="text-xs text-gray-500">
              Area: <strong>{shapeGeometry.totalAreaSqm.toFixed(3)} m²</strong>
            </p>
          )}
        </div>
      )}

      {/* ── ROUNDED_RECT dimensions ─────────────────────────────────── */}
      {shapeType === 'ROUNDED_RECT' && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">
            Rectangle with softened corners — island benchtops, vanity tops.
          </p>

          {/* Length + Width */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Length (mm)</label>
              <input type="number" value={rrLength}
                onChange={e => setRrLength(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={200} step={10} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Width (mm)</label>
              <input type="number" value={rrWidth}
                onChange={e => setRrWidth(Number(e.target.value))}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={100} step={10} />
            </div>
          </div>

          {/* Global corner radius — hidden when individual mode is on */}
          {!rrIndividual && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Corner Radius (mm)</label>
              <input type="number" value={rrCornerRadius}
                onChange={e => {
                  const v = Number(e.target.value);
                  setRrCornerRadius(v);
                  setRrCornerTL(v); setRrCornerTR(v);
                  setRrCornerBR(v); setRrCornerBL(v);
                }}
                onClick={(e) => e.stopPropagation()}
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={0} step={5} />
            </div>
          )}

          {/* Individual corners toggle */}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="rrIndividual"
              checked={rrIndividual}
              onChange={e => setRrIndividual(e.target.checked)}
              onClick={(e) => e.stopPropagation()}
              className="rounded border-gray-300 text-primary-600 focus:ring-primary-500" />
            <label htmlFor="rrIndividual" className="text-xs text-gray-600">
              Set corners individually
            </label>
          </div>

          {/* Per-corner inputs — only when individual mode is on */}
          {rrIndividual && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Top-Left (mm)</label>
                <input type="number" value={rrCornerTL}
                  onChange={e => setRrCornerTL(Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={0} step={5} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Top-Right (mm)</label>
                <input type="number" value={rrCornerTR}
                  onChange={e => setRrCornerTR(Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={0} step={5} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bottom-Left (mm)</label>
                <input type="number" value={rrCornerBL}
                  onChange={e => setRrCornerBL(Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={0} step={5} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Bottom-Right (mm)</label>
                <input type="number" value={rrCornerBR}
                  onChange={e => setRrCornerBR(Number(e.target.value))}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500" min={0} step={5} />
              </div>
            </div>
          )}

          {shapeGeometry && (
            <p className="text-xs text-gray-500">
              Area: <strong>{shapeGeometry.totalAreaSqm.toFixed(3)} m²</strong>
              {rrIndividual
                ? <span className="ml-2 text-gray-400">({rrLength}×{rrWidth}mm corners: {rrCornerTL}/{rrCornerTR}/{rrCornerBR}/{rrCornerBL})</span>
                : <span className="ml-2 text-gray-400">({rrLength}×{rrWidth}mm r{rrCornerRadius})</span>
              }
            </p>
          )}
        </div>
      )}

      {/* Edge profiles — PieceVisualEditor SVG for ALL pieces (Rule 44: no banned edge components) */}
      {isNew && parsedLength > 0 && parsedWidth > 0 && (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Edge Profiles
          </label>
          <PieceVisualEditor
            lengthMm={parsedLength}
            widthMm={parsedWidth}
            edgeTop={edgeSelections.edgeTop}
            edgeBottom={edgeSelections.edgeBottom}
            edgeLeft={edgeSelections.edgeLeft}
            edgeRight={edgeSelections.edgeRight}
            edgeTypes={edgeTypes.filter(e => e.isActive !== false).map(e => ({ id: e.id, name: e.name }))}
            cutouts={[]}
            isEditMode={true}
            isMitred={laminationMethod === 'MITRED'}
            onEdgeChange={(side, profileId) => {
              const keyMap = { top: 'edgeTop', right: 'edgeRight', bottom: 'edgeBottom', left: 'edgeLeft' } as const;
              if (side in keyMap) {
                setEdgeSelections(prev => ({ ...prev, [keyMap[side as keyof typeof keyMap]]: profileId }));
              }
            }}
            shapeType={shapeType}
            shapeConfig={currentShapeConfig}
          />
        </div>
      )}

      {/* Cutouts — shown for all pieces (new and existing) */}
      {cutoutTypes.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <CutoutSelector
            cutouts={cutouts}
            cutoutTypes={cutoutTypes}
            onChange={setCutouts}
          />
        </div>
      )}

      {/* Grain Matching prompt — only for L/U shaped pieces */}
      {(shapeType === 'L_SHAPE' || shapeType === 'U_SHAPE') && (
        <div className="rounded-lg border border-gray-200 bg-gray-50/50 p-3">
          <p className="text-xs font-medium text-gray-700 mb-1.5">
            Grain Matching Required?
          </p>
          <p className="text-[11px] text-gray-500 mb-2">
            Matching the grain pattern across the corner joins requires additional labour and slab selection care.
          </p>
          <div className="flex gap-3">
            <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="radio"
                name="grainMatch"
                checked={!grainMatched}
                onChange={() => setGrainMatched(false)}
                className="text-gray-600 focus:ring-gray-500"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-gray-700">No — optimise independently</span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer" onClick={(e) => e.stopPropagation()}>
              <input
                type="radio"
                name="grainMatch"
                checked={grainMatched}
                onChange={() => setGrainMatched(true)}
                className="text-primary-600 focus:ring-primary-500"
                onClick={(e) => e.stopPropagation()}
              />
              <span className="text-xs text-gray-700">
                Yes — grain match corner joins (+{Math.round(grainMatchingSurchargePercent)}%)
              </span>
            </label>
          </div>
        </div>
      )}

      {/* Room + Save */}
      <div className="flex items-end gap-4">
        <div className="flex-1 max-w-xs">
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Room
          </label>
          <AutocompleteInput
            value={roomName}
            onChange={(name) => setRoomName(name)}
            suggestions={Array.from(new Set([...allRoomOptions, ...roomSuggestions]))}
            placeholder="e.g. Kitchen"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            stopPropagation
          />
        </div>
        <div className="flex items-center gap-2">
          {isNew && onCancel && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onCancel(); }}
              disabled={saving}
              className="px-4 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); handleSave(); }}
            disabled={saving}
            className="px-4 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {saving ? 'Saving...' : isNew ? 'Create Piece' : 'Save Changes'}
          </button>
        </div>
      </div>

      {/* Quick-add material modal */}
      {showNewMaterialModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setShowNewMaterialModal(false)}
        >
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold text-gray-900 mb-4">New Material</h3>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newMat.name}
                  onChange={(e) => setNewMat(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Calacatta Gold"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Collection</label>
                <input
                  type="text"
                  value={newMat.collection}
                  onChange={(e) => setNewMat(p => ({ ...p, collection: e.target.value }))}
                  placeholder="e.g. Premium Range"
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Fabrication Category</label>
                <select
                  value={newMat.fabricationCategory}
                  onChange={(e) => setNewMat(p => ({ ...p, fabricationCategory: e.target.value }))}
                  className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                >
                  <option value="ENGINEERED">Engineered Quartz</option>
                  <option value="NATURAL_HARD">Natural Granite</option>
                  <option value="NATURAL_SOFT">Natural Marble</option>
                  <option value="NATURAL_PREMIUM">Natural Premium</option>
                  <option value="SINTERED">Porcelain / Sintered</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slab Length (mm)</label>
                  <input
                    type="number"
                    value={newMat.slabLengthMm}
                    onChange={(e) => setNewMat(p => ({ ...p, slabLengthMm: e.target.value }))}
                    placeholder="3200"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Slab Width (mm)</label>
                  <input
                    type="number"
                    value={newMat.slabWidthMm}
                    onChange={(e) => setNewMat(p => ({ ...p, slabWidthMm: e.target.value }))}
                    placeholder="1600"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Cost per Slab (ex GST)</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 text-sm">$</span>
                  <input
                    type="number"
                    step="0.01"
                    value={newMat.pricePerSlab}
                    onChange={(e) => setNewMat(p => ({ ...p, pricePerSlab: e.target.value }))}
                    placeholder="0.00"
                    className="w-full pl-7 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                  />
                </div>
                {calculatedPricePerSqm !== null && (
                  <p className="text-xs text-gray-500 mt-1">
                    ≈ <span className="font-medium text-gray-700">${calculatedPricePerSqm.toFixed(2)}/m²</span> based on slab dimensions
                  </p>
                )}
                {newMat.pricePerSlab && !calculatedPricePerSqm && (
                  <p className="text-xs text-amber-600 mt-1">
                    Enter slab dimensions to calculate m² rate
                  </p>
                )}
              </div>
              {newMatError && (
                <p className="text-xs text-red-600">{newMatError}</p>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => setShowNewMaterialModal(false)}
                className="px-4 py-2 text-sm text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSaveNewMaterial}
                disabled={newMatSaving || !newMat.name.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {newMatSaving ? 'Saving...' : 'Save Material'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
