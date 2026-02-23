'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import toast from 'react-hot-toast';
import { formatCurrency } from '@/lib/utils';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import PieceVisualEditor from '@/components/quotes/PieceVisualEditor';
import type { EdgeSide } from '@/components/quotes/PieceVisualEditor';
import type { PiecePricingBreakdown } from '@/lib/types/pricing';
import type { PieceCutout, CutoutType } from '@/app/(dashboard)/quotes/[id]/builder/components/CutoutSelector';

// ── Types ────────────────────────────────────────────────────────────────────

interface EdgeDetail {
  id: string;
  name: string;
  category: string;
}

interface MaterialDetail {
  id: number;
  name: string;
  collection: string | null;
  fabricationCategory: string;
  pricePerSqm: number;
  pricePerSlab: number;
}

interface RelatedPiece {
  id: number;
  relationType: string;
  side: string | null;
  piece: {
    id: number;
    name: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };
}

interface PieceApiData {
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
  laminationMethod: string;
  totalCost: number;
  areaSqm: number;
  materialCost: number;
  featuresCost: number;
  quoteNumber: string;
  quote_rooms: { id: number; name: string };
  edgeDetails: {
    top: EdgeDetail | null;
    bottom: EdgeDetail | null;
    left: EdgeDetail | null;
    right: EdgeDetail | null;
  };
  materialDetails: MaterialDetail | null;
  relatedPieces: RelatedPiece[];
  costBreakdown: PiecePricingBreakdown | null;
}

interface EditableFields {
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
  roomName: string;
  laminationMethod: string;
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

interface ThicknessOption {
  id: string;
  name: string;
  value: number;
  multiplier: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

interface Props {
  quoteId: string;
  pieceId: string;
  quoteNumber: string;
  initialMode: 'view' | 'edit';
}

// ── Relationship label helpers ───────────────────────────────────────────────

const RELATION_LABELS: Record<string, string> = {
  WATERFALL: 'Waterfall',
  SPLASHBACK: 'Splashback',
  RETURN_END: 'Return End',
  WINDOW_SILL: 'Window Sill',
  MITRE_JOIN: 'Mitre Join',
  BUTT_JOIN: 'Butt Join',
  LAMINATION: 'Lamination',
  ISLAND: 'Island',
};

const RELATION_ARROWS: Record<string, string> = {
  left: '\u2190',
  right: '\u2192',
  top: '\u2191',
  bottom: '\u2193',
};

// ── Component ────────────────────────────────────────────────────────────────

export default function ExpandedPieceViewClient({
  quoteId,
  pieceId,
  quoteNumber,
  initialMode,
}: Props) {
  const [mode] = useState<'view' | 'edit'>(initialMode);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pieceData, setPieceData] = useState<PieceApiData | null>(null);
  const [editFields, setEditFields] = useState<EditableFields | null>(null);
  const [originalFields, setOriginalFields] = useState<EditableFields | null>(null);

  // Reference data for edit mode
  const [materials, setMaterials] = useState<Material[]>([]);
  const [edgeTypes, setEdgeTypes] = useState<EdgeType[]>([]);
  const [cutoutTypes, setCutoutTypes] = useState<CutoutType[]>([]);
  const [thicknessOptions, setThicknessOptions] = useState<ThicknessOption[]>([]);

  const { hasUnsavedChanges, markAsChanged, markAsSaved } = useUnsavedChanges();

  // ── Dirty state detection ──────────────────────────────────────────────────

  const isDirty = useMemo(() => {
    if (!originalFields || !editFields) return false;
    return JSON.stringify(originalFields) !== JSON.stringify(editFields);
  }, [originalFields, editFields]);

  useEffect(() => {
    if (isDirty) {
      markAsChanged();
    } else {
      markAsSaved();
    }
  }, [isDirty, markAsChanged, markAsSaved]);

  // ── Data fetching ──────────────────────────────────────────────────────────

