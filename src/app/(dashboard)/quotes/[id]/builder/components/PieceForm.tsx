'use client';

import { useState, useEffect } from 'react';
import { useUnits } from '@/lib/contexts/UnitContext';
import { getDimensionUnitLabel, formatAreaFromSqm } from '@/lib/utils/units';
import EdgeSelector from './EdgeSelector';
import CutoutSelector, { PieceCutout, CutoutType } from './CutoutSelector';

interface MachineOption {
  id: string;
  name: string;
  kerfWidthMm: number;
  isDefault: boolean;
}

interface QuotePiece {
  id: number;
  name: string;
  description: string | null;
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
  machineProfileId: string | null;
  quote_rooms: {
    id: number;
    name: string;
  };
}

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

interface EdgeSelections {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
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

interface PieceFormProps {
  piece?: QuotePiece;
  materials: Material[];
  edgeTypes: EdgeType[];
  cutoutTypes: CutoutType[];
  thicknessOptions: ThicknessOption[];
  roomNames: string[];
  machines?: MachineOption[];
  defaultMachineId?: string | null;
  onSave: (data: Partial<QuotePiece>, roomName: string) => void;
  onCancel: () => void;
  saving: boolean;
}

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

// Fallback thickness options if none are loaded from database
const DEFAULT_THICKNESS_OPTIONS: ThicknessOption[] = [
  { id: 'default-20', name: '20mm', value: 20, multiplier: 1.0, isDefault: true, isActive: true, sortOrder: 1 },
  { id: 'default-40', name: '40mm', value: 40, multiplier: 1.3, isDefault: false, isActive: true, sortOrder: 2 },
];

export default function PieceForm({
  piece,
  materials,
  edgeTypes,
  cutoutTypes,
  thicknessOptions,
  roomNames,
  machines = [],
  defaultMachineId,
  onSave,
  onCancel,
  saving,
}: PieceFormProps) {
  const { unitSystem } = useUnits();
  const unitLabel = getDimensionUnitLabel(unitSystem);

  const [name, setName] = useState(piece?.name || '');
  const [description, setDescription] = useState(piece?.description || '');
  const [lengthMm, setLengthMm] = useState(piece?.lengthMm?.toString() || '');
  const [widthMm, setWidthMm] = useState(piece?.widthMm?.toString() || '');
  const [thicknessMm, setThicknessMm] = useState(piece?.thicknessMm || 20);
  const [materialId, setMaterialId] = useState<number | null>(piece?.materialId || null);
  const [roomName, setRoomName] = useState(piece?.room?.name || 'Kitchen');
  const [machineProfileId, setMachineProfileId] = useState<string | null>(
    piece?.machineProfileId || defaultMachineId || null
  );
  const [edgeSelections, setEdgeSelections] = useState<EdgeSelections>({
    edgeTop: piece?.edgeTop || null,
    edgeBottom: piece?.edgeBottom || null,
    edgeLeft: piece?.edgeLeft || null,
    edgeRight: piece?.edgeRight || null,
  });
  const [cutouts, setCutouts] = useState<PieceCutout[]>(
    Array.isArray(piece?.cutouts) ? piece.cutouts : []
  );
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Update form when piece changes
  useEffect(() => {
    if (piece) {
      setName(piece.name);
      setDescription(piece.description || '');
      setLengthMm(piece.lengthMm.toString());
      setWidthMm(piece.widthMm.toString());
      setThicknessMm(piece.thicknessMm);
      setMaterialId(piece.materialId);
      setRoomName(piece.quote_rooms.name);
      setMachineProfileId(piece.machineProfileId || defaultMachineId || null);
      setEdgeSelections({
        edgeTop: piece.edgeTop || null,
        edgeBottom: piece.edgeBottom || null,
        edgeLeft: piece.edgeLeft || null,
        edgeRight: piece.edgeRight || null,
      });
      setCutouts(Array.isArray(piece.cutouts) ? piece.cutouts : []);
    } else {
      setName('');
      setDescription('');
      setLengthMm('');
      setWidthMm('');
      setThicknessMm(20);
      setMaterialId(null);
      setRoomName('Kitchen');
      setMachineProfileId(defaultMachineId || null);
      setEdgeSelections({
        edgeTop: null,
        edgeBottom: null,
        edgeLeft: null,
        edgeRight: null,
      });
      setCutouts([]);
    }
    setErrors({});
  }, [piece, defaultMachineId]);

  // Combine existing room names with standard options
  const allRoomOptions = Array.from(new Set([...STANDARD_ROOMS, ...roomNames]));

  // Get selected machine info
  const selectedMachine = machines.find(m => m.id === machineProfileId);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    const length = parseInt(lengthMm);
    if (!lengthMm || isNaN(length) || length <= 0) {
      newErrors.lengthMm = 'Length must be greater than 0';
    }

    const width = parseInt(widthMm);
    if (!widthMm || isNaN(width) || width <= 0) {
      newErrors.widthMm = 'Width must be greater than 0';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    const selectedMaterial = materials.find(m => m.id === materialId);

    onSave(
      {
        name: name.trim(),
        description: description.trim() || null,
        lengthMm: parseInt(lengthMm),
        widthMm: parseInt(widthMm),
        thicknessMm,
        materialId,
        materialName: selectedMaterial?.name || null,
        edgeTop: edgeSelections.edgeTop,
        edgeBottom: edgeSelections.edgeBottom,
        edgeLeft: edgeSelections.edgeLeft,
        edgeRight: edgeSelections.edgeRight,
        cutouts,
        machineProfileId,
      },
      roomName
    );
  };

  // Calculate area for display
  const area = lengthMm && widthMm
    ? ((parseInt(lengthMm) * parseInt(widthMm)) / 1_000_000).toFixed(2)
    : '0.00';

  return (
    <form onSubmit={handleSubmit} className="p-4 space-y-4">
      {/* Name */}
      <div>
        <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
          Name <span className="text-red-500">*</span>
        </label>
        <input
          type="text"
          id="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., Kitchen Island"
          className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
            errors.name ? 'border-red-500' : 'border-gray-300'
          }`}
        />
        {errors.name && <p className="mt-1 text-sm text-red-500">{errors.name}</p>}
      </div>

      {/* Dimensions */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="lengthMm" className="block text-sm font-medium text-gray-700 mb-1">
            Length ({unitLabel}) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="lengthMm"
            value={lengthMm}
            onChange={(e) => setLengthMm(e.target.value)}
            placeholder="3600"
            min="1"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.lengthMm ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.lengthMm && <p className="mt-1 text-sm text-red-500">{errors.lengthMm}</p>}
        </div>
        <div>
          <label htmlFor="widthMm" className="block text-sm font-medium text-gray-700 mb-1">
            Width ({unitLabel}) <span className="text-red-500">*</span>
          </label>
          <input
            type="number"
            id="widthMm"
            value={widthMm}
            onChange={(e) => setWidthMm(e.target.value)}
            placeholder="650"
            min="1"
            className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 ${
              errors.widthMm ? 'border-red-500' : 'border-gray-300'
            }`}
          />
          {errors.widthMm && <p className="mt-1 text-sm text-red-500">{errors.widthMm}</p>}
        </div>
      </div>

