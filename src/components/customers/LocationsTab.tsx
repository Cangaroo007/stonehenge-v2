'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import {
  CustomerLocationData,
  formatAustralianAddress,
} from '@/lib/types/customer-location';
import { AU_STATES } from '@/lib/types/customer-contact';

interface LocationsTabProps {
  customerId: number;
}

interface LocationFormData {
  label: string;
  addressLine1: string;
  addressLine2: string;
  suburb: string;
  state: string;
  postcode: string;
  isDefault: boolean;
  notes: string;
}

const EMPTY_FORM: LocationFormData = {
  label: '',
  addressLine1: '',
  addressLine2: '',
  suburb: '',
  state: 'QLD',
  postcode: '',
  isDefault: false,
  notes: '',
};

export default function LocationsTab({ customerId }: LocationsTabProps) {
  const [locations, setLocations] = useState<CustomerLocationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingLocationId, setEditingLocationId] = useState<number | null>(null);
  const [formData, setFormData] = useState<LocationFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchLocations();
  }, [customerId]);

  const fetchLocations = async () => {
    try {
      const res = await fetch(`/api/customers/${customerId}/locations`);
      if (!res.ok) throw new Error('Failed to fetch locations');
      const data = await res.json();
      setLocations(data);
    } catch (error) {
      toast.error('Failed to load locations');
    } finally {
      setLoading(false);
    }
  };

  const handleAddNew = () => {
    setEditingLocationId(null);
    setFormData(EMPTY_FORM);
    setShowForm(true);
  };

  const handleEdit = (location: CustomerLocationData) => {
    setEditingLocationId(location.id);
    setFormData({
      label: location.label || '',
      addressLine1: location.addressLine1,
      addressLine2: location.addressLine2 || '',
      suburb: location.suburb,
      state: location.state,
      postcode: location.postcode,
      isDefault: location.isDefault,
      notes: location.notes || '',
    });
    setShowForm(true);
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingLocationId(null);
    setFormData(EMPTY_FORM);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate postcode is 4 digits
    if (!/^\d{4}$/.test(formData.postcode)) {
      toast.error('Postcode must be 4 digits');
      return;
    }

    setSaving(true);

    try {
      const isEdit = editingLocationId !== null;
      const url = isEdit
        ? `/api/customers/${customerId}/locations/${editingLocationId}`
        : `/api/customers/${customerId}/locations`;
      const method = isEdit ? 'PATCH' : 'POST';

      const payload: Record<string, unknown> = {
        label: formData.label || undefined,
        addressLine1: formData.addressLine1,
        addressLine2: formData.addressLine2 || undefined,
        suburb: formData.suburb,
        state: formData.state,
        postcode: formData.postcode,
        isDefault: formData.isDefault,
        notes: formData.notes || undefined,
      };

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to save location');
      }

      toast.success(`Location ${isEdit ? 'updated' : 'created'} successfully`);
      handleCancel();
      fetchLocations();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to save location');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (location: CustomerLocationData) => {
    const name = location.label || formatAustralianAddress(location).split('\n')[0];
    if (!confirm(`Delete ${name}?`)) return;

    try {
      const res = await fetch(
        `/api/customers/${customerId}/locations/${location.id}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Failed to delete location');
      toast.success('Location deleted');
      fetchLocations();
    } catch (error) {
      toast.error('Failed to delete location');
    }
  };

  const handleSetDefault = async (location: CustomerLocationData) => {
    try {
      const res = await fetch(
        `/api/customers/${customerId}/locations/${location.id}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isDefault: true }),
        }
      );
      if (!res.ok) throw new Error('Failed to set default');
      toast.success('Default location updated');
      fetchLocations();
    } catch (error) {
      toast.error('Failed to set default location');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[200px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-gray-600">
          Manage customer sites and delivery addresses.
        </p>
        <button onClick={handleAddNew} className="btn-primary">
          + Add Location
        </button>
      </div>

      {/* Inline Accordion Form */}
      {showForm && (
        <div className="card border-2 border-primary-200">
          <div className="px-6 py-4 border-b bg-gray-50">
            <h3 className="text-lg font-semibold text-gray-900">
              {editingLocationId !== null ? 'Edit Location' : 'Add Location'}
            </h3>
          </div>
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            <div>
              <label className="label">Label</label>
              <input
                type="text"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                className="input"
                placeholder="e.g. Head Office, Site A"
              />
            </div>

            <div>
              <label className="label">Address Line 1 *</label>
              <input
                type="text"
                required
                value={formData.addressLine1}
                onChange={(e) => setFormData({ ...formData, addressLine1: e.target.value })}
                className="input"
                placeholder="Street address"
              />
            </div>

            <div>
              <label className="label">Address Line 2</label>
              <input
                type="text"
                value={formData.addressLine2}
                onChange={(e) => setFormData({ ...formData, addressLine2: e.target.value })}
                className="input"
                placeholder="Unit, suite, etc."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Suburb *</label>
                <input
                  type="text"
                  required
                  value={formData.suburb}
                  onChange={(e) => setFormData({ ...formData, suburb: e.target.value })}
                  className="input"
                  placeholder="Suburb"
                />
              </div>
              <div>
                <label className="label">State *</label>
                <select
                  required
                  value={formData.state}
                  onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                  className="input"
                >
                  {AU_STATES.map((state) => (
                    <option key={state} value={state}>
                      {state}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Postcode *</label>
                <input
                  type="text"
                  required
                  maxLength={4}
                  pattern="\d{4}"
                  title="Australian postcode (4 digits)"
                  value={formData.postcode}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setFormData({ ...formData, postcode: val });
                  }}
                  className="input"
                  placeholder="4000"
                />
              </div>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                className="input"
                rows={2}
                placeholder="Optional notes about this location"
              />
            </div>

            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={formData.isDefault}
                  onChange={(e) => setFormData({ ...formData, isDefault: e.target.checked })}
                  className="rounded"
                />
                <span className="text-sm text-gray-700">Default Location</span>
              </label>
            </div>

            <div className="flex justify-end gap-3 pt-2 border-t">
              <button type="button" onClick={handleCancel} className="btn-secondary">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? (
                  <span className="flex items-center gap-2">
                    <span className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></span>
                    Saving...
                  </span>
                ) : editingLocationId !== null ? (
                  'Update Location'
                ) : (
                  'Save Location'
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Locations Table */}
      {locations.length === 0 && !showForm ? (
        <div className="card p-12 text-center">
          <p className="text-gray-500 mb-4">No locations yet. Add a location to track customer sites.</p>
          <button onClick={handleAddNew} className="btn-primary">
            Add First Location
          </button>
        </div>
      ) : locations.length > 0 ? (
        <div className="card overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Label</th>
                <th className="table-header">Address</th>
                <th className="table-header">Suburb</th>
                <th className="table-header">State</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {locations.map((location) => (
                <tr key={location.id} className="hover:bg-gray-50">
                  <td className="table-cell">
                    <div className="font-medium text-gray-900">
                      {location.label || 'Unlabelled'}
                      {location.isDefault && (
                        <span className="ml-1" title="Default Location">
                          &#127968;
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="table-cell">
                    <span className="text-sm text-gray-900 whitespace-pre-line">
                      {formatAustralianAddress(location)}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className="text-sm text-gray-900">{location.suburb}</span>
                  </td>
                  <td className="table-cell">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                      {location.state}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleEdit(location)}
                        className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                      >
                        Edit
                      </button>
                      {!location.isDefault && (
                        <button
                          onClick={() => handleSetDefault(location)}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                        >
                          Set Default
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(location)}
                        className="text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
