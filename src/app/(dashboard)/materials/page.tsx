'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { formatCurrency, formatDate, cn } from '@/lib/utils';
import { Truck, Package, Upload, Pencil, ExternalLink } from 'lucide-react';

type TabKey = 'materials' | 'suppliers';

interface Material {
  id: number;
  name: string;
  collection: string | null;
  price_per_sqm: string;
  price_per_slab: string | null;
  wholesale_price: string | null;
  fabrication_category: string;
  is_active: boolean;
  is_discontinued: boolean;
  supplier_id: string | null;
  supplier?: {
    id: string;
    name: string;
    default_margin_percent: string | null;
  } | null;
  product_code: string | null;
  supplier_range: string | null;
  surface_finish: string | null;
  margin_override_percent: string | null;
}

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  phone: string | null;
  website: string | null;
  default_margin_percent: string;
  default_slab_length_mm: number | null;
  default_slab_width_mm: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  _count: {
    materials: number;
  };
  latestUpload?: {
    uploaded_at: string;
    status: string;
  } | null;
}

const FABRICATION_CATEGORY_LABELS: Record<string, string> = {
  ENGINEERED: 'Engineered Quartz',
  NATURAL_HARD: 'Natural (Hard)',
  NATURAL_SOFT: 'Natural (Soft)',
  NATURAL_PREMIUM: 'Natural (Premium)',
  SINTERED: 'Sintered / Porcelain',
};

