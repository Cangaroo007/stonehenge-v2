'use client';

import { useState, useEffect } from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Types ──────────────────────────────────────────────────────────────────

interface Supplier {
  id: string;
  name: string;
  contact_email: string | null;
  phone: string | null;
  website: string | null;
  default_margin_percent: number;
  default_slab_length_mm: number | null;
  default_slab_width_mm: number | null;
  default_thickness_mm: number | null;
  notes: string | null;
  is_active: boolean;
  _count: { materials: number };
}

// ─── Main page ──────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [formError, setFormError] = useState('');

  // Form fields
  const [name, setName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [defaultMarginPercent, setDefaultMarginPercent] = useState('');
  const [defaultSlabLengthMm, setDefaultSlabLengthMm] = useState('');
  const [defaultSlabWidthMm, setDefaultSlabWidthMm] = useState('');
  const [defaultThicknessMm, setDefaultThicknessMm] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((data: Supplier[]) => {
        setSuppliers(Array.isArray(data) ? data : []);
      })
      .catch(() => setSuppliers([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('Supplier name is required.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contactEmail: contactEmail.trim() || undefined,
          phone: phone.trim() || undefined,
          website: website.trim() || undefined,
          defaultMarginPercent: defaultMarginPercent
            ? parseFloat(defaultMarginPercent)
            : undefined,
          defaultSlabLengthMm: defaultSlabLengthMm
            ? parseInt(defaultSlabLengthMm, 10)
            : undefined,
          defaultSlabWidthMm: defaultSlabWidthMm
            ? parseInt(defaultSlabWidthMm, 10)
            : undefined,
          defaultThicknessMm: defaultThicknessMm
            ? parseInt(defaultThicknessMm, 10)
            : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to create supplier');
      }

      const newSupplier = await res.json() as Supplier;
      // Create response doesn't include _count — add it manually
      if (!newSupplier._count) {
        newSupplier._count = { materials: 0 };
      }

      setSuppliers((prev) =>
        [...prev, newSupplier].sort((a, b) => a.name.localeCompare(b.name)),
      );

      // Clear form
      setName('');
      setContactEmail('');
      setPhone('');
      setWebsite('');
      setDefaultMarginPercent('');
      setDefaultSlabLengthMm('');
      setDefaultSlabWidthMm('');
      setDefaultThicknessMm('');
      setNotes('');

      setToast({ message: 'Supplier added', type: 'success' });
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create supplier');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium',
            toast.type === 'success' ? 'bg-gray-900 text-white' : 'bg-red-600 text-white',
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-200" />
          )}
          {toast.message}
        </div>
      )}

      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Suppliers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage your material suppliers.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Supplier list */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              All Suppliers
            </h2>

            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-lg border border-gray-200 p-4">
                    <div className="h-4 w-40 rounded bg-gray-200 mb-2" />
                    <div className="h-3 w-28 rounded bg-gray-100" />
                  </div>
                ))}
              </div>
            ) : suppliers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center">
                <p className="text-sm text-gray-500">
                  No suppliers yet — add one using the form.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {suppliers.map((s) => (
                  <div
                    key={s.id}
                    className="rounded-lg border border-gray-200 bg-white p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-semibold text-gray-900">{s.name}</p>
                      <p className="text-sm text-gray-400 mt-0.5">
                        {s.contact_email ? (
                          <span className="text-gray-500">{s.contact_email}</span>
                        ) : (
                          'No email'
                        )}
                        <span className="mx-1.5">·</span>
                        {s._count.materials} material{s._count.materials !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 uppercase tracking-wide">
                      Active
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Add Supplier form */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">
              Add Supplier
            </h2>

            <form
              onSubmit={handleSubmit}
              className="rounded-xl border border-gray-200 bg-white p-5 space-y-4"
            >
              {/* Supplier Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Supplier Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Caesarstone, YDL Stone"
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                  required
                />
              </div>

              {/* Contact Email */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Contact Email
                </label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Phone */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Website */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Default Margin (%) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Margin (%)
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={defaultMarginPercent}
                  onChange={(e) => setDefaultMarginPercent(e.target.value)}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
                <p className="mt-1 text-xs text-gray-400">
                  Applied to all materials from this supplier unless overridden.
                </p>
              </div>

              {/* Default Slab Length (mm) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Slab Length (mm)
                </label>
                <input
                  type="number"
                  value={defaultSlabLengthMm}
                  onChange={(e) => setDefaultSlabLengthMm(e.target.value)}
                  placeholder="3200"
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Default Slab Width (mm) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Slab Width (mm)
                </label>
                <input
                  type="number"
                  value={defaultSlabWidthMm}
                  onChange={(e) => setDefaultSlabWidthMm(e.target.value)}
                  placeholder="1600"
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Default Thickness (mm) */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Default Thickness (mm)
                </label>
                <input
                  type="number"
                  value={defaultThicknessMm}
                  onChange={(e) => setDefaultThicknessMm(e.target.value)}
                  placeholder="e.g. 20"
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
                />
              </div>

              {/* Inline error */}
              {formError && (
                <div className="flex items-center gap-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                  {formError}
                </div>
              )}

              {/* Submit */}
              <button
                type="submit"
                disabled={submitting}
                className={cn(
                  'w-full rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors',
                  submitting
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-gray-900 text-white hover:bg-gray-800',
                )}
              >
                {submitting ? 'Adding…' : 'Add Supplier'}
              </button>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}
