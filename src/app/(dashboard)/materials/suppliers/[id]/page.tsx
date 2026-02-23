'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import toast from 'react-hot-toast';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import {
  ArrowLeft,
  Pencil,
  Upload,
  Check,
  X,
  Globe,
  Mail,
  Phone,
  FileText,
  Loader2,
  ChevronRight,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';

/* ─────────────────────────────────────────────
   Types
   ───────────────────────────────────────────── */

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  phone: string | null;
  website: string | null;
  default_margin_percent: string;
  default_slab_length_mm: number | null;
  default_slab_width_mm: number | null;
  default_thickness_mm: number | null;
  notes: string | null;
  is_active: boolean;
  _count: {
    materials: number;
    price_list_uploads: number;
  };
}

interface SupplierMaterial {
  id: number;
  name: string;
  product_code: string | null;
  supplier_range: string | null;
  surface_finish: string | null;
  price_per_slab: string | null;
  wholesale_price: string | null;
  price_per_sqm: string;
  margin_override_percent: string | null;
  slab_length_mm: number | null;
  slab_width_mm: number | null;
  fabrication_category: string;
  is_active: boolean;
  is_discontinued: boolean;
}

interface PriceListUpload {
  id: string;
  file_name: string;
  uploaded_at: string;
  status: string;
  materials_created: number;
  materials_updated: number;
  materials_discontinued: number;
  materials_skipped: number;
  processed_at: string | null;
  error_message: string | null;
}

interface PreviewMaterial {
  name: string;
  productCode: string | null;
  range: string;
  costPrice: number;
  wholesalePrice: number;
  matchType: 'exact_code' | 'name_match' | 'new';
  action: 'create' | 'update' | 'skip';
  priceChange: {
    oldCostPrice: number | null;
    newCostPrice: number;
    oldWholesalePrice: number | null;
    newWholesalePrice: number;
    percentChange: number | null;
  } | null;
}

type StatusFilter = 'all' | 'active' | 'discontinued';

const FABRICATION_CATEGORIES = [
  { value: 'ENGINEERED', label: 'Engineered Quartz' },
  { value: 'NATURAL_HARD', label: 'Natural (Hard)' },
  { value: 'NATURAL_SOFT', label: 'Natural (Soft)' },
  { value: 'NATURAL_PREMIUM', label: 'Natural (Premium)' },
  { value: 'SINTERED', label: 'Sintered / Porcelain' },
] as const;

/* ─────────────────────────────────────────────
   Main Page
   ───────────────────────────────────────────── */

