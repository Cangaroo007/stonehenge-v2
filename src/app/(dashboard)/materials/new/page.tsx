'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

const FABRICATION_CATEGORIES = [
  { value: 'ENGINEERED', label: 'Engineered Quartz' },
  { value: 'NATURAL_HARD', label: 'Natural Stone (Hard) — e.g. Granite' },
  { value: 'NATURAL_SOFT', label: 'Natural Stone (Soft) — e.g. Marble' },
  { value: 'NATURAL_PREMIUM', label: 'Natural Stone (Premium) — e.g. Quartzite' },
  { value: 'SINTERED', label: 'Sintered / Porcelain' },
] as const;

export default function NewMaterialPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    collection: '',
    pricePerSqm: '',
    description: '',
    isActive: true,
    fabricationCategory: 'ENGINEERED',
    slabLengthMm: '' as string,
    slabWidthMm: '' as string,
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);

    try {
      const res = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          pricePerSqm: parseFloat(form.pricePerSqm),
          slabLengthMm: form.slabLengthMm ? parseInt(form.slabLengthMm) : null,
          slabWidthMm: form.slabWidthMm ? parseInt(form.slabWidthMm) : null,
        }),
      });

      if (res.ok) {
        toast.success('Material created!');
        router.push('/materials');
        router.refresh();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to create material');
      }
    } catch {
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">New Material</h1>

      <form onSubmit={handleSubmit} className="card p-6 space-y-4 max-w-2xl">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Name *</label>
            <input
              type="text"
              required
              className="input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g., Calacatta Nuvo"
            />
          </div>
          <div>
            <label className="label">Collection</label>
            <input
              type="text"
              className="input"
              value={form.collection}
              onChange={(e) => setForm({ ...form, collection: e.target.value })}
              placeholder="e.g., Premium Collection"
            />
          </div>
          <div>
            <label className="label">Price per m² (AUD) *</label>
            <input
              type="number"
              required
              step="0.01"
              min="0"
              className="input"
              value={form.pricePerSqm}
              onChange={(e) => setForm({ ...form, pricePerSqm: e.target.value })}
              placeholder="450.00"
            />
          </div>
          <div>
            <label className="label">Fabrication Category *</label>
            <select
              className="input"
              value={form.fabricationCategory}
              onChange={(e) => setForm({ ...form, fabricationCategory: e.target.value })}
            >
              {FABRICATION_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              Determines service rate tier for cutting, polishing, and other fabrication costs.
            </p>
          </div>
          <div>
            <label className="label">Slab Length (mm)</label>
            <input
              type="number"
              min="0"
              step="1"
              className="input"
              value={form.slabLengthMm}
              onChange={(e) => setForm({ ...form, slabLengthMm: e.target.value })}
              placeholder="e.g., 3000"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to use the default for this material type.
            </p>
          </div>
          <div>
            <label className="label">Slab Width (mm)</label>
            <input
              type="number"
              min="0"
              step="1"
              className="input"
              value={form.slabWidthMm}
              onChange={(e) => setForm({ ...form, slabWidthMm: e.target.value })}
              placeholder="e.g., 1400"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leave blank to use the default for this material type.
            </p>
          </div>
          <div className="flex items-center pt-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm text-gray-700">Active (available for quotes)</span>
            </label>
          </div>
        </div>
        <div>
          <label className="label">Description</label>
          <textarea
            className="input"
            rows={3}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={saving}>
            {saving ? 'Saving...' : 'Create Material'}
          </button>
        </div>
      </form>
    </div>
  );
}