      {/* Area Display */}
      <div className="bg-gray-50 rounded-lg p-3 text-sm">
        <span className="text-gray-600">Calculated Area: </span>
        <span className="font-medium">{formatAreaFromSqm(parseFloat(area) || 0, unitSystem)}</span>
      </div>

      {/* Machine Profile Selection */}
      {machines.length > 0 && (
        <div>
          <label htmlFor="machineProfileId" className="block text-sm font-medium text-gray-700 mb-1">
            Fabrication Machine
          </label>
          <select
            id="machineProfileId"
            value={machineProfileId || ''}
            onChange={(e) => setMachineProfileId(e.target.value || null)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
          >
            {machines.map((machine) => (
              <option key={machine.id} value={machine.id}>
                {machine.name} ({machine.kerfWidthMm}mm kerf)
              </option>
            ))}
          </select>
          {selectedMachine && (
            <p className="mt-1 text-xs text-gray-500">
              Kerf: {selectedMachine.kerfWidthMm}mm — used for slab nesting calculations
            </p>
          )}
        </div>
      )}

      {/* Edge Selector */}
      {lengthMm && widthMm && parseInt(lengthMm) > 0 && parseInt(widthMm) > 0 && (
        <div
          className="relative"
          style={{ zIndex: 100, isolation: 'isolate' }}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <EdgeSelector
            lengthMm={parseInt(lengthMm)}
            widthMm={parseInt(widthMm)}
            edgeSelections={edgeSelections}
            edgeTypes={edgeTypes}
            onChange={setEdgeSelections}
          />
        </div>
      )}

      {/* Mitre Lamination Strip Auto-Calculation */}
      {thicknessMm >= 40 && (() => {
        const kerfMm = selectedMachine?.kerfWidthMm ?? 8;
        const edgeEntries = [
          { side: 'Top', id: edgeSelections.edgeTop, lengthMm: parseInt(lengthMm) || 0 },
          { side: 'Bottom', id: edgeSelections.edgeBottom, lengthMm: parseInt(lengthMm) || 0 },
          { side: 'Left', id: edgeSelections.edgeLeft, lengthMm: parseInt(widthMm) || 0 },
          { side: 'Right', id: edgeSelections.edgeRight, lengthMm: parseInt(widthMm) || 0 },
        ];
        const mitreStrips = edgeEntries
          .filter(e => {
            if (!e.id) return false;
            const et = edgeTypes.find(t => t.id === e.id);
            return et && et.name.toLowerCase().includes('mitre');
          })
          .map(e => {
            const stripWidth = thicknessMm + kerfMm + 5;
            return { side: e.side, lengthMm: e.lengthMm, stripWidth };
          });

        if (mitreStrips.length === 0) return null;

        return (
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <h4 className="text-sm font-semibold text-purple-800 mb-2 flex items-center gap-1">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Lamination Strips (Auto-Calculated)
            </h4>
            <div className="space-y-1 text-sm">
              {mitreStrips.map(strip => (
                <div key={strip.side} className="flex justify-between text-purple-700">
                  <span>{strip.side} Mitre Strip:</span>
                  <span className="font-medium">
                    {strip.lengthMm} x {strip.stripWidth}mm
                    <span className="text-purple-500 text-xs ml-1">
                      ({thicknessMm}+{kerfMm}+5)
                    </span>
                  </span>
                </div>
              ))}
            </div>
            <p className="text-xs text-purple-500 mt-2">
              Strips auto-added to Optimizer required piece list
            </p>
          </div>
        );
      })()}

      {/* Cutout Selector */}
      {cutoutTypes.length > 0 && (
        <CutoutSelector
          cutouts={cutouts}
          cutoutTypes={cutoutTypes}
          onChange={setCutouts}
        />
      )}

      {/* Thickness */}
      <div>
        <label htmlFor="thicknessMm" className="block text-sm font-medium text-gray-700 mb-1">
          Thickness
        </label>
        <select
          id="thicknessMm"
          value={thicknessMm}
          onChange={(e) => setThicknessMm(parseInt(e.target.value))}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {(thicknessOptions.length > 0 ? thicknessOptions : DEFAULT_THICKNESS_OPTIONS).map((option) => (
            <option key={option.id} value={option.value}>
              {option.name}
            </option>
          ))}
        </select>
      </div>

      {/* Material */}
      <div>
        <label htmlFor="materialId" className="block text-sm font-medium text-gray-700 mb-1">
          Material
        </label>
        <select
          id="materialId"
          value={materialId || ''}
          onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
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

      {/* Room */}
      <div>
        <label htmlFor="roomName" className="block text-sm font-medium text-gray-700 mb-1">
          Room
        </label>
        <select
          id="roomName"
          value={roomName}
          onChange={(e) => setRoomName(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        >
          {allRoomOptions.map((room) => (
            <option key={room} value={room}>
              {room}
            </option>
          ))}
        </select>
      </div>

      {/* Description */}
      <div>
        <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
          Description
        </label>
        <textarea
          id="description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          placeholder="Optional notes about this piece..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
        />
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {saving ? 'Saving...' : piece ? 'Update Piece' : 'Add Piece'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="btn-secondary disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
