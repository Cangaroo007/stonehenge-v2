'use client';

import { useState } from 'react';

interface Material {
  id: number;
  name: string;
  collection: string | null;
}

interface EdgeType {
  id: string;
  name: string;
}

interface PieceData {
  id: number;
  name: string;
  materialId: number | null;
  materialName: string | null;
  thicknessMm: number;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  lengthMm: number;
  widthMm: number;
}

interface ExistingOverride {
  materialId: number | null;
  thicknessMm: number | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  lengthMm: number | null;
  widthMm: number | null;
}

export interface PieceOverrideData {
  pieceId: number;
  materialId?: number | null;
  thicknessMm?: number | null;
  edgeTop?: string | null;
  edgeBottom?: string | null;
  edgeLeft?: string | null;
  edgeRight?: string | null;
  lengthMm?: number | null;
  widthMm?: number | null;
}

interface PieceOverrideEditorProps {
  piece: PieceData;
  existingOverride?: ExistingOverride;
  materials: Material[];
  edgeTypes: EdgeType[];
  onSave: (overrides: PieceOverrideData) => void;
  onClose: () => void;
}

export default function PieceOverrideEditor({
  piece,
  existingOverride,
  materials,
  edgeTypes,
  onSave,
  onClose,
}: PieceOverrideEditorProps) {
  const [materialId, setMaterialId] = useState<number | null>(
    existingOverride?.materialId ?? null
  );
  const [thicknessMm, setThicknessMm] = useState<number | null>(
    existingOverride?.thicknessMm ?? null
  );
  const [edgeTop, setEdgeTop] = useState<string | null>(
    existingOverride?.edgeTop ?? null
  );
  const [edgeBottom, setEdgeBottom] = useState<string | null>(
    existingOverride?.edgeBottom ?? null
  );
  const [edgeLeft, setEdgeLeft] = useState<string | null>(
    existingOverride?.edgeLeft ?? null
  );
  const [edgeRight, setEdgeRight] = useState<string | null>(
    existingOverride?.edgeRight ?? null
  );
  const [lengthMm, setLengthMm] = useState<number | null>(
    existingOverride?.lengthMm ?? null
  );
  const [widthMm, setWidthMm] = useState<number | null>(
    existingOverride?.widthMm ?? null
  );

  const handleSave = () => {
    const overrides: PieceOverrideData = { pieceId: piece.id };
    // Only include fields that are set (non-null = override, null = use base)
    if (materialId !== null) overrides.materialId = materialId;
    if (thicknessMm !== null) overrides.thicknessMm = thicknessMm;
    if (edgeTop !== null) overrides.edgeTop = edgeTop;
    if (edgeBottom !== null) overrides.edgeBottom = edgeBottom;
    if (edgeLeft !== null) overrides.edgeLeft = edgeLeft;
    if (edgeRight !== null) overrides.edgeRight = edgeRight;
    if (lengthMm !== null) overrides.lengthMm = lengthMm;
    if (widthMm !== null) overrides.widthMm = widthMm;
    onSave(overrides);
  };

  const edgeOptions = [
    { value: '', label: 'Use base value' },
    ...edgeTypes.map(e => ({ value: e.id, label: e.name })),
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">
            Override: {piece.name}
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            Set values that differ from the base option. Leave as &ldquo;Use base value&rdquo; to keep the original.
          </p>

          <div className="space-y-4">
            {/* Material */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Material
                <span className="text-gray-400 font-normal ml-1">
                  (base: {piece.materialName || 'None'})
                </span>
              </label>
              <select
                value={materialId ?? ''}
                onChange={(e) => setMaterialId(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Use base value</option>
                {materials.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} {m.collection ? `(${m.collection})` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Thickness */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Thickness
                <span className="text-gray-400 font-normal ml-1">
                  (base: {piece.thicknessMm}mm)
                </span>
              </label>
              <select
                value={thicknessMm ?? ''}
                onChange={(e) => setThicknessMm(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="">Use base value</option>
                <option value="20">20mm</option>
                <option value="30">30mm</option>
                <option value="40">40mm</option>
              </select>
            </div>

            {/* Edges */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Edges</label>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Top', value: edgeTop, setter: setEdgeTop, base: piece.edgeTop },
                  { label: 'Bottom', value: edgeBottom, setter: setEdgeBottom, base: piece.edgeBottom },
                  { label: 'Left', value: edgeLeft, setter: setEdgeLeft, base: piece.edgeLeft },
                  { label: 'Right', value: edgeRight, setter: setEdgeRight, base: piece.edgeRight },
                ].map(({ label, value, setter, base }) => (
                  <div key={label}>
                    <label className="block text-xs text-gray-500 mb-0.5">
                      {label}
                      {base && <span className="text-gray-400 ml-1">(base: {edgeTypes.find(e => e.id === base)?.name || base})</span>}
                    </label>
                    <select
                      value={value ?? ''}
                      onChange={(e) => setter(e.target.value || null)}
                      className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                    >
                      {edgeOptions.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Dimensions */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Dimensions (rare)</label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    Length (base: {piece.lengthMm}mm)
                  </label>
                  <input
                    type="number"
                    value={lengthMm ?? ''}
                    onChange={(e) => setLengthMm(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Use base value"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-0.5">
                    Width (base: {piece.widthMm}mm)
                  </label>
                  <input
                    type="number"
                    value={widthMm ?? ''}
                    onChange={(e) => setWidthMm(e.target.value ? parseInt(e.target.value) : null)}
                    placeholder="Use base value"
                    className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 rounded-b-xl flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
          >
            Save Override
          </button>
        </div>
      </div>
    </div>
  );
}
