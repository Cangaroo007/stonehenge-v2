'use client';

import { useState, useEffect } from 'react';
import CutoutSelector from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';
import PieceVisualEditor from './PieceVisualEditor';
import AutocompleteInput from '@/components/ui/AutocompleteInput';

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
  }, [piece]);

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

    const length = parseInt(lengthMm);
    if (!lengthMm || isNaN(length) || length <= 0) {
      newErrors.lengthMm = 'Length must be greater than 0';
    }

    const width = parseInt(widthMm);
    if (!widthMm || isNaN(width) || width <= 0) {
      newErrors.widthMm = 'Width must be greater than 0';
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

    // For existing pieces, edges and cutouts are managed via PieceVisualEditor —
    // pass through the current piece prop values to avoid overriding them with
    // potentially stale local state.
    const payload: Record<string, unknown> = {
      lengthMm: parseInt(lengthMm),
      widthMm: parseInt(widthMm),
      thicknessMm,
      laminationMethod,
      materialId,
      materialName: selectedMaterial?.name || null,
      edgeTop: isNew ? edgeSelections.edgeTop : piece.edgeTop,
      edgeBottom: isNew ? edgeSelections.edgeBottom : piece.edgeBottom,
      edgeLeft: isNew ? edgeSelections.edgeLeft : piece.edgeLeft,
      edgeRight: isNew ? edgeSelections.edgeRight : piece.edgeRight,
      cutouts: isNew ? cutouts : piece.cutouts,
    };

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

  return (
    <div className="space-y-4">
      {/* Name field (new piece only) */}
      {isNew && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Piece Name
          </label>
          <AutocompleteInput
            value={pieceName}
            onChange={(name) => setPieceName(name)}
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

      {/* Row 1: Dimensions + Thickness + Material */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Dimensions */}
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
              setEdgeSelections(prev => ({ ...prev, [keyMap[side]]: profileId }));
            }}
          />
        </div>
      )}

      {/* Cutouts — only shown for new pieces; existing pieces use PieceVisualEditor SVG */}
      {isNew && cutoutTypes.length > 0 && (
        <div onClick={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
          <CutoutSelector
            cutouts={cutouts}
            cutoutTypes={cutoutTypes}
            onChange={setCutouts}
          />
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