export default function SupplierDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supplierId = params.id as string;

  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [materials, setMaterials] = useState<SupplierMaterial[]>([]);
  const [uploads, setUploads] = useState<PriceListUpload[]>([]);
  const [loading, setLoading] = useState(true);

  // Margin editing
  const [editingMargin, setEditingMargin] = useState(false);
  const [marginValue, setMarginValue] = useState('');

  // Status filter
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Upload wizard state
  const [showUploadWizard, setShowUploadWizard] = useState(searchParams.get('upload') === 'true');

  const loadData = useCallback(async () => {
    try {
      const [supRes, matRes, upRes] = await Promise.all([
        fetch(`/api/suppliers/${supplierId}`),
        fetch(`/api/suppliers/${supplierId}/materials`),
        fetch(`/api/suppliers/${supplierId}/price-lists`),
      ]);

      if (!supRes.ok) {
        toast.error('Supplier not found');
        router.push('/materials');
        return;
      }

      const supData = await supRes.json();
      setSupplier(supData);
      setMarginValue(String(Number(supData.default_margin_percent || 0)));

      if (matRes.ok) setMaterials(await matRes.json());
      if (upRes.ok) setUploads(await upRes.json());
    } catch {
      toast.error('Failed to load supplier data');
    } finally {
      setLoading(false);
    }
  }, [supplierId, router]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  async function saveMargin() {
    try {
      const res = await fetch(`/api/suppliers/${supplierId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ defaultMarginPercent: parseFloat(marginValue) }),
      });
      if (res.ok) {
        toast.success('Margin updated');
        setEditingMargin(false);
        loadData();
      } else {
        toast.error('Failed to update margin');
      }
    } catch {
      toast.error('Failed to update margin');
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading supplier...</p>
      </div>
    );
  }

  if (!supplier) return null;

  const filteredMaterials =
    statusFilter === 'all'
      ? materials
      : statusFilter === 'active'
        ? materials.filter((m) => m.is_active && !m.is_discontinued)
        : materials.filter((m) => m.is_discontinued);

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link href="/materials" className="hover:text-gray-700 flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" /> Materials
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900">Suppliers</span>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900">{supplier.name}</span>
      </div>

      {/* ─── Header ─── */}
      <div className="card p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{supplier.name}</h1>
            <div className="mt-2 flex flex-wrap gap-4 text-sm text-gray-600">
              {supplier.contact_email && (
                <span className="flex items-center gap-1">
                  <Mail className="h-4 w-4 text-gray-400" /> {supplier.contact_email}
                </span>
              )}
              {supplier.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="h-4 w-4 text-gray-400" /> {supplier.phone}
                </span>
              )}
              {supplier.website && (
                <a
                  href={supplier.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-primary-600 hover:text-primary-700"
                >
                  <Globe className="h-4 w-4" /> {supplier.website}
                </a>
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <Link
              href={`/materials/suppliers/${supplierId}/edit`}
              className="btn-secondary text-sm flex items-center gap-1"
            >
              <Pencil className="h-4 w-4" /> Edit
            </Link>
            <button
              onClick={() => setShowUploadWizard(true)}
              className="btn-primary text-sm flex items-center gap-1"
            >
              <Upload className="h-4 w-4" /> Upload Price List
            </button>
          </div>
        </div>
      </div>

      {/* ─── Margin Settings ─── */}
      <div className="card p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Default Margin</h2>
        <div className="flex items-center gap-3">
          {editingMargin ? (
            <>
              <input
                type="number"
                step="0.1"
                min="0"
                max="100"
                className="input w-24"
                value={marginValue}
                onChange={(e) => setMarginValue(e.target.value)}
              />
              <span className="text-sm text-gray-500">%</span>
              <button onClick={saveMargin} className="p-1.5 rounded hover:bg-green-50 text-green-600">
                <Check className="h-4 w-4" />
              </button>
              <button
                onClick={() => {
                  setEditingMargin(false);
                  setMarginValue(String(Number(supplier.default_margin_percent)));
                }}
                className="p-1.5 rounded hover:bg-red-50 text-red-600"
              >
                <X className="h-4 w-4" />
              </button>
            </>
          ) : (
            <>
              <span className="text-2xl font-bold text-gray-900">
                {Number(supplier.default_margin_percent)}%
              </span>
              <button
                onClick={() => setEditingMargin(true)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400"
              >
                <Pencil className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Applied to all materials from this supplier unless overridden per material.
        </p>
      </div>

      {/* ─── Materials Table ─── */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">
            Materials ({materials.length})
          </h2>
          <div className="flex gap-2">
            {(['all', 'active', 'discontinued'] as StatusFilter[]).map((f) => (
              <button
                key={f}
                onClick={() => setStatusFilter(f)}
                className={cn(
                  'px-3 py-1.5 rounded-md text-xs font-medium',
                  statusFilter === f
                    ? 'bg-primary-100 text-primary-700'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                )}
              >
                {f === 'all' ? 'All' : f === 'active' ? 'Active' : 'Discontinued'}
              </button>
            ))}
          </div>
        </div>
        {filteredMaterials.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No materials match this filter.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">Code</th>
                  <th className="table-header">Name</th>
                  <th className="table-header">Range</th>
                  <th className="table-header">Finish</th>
                  <th className="table-header">Cost Price</th>
                  <th className="table-header">Wholesale</th>
                  <th className="table-header">Margin Override</th>
                  <th className="table-header">Slab Size</th>
                  <th className="table-header">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredMaterials.map((mat) => (
                  <MaterialRow
                    key={mat.id}
                    material={mat}
                    supplierMargin={Number(supplier.default_margin_percent)}
                    onUpdated={loadData}
                    supplierId={supplierId}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Price List History ─── */}
      <div className="card">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Price List History</h2>
        </div>
        {uploads.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No price lists uploaded yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="table-header">File</th>
                  <th className="table-header">Uploaded</th>
                  <th className="table-header">Status</th>
                  <th className="table-header">Created</th>
                  <th className="table-header">Updated</th>
                  <th className="table-header">Discontinued</th>
                  <th className="table-header">Skipped</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {uploads.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="table-cell font-medium flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400 shrink-0" />
                      <span className="truncate max-w-[200px]">{u.file_name}</span>
                    </td>
                    <td className="table-cell">{formatDate(u.uploaded_at)}</td>
                    <td className="table-cell">
                      <UploadStatusBadge status={u.status} />
                    </td>
                    <td className="table-cell">{u.materials_created}</td>
                    <td className="table-cell">{u.materials_updated}</td>
                    <td className="table-cell">{u.materials_discontinued}</td>
                    <td className="table-cell">{u.materials_skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Upload Wizard Modal ─── */}
      {showUploadWizard && (
        <UploadWizard
          supplierId={supplierId}
          supplierName={supplier.name}
          onClose={() => setShowUploadWizard(false)}
          onComplete={() => {
            setShowUploadWizard(false);
            loadData();
          }}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Material Row with inline margin edit
   ───────────────────────────────────────────── */

function MaterialRow({
  material,
  supplierMargin,
  onUpdated,
  supplierId,
}: {
  material: SupplierMaterial;
  supplierMargin: number;
  onUpdated: () => void;
  supplierId: string;
}) {
  const [editingOverride, setEditingOverride] = useState(false);
  const [overrideValue, setOverrideValue] = useState(material.margin_override_percent || '');

  const slabSize =
    material.slab_length_mm && material.slab_width_mm
      ? `${material.slab_length_mm} \u00d7 ${material.slab_width_mm}mm`
      : '\u2014';

  async function saveOverride() {
    try {
      const res = await fetch(`/api/materials/${material.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          marginOverridePercent: overrideValue ? parseFloat(overrideValue) : null,
        }),
      });
      if (res.ok) {
        toast.success('Margin override updated');
        setEditingOverride(false);
        onUpdated();
      } else {
        toast.error('Failed to save');
      }
    } catch {
      toast.error('Failed to save');
    }
  }

  return (
    <tr className="hover:bg-gray-50">
      <td className="table-cell text-xs text-gray-500">{material.product_code || '\u2014'}</td>
      <td className="table-cell font-medium">{material.name}</td>
      <td className="table-cell text-sm">{material.supplier_range || '\u2014'}</td>
      <td className="table-cell text-sm">{material.surface_finish || '\u2014'}</td>
      <td className="table-cell">
        {material.price_per_slab ? formatCurrency(Number(material.price_per_slab)) : '\u2014'}
      </td>
      <td className="table-cell">
        {material.wholesale_price ? formatCurrency(Number(material.wholesale_price)) : '\u2014'}
      </td>
      <td className="table-cell">
        {editingOverride ? (
          <span className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              className="input w-16 py-0.5 text-xs"
              value={overrideValue}
              onChange={(e) => setOverrideValue(e.target.value)}
              placeholder={`${supplierMargin}%`}
            />
            <button onClick={saveOverride} className="text-green-600 hover:text-green-700">
              <Check className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => setEditingOverride(false)} className="text-red-600 hover:text-red-700">
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ) : (
          <button
            onClick={() => setEditingOverride(true)}
            className="text-sm text-gray-600 hover:text-primary-600"
          >
            {material.margin_override_percent
              ? `${Number(material.margin_override_percent)}%`
              : `Use default ${supplierMargin}%`}
          </button>
        )}
      </td>
      <td className="table-cell">{slabSize}</td>
      <td className="table-cell">
        <span
          className={cn(
            'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
            material.is_discontinued
              ? 'bg-red-100 text-red-800'
              : material.is_active
                ? 'bg-green-100 text-green-800'
                : 'bg-gray-100 text-gray-800'
          )}
        >
          {material.is_discontinued ? 'Discontinued' : material.is_active ? 'Active' : 'Inactive'}
        </span>
      </td>
    </tr>
  );
}