  const loadPiece = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces/${pieceId}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to load piece');
      }
      const data = await res.json() as PieceApiData;
      setPieceData(data);

      const fields: EditableFields = {
        name: data.name,
        lengthMm: data.lengthMm,
        widthMm: data.widthMm,
        thicknessMm: data.thicknessMm,
        materialId: data.materialId,
        materialName: data.materialName,
        edgeTop: data.edgeTop,
        edgeBottom: data.edgeBottom,
        edgeLeft: data.edgeLeft,
        edgeRight: data.edgeRight,
        cutouts: data.cutouts || [],
        roomName: data.quote_rooms.name,
        laminationMethod: data.laminationMethod,
      };
      setEditFields(fields);
      setOriginalFields(fields);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load piece');
    } finally {
      setLoading(false);
    }
  }, [quoteId, pieceId]);

  const loadReferenceData = useCallback(async () => {
    try {
      const [matRes, edgeRes, cutoutRes, thickRes] = await Promise.all([
        fetch('/api/materials'),
        fetch('/api/admin/pricing/edge-types'),
        fetch('/api/admin/pricing/cutout-types'),
        fetch('/api/admin/pricing/thickness-options'),
      ]);
      if (matRes.ok) setMaterials(await matRes.json());
      if (edgeRes.ok) setEdgeTypes(await edgeRes.json());
      if (cutoutRes.ok) setCutoutTypes(await cutoutRes.json());
      if (thickRes.ok) setThicknessOptions(await thickRes.json());
    } catch {
      // Reference data loading is non-fatal
    }
  }, []);

  useEffect(() => {
    loadPiece();
    if (mode === 'edit') {
      loadReferenceData();
    }
  }, [loadPiece, loadReferenceData, mode]);

  // ── Save handler ───────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    if (!editFields || !isDirty) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/pieces/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editFields),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save piece');
      }
      const updated = await res.json();
      // Update piece data with fresh response
      setPieceData((prev: PieceApiData | null) => prev ? {
        ...prev,
        ...updated,
        costBreakdown: updated.costBreakdown ?? prev.costBreakdown,
      } : prev);
      setOriginalFields({ ...editFields });
      toast.success('Piece saved');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save piece');
    } finally {
      setSaving(false);
    }
  }, [editFields, isDirty, quoteId, pieceId]);

  // ── Field update helpers ───────────────────────────────────────────────────

  const updateField = useCallback(<K extends keyof EditableFields>(
    key: K,
    value: EditableFields[K]
  ) => {
    setEditFields((prev: EditableFields | null) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  const handleEdgeChange = useCallback((side: EdgeSide, profileId: string | null) => {
    const key = `edge${side.charAt(0).toUpperCase()}${side.slice(1)}` as keyof EditableFields;
    updateField(key, profileId as EditableFields[typeof key]);
  }, [updateField]);

  const handleEdgesChange = useCallback(
    (edges: { top?: string | null; bottom?: string | null; left?: string | null; right?: string | null }) => {
      setEditFields((prev: EditableFields | null) => {
        if (!prev) return prev;
        return {
          ...prev,
          edgeTop: edges.top !== undefined ? edges.top : prev.edgeTop,
          edgeBottom: edges.bottom !== undefined ? edges.bottom : prev.edgeBottom,
          edgeLeft: edges.left !== undefined ? edges.left : prev.edgeLeft,
          edgeRight: edges.right !== undefined ? edges.right : prev.edgeRight,
        };
      });
    },
    []
  );

  const handleCutoutAdd = useCallback((cutoutTypeId: string) => {
    setEditFields((prev: EditableFields | null) => {
      if (!prev) return prev;
      const newCutout: PieceCutout = {
        id: `cut_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        cutoutTypeId,
        quantity: 1,
      };
      return { ...prev, cutouts: [...prev.cutouts, newCutout] };
    });
  }, []);

  const handleCutoutRemove = useCallback((cutoutId: string) => {
    setEditFields((prev: EditableFields | null) => {
      if (!prev) return prev;
      return { ...prev, cutouts: prev.cutouts.filter((c: PieceCutout) => c.id !== cutoutId) };
    });
  }, []);

  // ── Edge types for visual editor ───────────────────────────────────────────

  const edgeTypeOptions = useMemo(() => {
    if (edgeTypes.length > 0) {
      return edgeTypes.filter((e: EdgeType) => e.isActive).map((e: EdgeType) => ({ id: e.id, name: e.name }));
    }
    // Fallback: build from piece data
    if (!pieceData?.edgeDetails) return [];
    const items: Array<{ id: string; name: string }> = [];
    const seen = new Set<string>();
    const details = [
      pieceData.edgeDetails.top,
      pieceData.edgeDetails.bottom,
      pieceData.edgeDetails.left,
      pieceData.edgeDetails.right,
    ];
    for (const detail of details) {
      if (detail && !seen.has(detail.id)) {
        seen.add(detail.id);
        items.push({ id: detail.id, name: detail.name });
      }
    }
    return items;
  }, [edgeTypes, pieceData?.edgeDetails]);

  // ── Cutout displays for visual editor ──────────────────────────────────────

  const cutoutDisplays = useMemo(() => {
    const source = editFields?.cutouts ?? pieceData?.cutouts ?? [];
    return source.map((c: PieceCutout) => {
      const ct = cutoutTypes.find((t: CutoutType) => t.id === c.cutoutTypeId);
      return {
        id: c.id,
        typeId: c.cutoutTypeId,
        typeName: ct?.name ?? c.cutoutTypeId,
        quantity: c.quantity,
      };
    });
  }, [editFields?.cutouts, pieceData?.cutouts, cutoutTypes]);

  // ── Resolve edge names for display ─────────────────────────────────────────

  const resolveEdgeName = useCallback(
    (edgeId: string | null): string | null => {
      if (!edgeId) return null;
      const et = edgeTypes.find((e: EdgeType) => e.id === edgeId);
      if (et) return et.name;
      if (!pieceData?.edgeDetails) return null;
      const details = [
        pieceData.edgeDetails.top,
        pieceData.edgeDetails.bottom,
        pieceData.edgeDetails.left,
        pieceData.edgeDetails.right,
      ];
      for (const detail of details) {
        if (detail?.id === edgeId) return detail.name;
      }
      return null;
    },
    [edgeTypes, pieceData?.edgeDetails]
  );

  // ── Loading state ──────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin h-8 w-8 border-4 border-primary-600 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-sm text-gray-500">Loading piece details...</p>
        </div>
      </div>
    );
  }

  if (!pieceData || !editFields) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <p className="text-lg font-medium text-gray-900">Piece not found</p>
          <p className="text-sm text-gray-500 mt-1">
            The piece may have been deleted or you may not have access.
          </p>
        </div>
      </div>
    );
  }

  const isEditMode = mode === 'edit';
  const breakdown = pieceData.costBreakdown;
  const isMitred = editFields.laminationMethod === 'MITRED';

  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header Bar ──────────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href={`/quotes/${quoteId}${isEditMode ? '?mode=edit' : ''}`}
              className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Back to Quote {quoteNumber}
            </a>
            <span className="text-gray-300">|</span>
            <span className="text-sm font-medium text-gray-900">
              {editFields.roomName} &bull; {editFields.name}
            </span>
            {isDirty && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                Unsaved changes
              </span>
            )}
          </div>

          {isEditMode && (
            <button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                isDirty
                  ? 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? 'Saving\u2026' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* ── Large SVG Diagram ────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
            Piece Diagram
          </h2>
          <div className="flex justify-center" style={{ maxWidth: 700, margin: '0 auto' }}>
            <PieceVisualEditor
              lengthMm={editFields.lengthMm}
              widthMm={editFields.widthMm}
              edgeTop={editFields.edgeTop}
              edgeBottom={editFields.edgeBottom}
              edgeLeft={editFields.edgeLeft}
              edgeRight={editFields.edgeRight}
              edgeTypes={edgeTypeOptions}
              cutouts={cutoutDisplays}
              isEditMode={isEditMode}
              isMitred={isMitred}
              onEdgeChange={isEditMode ? handleEdgeChange : undefined}
              onEdgesChange={isEditMode ? handleEdgesChange : undefined}
              onCutoutAdd={isEditMode ? handleCutoutAdd : undefined}
              onCutoutRemove={isEditMode ? handleCutoutRemove : undefined}
              cutoutTypes={cutoutTypes.filter((c) => c.isActive)}
            />
          </div>
        </div>

        {/* ── Property Cards Grid ─────────────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Dimensions */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Dimensions
            </h3>
            <div className="space-y-3">
              <DimensionField
                label="Length"
                value={editFields.lengthMm}
                suffix="mm"
                isEdit={isEditMode}
                onChange={(v) => updateField('lengthMm', v)}
              />
              <DimensionField
                label="Width"
                value={editFields.widthMm}
                suffix="mm"
                isEdit={isEditMode}
                onChange={(v) => updateField('widthMm', v)}
              />
              {isEditMode && thicknessOptions.length > 0 ? (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Thickness</span>
                  <select
                    value={editFields.thicknessMm}
                    onChange={(e) => updateField('thicknessMm', Number(e.target.value))}
                    className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  >
                    {thicknessOptions.filter((t) => t.isActive).map((t) => (
                      <option key={t.id} value={t.value}>{t.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <DimensionField
                  label="Thickness"
                  value={editFields.thicknessMm}
                  suffix="mm"
                  isEdit={isEditMode}
                  onChange={(v) => updateField('thicknessMm', v)}
                />
              )}
            </div>
          </div>

          {/* Edges */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Edges
            </h3>
            <div className="space-y-2">
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => {
                const key = `edge${side.charAt(0).toUpperCase()}${side.slice(1)}` as keyof EditableFields;
                const edgeId = editFields[key] as string | null;
                const edgeName = resolveEdgeName(edgeId);
                return (
                  <div key={side} className="flex items-center justify-between">
                    <span className="text-sm text-gray-600 capitalize">{side}</span>
                    {isEditMode && edgeTypes.length > 0 ? (
                      <select
                        value={edgeId ?? ''}
                        onChange={(e) => handleEdgeChange(side, e.target.value || null)}
                        className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="">Raw</option>
                        {edgeTypes.filter((e) => e.isActive).map((e) => (
                          <option key={e.id} value={e.id}>{e.name}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-sm font-medium text-gray-900">
                        {edgeName ?? 'Raw'}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Material */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Material
            </h3>
            {isEditMode && materials.length > 0 ? (
              <select
                value={editFields.materialId ?? ''}
                onChange={(e) => {
                  const matId = e.target.value ? Number(e.target.value) : null;
                  const mat = materials.find((m) => m.id === matId);
                  updateField('materialId', matId);
                  updateField('materialName', mat?.name ?? null);
                }}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">No material</option>
                {materials.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}{m.collection ? ` (${m.collection})` : ''}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Name</span>
                  <span className="text-sm font-medium text-gray-900">
                    {pieceData.materialDetails?.name ?? editFields.materialName ?? 'None'}
                  </span>
                </div>
                {pieceData.materialDetails && (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Category</span>
                      <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded-full bg-blue-50 text-blue-700">
                        {pieceData.materialDetails.fabricationCategory.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Slab Price</span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(pieceData.materialDetails.pricePerSlab)}/slab
                      </span>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Room */}
            {isEditMode ? (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <label className="text-sm text-gray-600 block mb-1">Room</label>
                <input
                  type="text"
                  value={editFields.roomName}
                  onChange={(e) => updateField('roomName', e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            ) : (
              <div className="mt-4 pt-3 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600">Room</span>
                  <span className="text-sm font-medium text-gray-900">{editFields.roomName}</span>
                </div>
              </div>
            )}
          </div>

          {/* Cutouts */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Cutouts
            </h3>
            {cutoutDisplays.length === 0 ? (
              <p className="text-sm text-gray-400 italic">No cutouts</p>
            ) : (
              <div className="space-y-2">
                {cutoutDisplays.map((c) => (
                  <div key={c.id} className="flex items-center justify-between">
                    <span className="text-sm text-gray-900">
                      {c.quantity}&times; {c.typeName}
                    </span>
                    {isEditMode && (
                      <button
                        onClick={() => handleCutoutRemove(c.id)}
                        className="text-xs text-red-500 hover:text-red-700"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isEditMode && cutoutTypes.filter((c) => c.isActive).length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-100">
                <AddCutoutInline
                  cutoutTypes={cutoutTypes.filter((c) => c.isActive)}
                  onAdd={handleCutoutAdd}
                />
              </div>
            )}
          </div>
        </div>

        {/* ── Cost Breakdown ────────────────────────────────────────────────── */}
        {breakdown && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4">
              Cost Breakdown
            </h3>
            <div className="space-y-2">
              {breakdown.fabrication.cutting.total > 0 && (
                <CostRow
                  label="Cutting"
                  formula={`${breakdown.fabrication.cutting.quantity.toFixed(2)} ${unitShort(breakdown.fabrication.cutting.unit)} \u00D7 ${formatCurrency(breakdown.fabrication.cutting.rate)}`}
                  total={breakdown.fabrication.cutting.total}
                />
              )}
              {breakdown.fabrication.polishing.total > 0 && (
                <CostRow
                  label="Polishing"
                  formula={`${breakdown.fabrication.polishing.quantity.toFixed(2)} ${unitShort(breakdown.fabrication.polishing.unit)} \u00D7 ${formatCurrency(breakdown.fabrication.polishing.rate)}`}
                  total={breakdown.fabrication.polishing.total}
                />
              )}
              {breakdown.fabrication.edges.filter((e) => e.total > 0).map((edge, idx) => (
                <CostRow
                  key={`${edge.side}-${idx}`}
                  label={`Edge: ${edge.edgeTypeName} (${edge.side})`}
                  formula={`${edge.linearMeters.toFixed(2)} Lm \u00D7 ${formatCurrency(edge.rate)}`}
                  total={edge.total}
                />
              ))}
              {breakdown.fabrication.lamination && breakdown.fabrication.lamination.total > 0 && (
                <CostRow
                  label={`Lamination (${breakdown.fabrication.lamination.method})`}
                  formula={`${breakdown.fabrication.lamination.finishedEdgeLm.toFixed(2)} Lm \u00D7 ${formatCurrency(breakdown.fabrication.lamination.baseRate)} \u00D7 ${breakdown.fabrication.lamination.multiplier.toFixed(2)}`}
                  total={breakdown.fabrication.lamination.total}
                />
              )}
              {breakdown.fabrication.cutouts.filter((c) => c.total > 0).map((cutout, idx) => (
                <CostRow
                  key={`${cutout.cutoutTypeId}-${idx}`}
                  label={`Cutout: ${cutout.cutoutTypeName} \u00D7 ${cutout.quantity}`}
                  formula={`${cutout.quantity} \u00D7 ${formatCurrency(cutout.rate)}`}
                  total={cutout.total}
                />
              ))}
              {breakdown.fabrication.installation && breakdown.fabrication.installation.total > 0 && (
                <CostRow
                  label="Installation"
                  formula={`${breakdown.fabrication.installation.quantity.toFixed(2)} ${unitShort(breakdown.fabrication.installation.unit)} \u00D7 ${formatCurrency(breakdown.fabrication.installation.rate)}`}
                  total={breakdown.fabrication.installation.total}
                />
              )}

              {/* Oversize / join */}
              {breakdown.oversize?.isOversize && breakdown.oversize.joinCost > 0 && (
                <CostRow
                  label={`Join (${breakdown.oversize.joinCount} join${breakdown.oversize.joinCount !== 1 ? 's' : ''})`}
                  formula={`${breakdown.oversize.joinLengthLm.toFixed(2)} Lm \u00D7 ${formatCurrency(breakdown.oversize.joinRate)}`}
                  total={breakdown.oversize.joinCost}
                />
              )}

              {/* Total */}
              <div className="flex items-center justify-between pt-3 mt-2 border-t border-gray-200">
                <span className="text-sm font-bold text-gray-900">Piece Total</span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  {formatCurrency(breakdown.pieceTotal)}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── Related Pieces ────────────────────────────────────────────────── */}
        {pieceData.relatedPieces.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">
              Related Pieces
            </h3>
            <div className="space-y-2">
              {pieceData.relatedPieces.map((rp) => (
                <a
                  key={rp.id}
                  href={`/quotes/${quoteId}/pieces/${rp.piece.id}${isEditMode ? '?mode=edit' : ''}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-lg border border-gray-100 hover:bg-gray-50 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">
                      {RELATION_ARROWS[rp.side ?? ''] ?? '\u2194'}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      {rp.piece.name}
                    </span>
                    <span className="text-xs text-gray-500">
                      ({RELATION_LABELS[rp.relationType] ?? rp.relationType}
                      {rp.side ? `, ${rp.side}` : ''})
                    </span>
                  </div>
                  <span className="text-xs text-gray-400">
                    {rp.piece.lengthMm} &times; {rp.piece.widthMm} mm
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DimensionField({
  label,
  value,
  suffix,
  isEdit,
  onChange,
}: {
  label: string;
  value: number;
  suffix: string;
  isEdit: boolean;
  onChange: (v: number) => void;
}) {
  if (!isEdit) {
    return (
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-600">{label}</span>
        <span className="text-sm font-medium text-gray-900">
          {value} {suffix}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-gray-600">{label}</span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-24 px-2 py-1.5 text-sm text-right border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          min={1}
        />
        <span className="text-xs text-gray-400">{suffix}</span>
      </div>
    </div>
  );
}

function CostRow({
  label,
  formula,
  total,
}: {
  label: string;
  formula: string;
  total: number;
}) {
  const isZero = total === 0;
  return (
    <div className={`flex items-center justify-between text-sm ${isZero ? 'text-gray-400' : 'text-gray-600'}`}>
      <span className="truncate">{label}</span>
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        <span className={`text-xs ${isZero ? 'text-gray-300' : 'text-gray-400'}`}>{formula}</span>
        <span className={`font-medium tabular-nums ${isZero ? 'text-gray-300' : 'text-gray-900'}`}>
          {formatCurrency(total)}
        </span>
      </div>
    </div>
  );
}

function AddCutoutInline({
  cutoutTypes,
  onAdd,
}: {
  cutoutTypes: Array<{ id: string; name: string; baseRate: number }>;
  onAdd: (cutoutTypeId: string) => void;
}) {
  const [selectedType, setSelectedType] = useState('');

  return (
    <div className="flex items-center gap-2">
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        className="flex-1 px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
      >
        <option value="">Select cutout type...</option>
        {cutoutTypes.map((ct) => (
          <option key={ct.id} value={ct.id}>{ct.name}</option>
        ))}
      </select>
      <button
        onClick={() => {
          if (selectedType) {
            onAdd(selectedType);
            setSelectedType('');
          }
        }}
        disabled={!selectedType}
        className="px-3 py-1.5 text-sm font-medium text-blue-600 hover:text-blue-700 disabled:text-gray-400 disabled:cursor-not-allowed"
      >
        + Add
      </button>
    </div>
  );
}

function unitShort(unit: string): string {
  switch (unit) {
    case 'LINEAR_METRE': return 'Lm';
    case 'SQUARE_METRE': return 'm\u00B2';
    case 'FIXED': return '';
    case 'PER_SLAB': return 'slab';
    default: return unit;
  }
}
