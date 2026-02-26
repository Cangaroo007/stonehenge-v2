'use client';

import { useState, useEffect, useMemo } from 'react';
import CutoutSelector from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import PieceVisualEditor from './PieceVisualEditor';
import AutocompleteInput from '@/components/ui/AutocompleteInput';
import type { ShapeType, LShapeConfig, UShapeConfig } from '@/lib/types/shapes';
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

// ── Name generation helpers ──────────────────────────────────────────────────

function generateShapeName(shapeType: ShapeType, room: string): string {
  const roomLabel = room || 'Kitchen';
  switch (shapeType) {
    case 'L_SHAPE': return `L-Shaped ${roomLabel} Benchtop`;
    case 'U_SHAPE': return `U-Shaped ${roomLabel} Benchtop`;
    default: return '';
  }
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
}: InlinePieceEditorProps) {
  // ── Local form state ────────────────────────────────────────────────────
  const [pieceName, setPieceName] = useState(piece.name || '');
  const [lengthMm, setLengthMm] = useState(piece.lengthMm.toString());
  const [widthMm, setWidthMm] = useState(piece.widthMm.toString());
  const [thicknessMm, setThicknessMm] = useState(piece.thicknessMm);
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
  const [roomName, setRoomName] = useState(piece.quote_rooms?.name || 'Kitchen');
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
    setRoomName(piece.quote_rooms?.name || 'Kitchen');
    setEdgeSelections({
      edgeTop: piece.edgeTop || null,
      edgeBottom: piece.edgeBottom || null,
      edgeLeft: piece.edgeLeft || null,
      edgeRight: piece.edgeRight || null,
    });
    setCutouts(Array.isArray(piece.cutouts) ? piece.cutouts : []);
    setErrors({});
    // Reset shape state for new pieces
    setShapeType('RECTANGLE');
    setSameWidth(true);
    setNameManuallyEdited(false);
    setGrainMatched(false);
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
    return null;
  }, [shapeType, leg1Length, leg1Width, leg2Length, leg2Width, leftLegLength, leftLegWidth, backLength, backWidth, rightLegLength, rightLegWidth]);

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

  const handleSave = () => {
    if (!validate()) return;

    const selectedMaterial = materials.find(m => m.id === materialId);

    // Auto-set lamination method based on thickness
    const laminationMethod = thicknessMm > 20 ? 'LAMINATED' : 'NONE';

    // Edges: for existing pieces, edges are managed via PieceVisualEditor in
    // QuickViewPieceRow — pass through the piece prop values to avoid overriding.
    // Cutouts: always use local state since CutoutSelector is rendered for all pieces.
    const payload: Record<string, unknown> = {
      thicknessMm,
      laminationMethod,
      materialId,
      materialName: selectedMaterial?.name || null,
      edgeTop: isNew ? edgeSelections.edgeTop : piece.edgeTop,
      edgeBottom: isNew ? edgeSelections.edgeBottom : piece.edgeBottom,
      edgeLeft: isNew ? edgeSelections.edgeLeft : piece.edgeLeft,
      edgeRight: isNew ? edgeSelections.edgeRight : piece.edgeRight,
      cutouts,
    };

    // Shape-specific dimension handling
    if (shapeType === 'RECTANGLE') {
      payload.lengthMm = parseInt(lengthMm);
      payload.widthMm = parseInt(widthMm);
      payload.shapeType = 'RECTANGLE';
      payload.shapeConfig = null;
    } else if (shapeType === 'L_SHAPE') {
      const config: LShapeConfig = {
        shape: 'L_SHAPE',
        leg1: { length_mm: parseInt(leg1Length), width_mm: parseInt(leg1Width) },
        leg2: { length_mm: parseInt(leg2Length), width_mm: parseInt(leg2Width) },
      };
      const geo = getShapeGeometry('L_SHAPE', config, 0, 0);
      payload.shapeType = 'L_SHAPE';
      payload.shapeConfig = config;
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
      payload.shapeConfig = config;
      // Bounding box in existing fields for backward compat
      payload.lengthMm = geo.boundingLength_mm;
      payload.widthMm = geo.boundingWidth_mm;
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
      {/* Shape selector (new piece only) — K2: L/U shape wizard */}
      {isNew && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1.5">
            Shape
          </label>
          <div className="flex gap-2">
            {([
              { type: 'RECTANGLE' as ShapeType, label: 'Rectangle', Icon: RectangleIcon },
              { type: 'L_SHAPE' as ShapeType, label: 'L-Shape', Icon: LShapeIcon },
              { type: 'U_SHAPE' as ShapeType, label: 'U-Shape', Icon: UShapeIcon },
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
      )}

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
              <p className="mt-1 text-xs text-purple-600">
                Laminated — {Math.floor((thicknessMm - 20) / 20)} layer{Math.floor((thicknessMm - 20) / 20) !== 1 ? 's' : ''}
              </p>
            )}
            {errors.thicknessMm && <p className="mt-0.5 text-xs text-red-500">{errors.thicknessMm}</p>}
          </div>

          {/* Material */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Material
            </label>
            <select
              value={materialId || ''}
              onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)}
              onClick={(e) => e.stopPropagation()}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            >
              <option value="">Select material (optional)</option>
              {materials.map((material) => (
                <option key={material.id} value={material.id}>
                  {material.name}
                  {material.collection ? ` - ${material.collection}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ── L-SHAPE dimensions (K2) ──────────────────────────────────── */}
      {shapeType === 'L_SHAPE' && (
        <div className="space-y-3">
          <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3 space-y-3">
            <p className="text-xs font-semibold text-blue-800">L-Shape Dimensions</p>
            {/* Leg 1 (long run) */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Leg 1 (long run)</p>
              <div className="flex items-center gap-2">
                {dimInput('Length (mm)', leg1Length, setLeg1Length, 'leg1Length')}
                <span className="text-gray-400 text-sm mt-4">&times;</span>
                {dimInput('Width (mm)', leg1Width, (v) => { setLeg1Width(v); if (sameWidth) setLeg2Width(v); }, 'leg1Width')}
              </div>
            </div>
            {/* Leg 2 (return) */}
            <div>
              <p className="text-xs font-medium text-gray-600 mb-1">Leg 2 (return)</p>
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
              {thicknessMm > 20 && <p className="mt-1 text-xs text-purple-600">Laminated — {Math.floor((thicknessMm - 20) / 20)} layer{Math.floor((thicknessMm - 20) / 20) !== 1 ? 's' : ''}</p>}
              {errors.thicknessMm && <p className="mt-0.5 text-xs text-red-500">{errors.thicknessMm}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <select value={materialId || ''} onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)} onClick={(e) => e.stopPropagation()} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                <option value="">Select material (optional)</option>
                {materials.map((material) => (<option key={material.id} value={material.id}>{material.name}{material.collection ? ` - ${material.collection}` : ''}</option>))}
              </select>
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
              {thicknessMm > 20 && <p className="mt-1 text-xs text-purple-600">Laminated — {Math.floor((thicknessMm - 20) / 20)} layer{Math.floor((thicknessMm - 20) / 20) !== 1 ? 's' : ''}</p>}
              {errors.thicknessMm && <p className="mt-0.5 text-xs text-red-500">{errors.thicknessMm}</p>}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Material</label>
              <select value={materialId || ''} onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)} onClick={(e) => e.stopPropagation()} className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500">
                <option value="">Select material (optional)</option>
                {materials.map((material) => (<option key={material.id} value={material.id}>{material.name}{material.collection ? ` - ${material.collection}` : ''}</option>))}
              </select>
            </div>
          </div>
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
    </div>
  );
}