export default function MaterialsPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') === 'suppliers' ? 'suppliers' : 'materials';
  const [activeTab, setActiveTab] = useState<TabKey>(initialTab);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Materials</h1>
        <div className="flex gap-2">
          {activeTab === 'materials' && (
            <Link href="/materials/new" className="btn-primary">
              + New Material
            </Link>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('materials')}
            className={cn(
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium',
              activeTab === 'materials'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            <span className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              Materials
            </span>
          </button>
          <button
            onClick={() => setActiveTab('suppliers')}
            className={cn(
              'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium',
              activeTab === 'suppliers'
                ? 'border-primary-500 text-primary-600'
                : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
            )}
          >
            <span className="flex items-center gap-2">
              <Truck className="h-4 w-4" />
              Suppliers
            </span>
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'materials' ? <MaterialsTab /> : <SuppliersTab />}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Materials Tab
   ───────────────────────────────────────────── */

function MaterialsTab() {
  const [materials, setMaterials] = useState<Material[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [supplierFilter, setSupplierFilter] = useState<string>('all');

  useEffect(() => {
    async function load() {
      try {
        const [matRes, supRes] = await Promise.all([
          fetch('/api/materials'),
          fetch('/api/suppliers'),
        ]);
        if (matRes.ok) setMaterials(await matRes.json());
        if (supRes.ok) setSuppliers(await supRes.json());
      } catch {
        // fail silently
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading materials...</p>
      </div>
    );
  }

  const filtered =
    supplierFilter === 'all'
      ? materials
      : supplierFilter === 'unassigned'
        ? materials.filter((m) => !m.supplier_id)
        : materials.filter((m) => m.supplier_id === supplierFilter);

  // Group by collection
  const grouped = filtered.reduce(
    (acc, mat) => {
      const collection = mat.collection || 'Uncategorised';
      if (!acc[collection]) acc[collection] = [];
      acc[collection].push(mat);
      return acc;
    },
    {} as Record<string, Material[]>
  );

  return (
    <div className="space-y-4">
      {/* Supplier filter */}
      <div className="flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Filter by supplier:</label>
        <select
          className="input max-w-xs"
          value={supplierFilter}
          onChange={(e) => setSupplierFilter(e.target.value)}
        >
          <option value="all">All Suppliers</option>
          <option value="unassigned">Unassigned</option>
          {suppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <span className="text-sm text-gray-500">
          {filtered.length} material{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500">
            No materials found.{' '}
            <Link href="/materials/new" className="text-primary-600 hover:text-primary-700">
              Add your first material
            </Link>
          </p>
        </div>
      ) : (
        Object.entries(grouped).map(([collection, mats]) => (
          <div key={collection} className="card">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 rounded-t-md">
              <h2 className="text-lg font-semibold">{collection}</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Name</th>
                    <th className="table-header">Supplier</th>
                    <th className="table-header">Fabrication</th>
                    <th className="table-header">Cost / Slab</th>
                    <th className="table-header">Customer Price / m&sup2;</th>
                    <th className="table-header">Status</th>
                    <th className="table-header"></th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {mats.map((material) => (
                    <tr key={material.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium">
                        {material.name}
                        {material.product_code && (
                          <span className="ml-2 text-xs text-gray-400">{material.product_code}</span>
                        )}
                      </td>
                      <td className="table-cell">
                        {material.supplier ? (
                          <Link
                            href={`/materials/suppliers/${material.supplier.id}`}
                            className="text-primary-600 hover:text-primary-700 text-sm"
                          >
                            {material.supplier.name}
                          </Link>
                        ) : (
                          <span className="text-gray-400 text-sm">Unassigned</span>
                        )}
                      </td>
                      <td className="table-cell">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                          {FABRICATION_CATEGORY_LABELS[material.fabrication_category] || material.fabrication_category}
                        </span>
                      </td>
                      <td className="table-cell">
                        {material.price_per_slab
                          ? formatCurrency(Number(material.price_per_slab))
                          : <span className="text-gray-400">&mdash;</span>}
                      </td>
                      <td className="table-cell">
                        {formatCurrency(Number(material.price_per_sqm))}
                      </td>
                      <td className="table-cell">
                        <span
                          className={cn(
                            'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
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
                      <td className="table-cell">
                        <Link
                          href={`/materials/${material.id}/edit`}
                          className="text-primary-600 hover:text-primary-700"
                        >
                          Edit
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Suppliers Tab
   ───────────────────────────────────────────── */

function SuppliersTab() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  const loadSuppliers = useCallback(async () => {
    try {
      const res = await fetch('/api/suppliers');
      if (res.ok) setSuppliers(await res.json());
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-gray-500">Loading suppliers...</p>
      </div>
    );
  }

  if (suppliers.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Truck className="mx-auto h-12 w-12 text-gray-300 mb-4" />
        <p className="text-gray-500 mb-2">No suppliers yet.</p>
        <p className="text-sm text-gray-400">
          Suppliers are created when you upload a price list or add one manually.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {suppliers.map((supplier) => (
        <SupplierCard key={supplier.id} supplier={supplier} />
      ))}
    </div>
  );
}

function SupplierCard({ supplier }: { supplier: Supplier }) {
  const slabSize =
    supplier.default_slab_length_mm && supplier.default_slab_width_mm
      ? `${supplier.default_slab_length_mm} \u00d7 ${supplier.default_slab_width_mm}mm`
      : null;

  return (
    <div className="card p-5 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-100 flex items-center justify-center shrink-0">
            <Truck className="h-5 w-5 text-zinc-500" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">{supplier.name}</h3>
            {supplier.website && (
              <a
                href={supplier.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1"
              >
                Website <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
        <span>{supplier._count.materials} material{supplier._count.materials !== 1 ? 's' : ''}</span>
        <span>{Number(supplier.default_margin_percent)}% margin</span>
        {slabSize && <span>{slabSize}</span>}
      </div>

      {/* Last upload */}
      {supplier.latestUpload && (
        <p className="text-xs text-gray-400">
          Last upload: {formatDate(supplier.latestUpload.uploaded_at)}
        </p>
      )}

      {/* Actions */}
      <div className="flex gap-2 mt-auto pt-2 border-t border-gray-100">
        <Link
          href={`/materials/suppliers/${supplier.id}`}
          className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1"
        >
          <Pencil className="h-3 w-3" /> View / Edit
        </Link>
        <Link
          href={`/materials/suppliers/${supplier.id}?upload=true`}
          className="btn-primary text-xs px-3 py-1.5 flex items-center gap-1"
        >
          <Upload className="h-3 w-3" /> Upload Price List
        </Link>
      </div>
    </div>
  );
}