/* ─────────────────────────────────────────────
   Upload Status Badge
   ───────────────────────────────────────────── */

function UploadStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    PENDING: 'bg-gray-100 text-gray-800',
    PROCESSING: 'bg-blue-100 text-blue-800',
    REVIEW: 'bg-yellow-100 text-yellow-800',
    APPLIED: 'bg-green-100 text-green-800',
    FAILED: 'bg-red-100 text-red-800',
  };

  return (
    <span className={cn('inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium', styles[status] || styles.PENDING)}>
      {status}
    </span>
  );
}

/* ─────────────────────────────────────────────
   3-Step Upload Wizard
   ───────────────────────────────────────────── */

type WizardStep = 'upload' | 'review' | 'confirm';

interface UploadWizardProps {
  supplierId: string;
  supplierName: string;
  onClose: () => void;
  onComplete: () => void;
}

function UploadWizard({ supplierId, supplierName, onClose, onComplete }: UploadWizardProps) {
  const [step, setStep] = useState<WizardStep>('upload');

  // Step A: Upload
  const [file, setFile] = useState<File | null>(null);
  const [fabricationCategory, setFabricationCategory] = useState('ENGINEERED');
  const [parsing, setParsing] = useState(false);

  // Step B: Review
  const [uploadId, setUploadId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewMaterial[]>([]);
  const [actions, setActions] = useState<Record<number, 'create' | 'update' | 'skip'>>({});

  // Step C: Confirm
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ created: number; updated: number; discontinued: number } | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped && dropped.name.toLowerCase().endsWith('.pdf')) {
      setFile(dropped);
    } else {
      toast.error('Only PDF files are accepted');
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selected = e.target.files?.[0];
    if (selected) setFile(selected);
  }

  async function handleParse() {
    if (!file) return;
    setParsing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(`/api/suppliers/${supplierId}/price-lists`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to parse');
      }

      const data = await res.json();
      setUploadId(data.uploadId);
      setPreview(data.preview);

      // Set default actions
      const defaultActions: Record<number, 'create' | 'update' | 'skip'> = {};
      data.preview.forEach((m: PreviewMaterial, i: number) => {
        defaultActions[i] = m.action;
      });
      setActions(defaultActions);

      setStep('review');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to parse price list');
    } finally {
      setParsing(false);
    }
  }

  function setAllActions(action: 'create' | 'update' | 'skip') {
    const updated: Record<number, 'create' | 'update' | 'skip'> = {};
    preview.forEach((m, i) => {
      if (action === 'skip') {
        updated[i] = 'skip';
      } else {
        // Respect the original match type
        updated[i] = m.matchType === 'new' ? (action === 'create' ? 'create' : 'skip') : (action === 'update' ? 'update' : 'skip');
      }
    });
    setActions(updated);
  }

  async function handleApply() {
    if (!uploadId) return;
    setApplying(true);

    try {
      const matches = preview.map((m, i) => ({
        parsed: {
          productCode: m.productCode,
          name: m.name,
          range: m.range,
          costPrice: m.costPrice,
          wholesalePrice: m.wholesalePrice,
          surfaceFinish: '',
          slabLengthMm: 3200,
          slabWidthMm: 1640,
          thicknessMm: 20,
          isDiscontinued: false,
          notes: null,
        },
        existingMaterialId: m.matchType !== 'new' ? null : null,
        matchType: m.matchType,
        action: actions[i] || m.action,
        priceChange: m.priceChange,
      }));

      const res = await fetch(`/api/suppliers/${supplierId}/price-lists/${uploadId}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matches, fabricationCategory }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to apply');
      }

      const data = await res.json();
      setResult({ created: data.created, updated: data.updated, discontinued: data.discontinued });
      setStep('confirm');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to apply price list');
    } finally {
      setApplying(false);
    }
  }

  // Summary stats
  const newCount = preview.filter((_, i) => actions[i] === 'create').length;
  const updateCount = preview.filter((_, i) => actions[i] === 'update').length;
  const skipCount = preview.filter((_, i) => actions[i] === 'skip').length;
  const avgPriceChange =
    preview
      .filter((m, i) => actions[i] === 'update' && m.priceChange?.percentChange)
      .reduce((sum, m) => sum + (m.priceChange?.percentChange || 0), 0) /
    (updateCount || 1);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-5xl max-h-[90vh] flex flex-col m-4">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-900">Upload Price List</h2>
            <p className="text-sm text-gray-500">{supplierName}</p>
          </div>
          {/* Step indicator */}
          <div className="flex items-center gap-2 text-sm">
            <StepIndicator label="Upload" stepNum={1} active={step === 'upload'} completed={step !== 'upload'} />
            <ChevronRight className="h-4 w-4 text-gray-300" />
            <StepIndicator label="Review" stepNum={2} active={step === 'review'} completed={step === 'confirm'} />
            <ChevronRight className="h-4 w-4 text-gray-300" />
            <StepIndicator label="Apply" stepNum={3} active={step === 'confirm'} completed={!!result} />
          </div>
          <button onClick={onClose} className="p-2 rounded hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <StepUpload
              file={file}
              fabricationCategory={fabricationCategory}
              parsing={parsing}
              onDrop={handleDrop}
              onFileSelect={handleFileSelect}
              onCategoryChange={setFabricationCategory}
              onParse={handleParse}
            />
          )}
          {step === 'review' && (
            <StepReview
              preview={preview}
              actions={actions}
              setActions={setActions}
              setAllActions={setAllActions}
              newCount={newCount}
              updateCount={updateCount}
              skipCount={skipCount}
              avgPriceChange={avgPriceChange}
            />
          )}
          {step === 'confirm' && !result && (
            <StepConfirmPre
              newCount={newCount}
              updateCount={updateCount}
              applying={applying}
              onApply={handleApply}
              onBack={() => setStep('review')}
            />
          )}
          {step === 'confirm' && result && (
            <StepConfirmPost
              result={result}
              onViewMaterials={onComplete}
              onUploadAnother={() => {
                setStep('upload');
                setFile(null);
                setPreview([]);
                setActions({});
                setUploadId(null);
                setResult(null);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Step Indicator ─── */

function StepIndicator({
  label,
  stepNum,
  active,
  completed,
}: {
  label: string;
  stepNum: number;
  active: boolean;
  completed: boolean;
}) {
  return (
    <span
      className={cn(
        'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium',
        active
          ? 'bg-primary-100 text-primary-700'
          : completed
            ? 'bg-green-100 text-green-700'
            : 'text-gray-400'
      )}
    >
      {completed && !active ? (
        <CheckCircle className="h-3.5 w-3.5" />
      ) : (
        <span className="w-4 h-4 rounded-full bg-current/20 flex items-center justify-center text-[10px]">
          {stepNum}
        </span>
      )}
      {label}
    </span>
  );
}

/* ─── Step A: Upload ─── */

function StepUpload({
  file,
  fabricationCategory,
  parsing,
  onDrop,
  onFileSelect,
  onCategoryChange,
  onParse,
}: {
  file: File | null;
  fabricationCategory: string;
  parsing: boolean;
  onDrop: (e: React.DragEvent) => void;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCategoryChange: (v: string) => void;
  onParse: () => void;
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      {/* Drop zone */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className={cn(
          'border-2 border-dashed rounded-lg p-12 text-center cursor-pointer transition-colours',
          file ? 'border-primary-300 bg-primary-50' : 'border-gray-300 hover:border-gray-400'
        )}
        onClick={() => document.getElementById('pdf-input')?.click()}
      >
        {file ? (
          <div>
            <FileText className="h-10 w-10 text-primary-500 mx-auto mb-2" />
            <p className="font-medium text-gray-900">{file.name}</p>
            <p className="text-sm text-gray-500">{(file.size / 1024).toFixed(0)} KB</p>
          </div>
        ) : (
          <div>
            <Upload className="h-10 w-10 text-gray-400 mx-auto mb-2" />
            <p className="font-medium text-gray-700">Drop a PDF here or click to browse</p>
            <p className="text-sm text-gray-400 mt-1">Accepts .pdf files only</p>
          </div>
        )}
        <input
          id="pdf-input"
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={onFileSelect}
        />
      </div>

      {/* Fabrication category */}
      <div>
        <label className="label">Default fabrication category for new materials</label>
        <select
          className="input"
          value={fabricationCategory}
          onChange={(e) => onCategoryChange(e.target.value)}
        >
          {FABRICATION_CATEGORIES.map((cat) => (
            <option key={cat.value} value={cat.value}>
              {cat.label}
            </option>
          ))}
        </select>
      </div>

      {/* Parse button */}
      <button
        onClick={onParse}
        disabled={!file || parsing}
        className="btn-primary w-full flex items-center justify-center gap-2"
      >
        {parsing ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Claude is reading your price list...
          </>
        ) : (
          'Parse Price List'
        )}
      </button>
    </div>
  );
}

/* ─── Step B: Review ─── */

function StepReview({
  preview,
  actions,
  setActions,
  setAllActions,
  newCount,
  updateCount,
  skipCount,
  avgPriceChange,
}: {
  preview: PreviewMaterial[];
  actions: Record<number, 'create' | 'update' | 'skip'>;
  setActions: (a: Record<number, 'create' | 'update' | 'skip'>) => void;
  setAllActions: (a: 'create' | 'update' | 'skip') => void;
  newCount: number;
  updateCount: number;
  skipCount: number;
  avgPriceChange: number;
}) {
  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="bg-gray-50 rounded-lg p-4 flex flex-wrap gap-4 items-center text-sm">
        <span className="font-medium text-gray-900">
          {preview.length} materials parsed:
        </span>
        <span className="text-green-700">{newCount} new</span>
        <span className="text-blue-700">
          {updateCount} update{updateCount !== 1 ? 's' : ''}
          {updateCount > 0 && ` (avg ${avgPriceChange >= 0 ? '+' : ''}${avgPriceChange.toFixed(1)}%)`}
        </span>
        <span className="text-gray-500">{skipCount} skipped</span>

        <div className="ml-auto flex gap-2">
          <button
            onClick={() => setAllActions('create')}
            className="text-xs px-2 py-1 rounded bg-green-100 text-green-700 hover:bg-green-200"
          >
            Accept All
          </button>
          <button
            onClick={() => setAllActions('skip')}
            className="text-xs px-2 py-1 rounded bg-gray-100 text-gray-600 hover:bg-gray-200"
          >
            Skip All
          </button>
        </div>
      </div>

      {/* Review table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="table-header">Status</th>
              <th className="table-header">Code</th>
              <th className="table-header">Name</th>
              <th className="table-header">Range</th>
              <th className="table-header">Cost</th>
              <th className="table-header">Wholesale</th>
              <th className="table-header">Price Change</th>
              <th className="table-header">Action</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {preview.map((m, i) => {
              const action = actions[i] || m.action;
              return (
                <tr key={i} className={cn('hover:bg-gray-50', action === 'skip' && 'opacity-50')}>
                  <td className="table-cell">
                    <MatchBadge matchType={m.matchType} />
                  </td>
                  <td className="table-cell text-xs text-gray-500">{m.productCode || '\u2014'}</td>
                  <td className="table-cell font-medium text-sm">{m.name}</td>
                  <td className="table-cell text-sm">{m.range}</td>
                  <td className="table-cell">{formatCurrency(m.costPrice)}</td>
                  <td className="table-cell">{formatCurrency(m.wholesalePrice)}</td>
                  <td className="table-cell">
                    {m.priceChange && m.priceChange.oldCostPrice !== null ? (
                      <span
                        className={cn(
                          'text-sm',
                          (m.priceChange.percentChange || 0) > 0
                            ? 'text-red-600'
                            : (m.priceChange.percentChange || 0) < 0
                              ? 'text-green-600'
                              : 'text-gray-500'
                        )}
                      >
                        {formatCurrency(m.priceChange.oldCostPrice)} &rarr; {formatCurrency(m.priceChange.newCostPrice)}
                        {m.priceChange.percentChange !== null && (
                          <span className="ml-1">
                            ({m.priceChange.percentChange >= 0 ? '+' : ''}
                            {m.priceChange.percentChange.toFixed(1)}%)
                          </span>
                        )}
                      </span>
                    ) : (
                      <span className="text-gray-400">&mdash;</span>
                    )}
                  </td>
                  <td className="table-cell">
                    <select
                      className="input py-0.5 text-xs w-24"
                      value={action}
                      onChange={(e) =>
                        setActions({
                          ...actions,
                          [i]: e.target.value as 'create' | 'update' | 'skip',
                        })
                      }
                    >
                      {m.matchType === 'new' && <option value="create">Create</option>}
                      {m.matchType !== 'new' && <option value="update">Update</option>}
                      <option value="skip">Skip</option>
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ─── Match Type Badge ─── */

function MatchBadge({ matchType }: { matchType: string }) {
  const config: Record<string, { label: string; class: string }> = {
    new: { label: 'NEW', class: 'bg-green-100 text-green-700' },
    exact_code: { label: 'UPDATE', class: 'bg-blue-100 text-blue-700' },
    name_match: { label: 'UPDATE', class: 'bg-blue-100 text-blue-700' },
  };
  const c = config[matchType] || config.new;
  return (
    <span className={cn('inline-flex items-center px-2 py-0.5 rounded text-xs font-medium', c.class)}>
      {c.label}
    </span>
  );
}

/* ─── Step C: Confirm (pre-apply) ─── */

function StepConfirmPre({
  newCount,
  updateCount,
  applying,
  onApply,
  onBack,
}: {
  newCount: number;
  updateCount: number;
  applying: boolean;
  onApply: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto">
      <h3 className="text-lg font-semibold text-gray-900">Confirm Changes</h3>

      <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
        <p>{newCount} material{newCount !== 1 ? 's' : ''} will be created</p>
        <p>{updateCount} material{updateCount !== 1 ? 's' : ''} will have prices updated</p>
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex gap-3">
        <AlertTriangle className="h-5 w-5 text-yellow-600 shrink-0 mt-0.5" />
        <div className="text-sm text-yellow-800">
          <p className="font-medium">This will update prices for all quotes using these materials.</p>
          <p className="mt-1">Existing locked or sent quotes will not be affected.</p>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={onBack} className="btn-secondary flex-1" disabled={applying}>
          Back to Review
        </button>
        <button
          onClick={onApply}
          disabled={applying}
          className="btn-primary flex-1 flex items-center justify-center gap-2"
        >
          {applying ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            'Apply Price List'
          )}
        </button>
      </div>
    </div>
  );
}

/* ─── Step C: Confirm (post-apply success) ─── */

function StepConfirmPost({
  result,
  onViewMaterials,
  onUploadAnother,
}: {
  result: { created: number; updated: number; discontinued: number };
  onViewMaterials: () => void;
  onUploadAnother: () => void;
}) {
  return (
    <div className="space-y-6 max-w-lg mx-auto text-center">
      <CheckCircle className="h-16 w-16 text-green-500 mx-auto" />
      <h3 className="text-lg font-semibold text-gray-900">Price list applied successfully</h3>
      <div className="bg-green-50 rounded-lg p-4 text-sm text-green-800">
        <p>{result.created} created, {result.updated} updated</p>
        {result.discontinued > 0 && (
          <p className="mt-1">{result.discontinued} potentially discontinued</p>
        )}
      </div>

      <div className="flex gap-3 justify-center">
        <button onClick={onViewMaterials} className="btn-secondary">
          View Materials
        </button>
        <button onClick={onUploadAnother} className="btn-primary">
          Upload Another
        </button>
      </div>
    </div>
  );
}
