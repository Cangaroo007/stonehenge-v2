'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface Material {
  id: number;
  name: string;
  collection: string | null;
  is_active: boolean;
}

interface ResolvedAssignment {
  materialId: number;
  name: string;
  collection: string | null;
}

interface MappingData {
  id: number;
  templateId: number;
  finishLevel: string;
  colourScheme: string | null;
  materialAssignments: Record<string, ResolvedAssignment>;
  description: string | null;
  isActive: boolean;
}

interface MappingMatrixProps {
  templateId: number;
  materialRoles: string[]; // Roles extracted from template
}

const ROLE_LABELS: Record<string, string> = {
  PRIMARY_BENCHTOP: 'Primary Benchtop',
  SECONDARY_BENCHTOP: 'Secondary Benchtop',
  SPLASHBACK: 'Splashback',
  VANITY: 'Vanity',
  LAUNDRY: 'Laundry',
  SHOWER_SHELF: 'Shower Shelf',
  FEATURE_PANEL: 'Feature Panel',
  WINDOW_SILL: 'Window Sill',
  CUSTOM: 'Custom',
};

export default function MappingMatrix({ templateId, materialRoles }: MappingMatrixProps) {
  const [mappings, setMappings] = useState<MappingData[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null); // key of column being saved

  // New tier form
  const [showAddTier, setShowAddTier] = useState(false);
  const [newFinishLevel, setNewFinishLevel] = useState('');
  const [newColourScheme, setNewColourScheme] = useState('');

  // Copy from state
  const [copySource, setCopySource] = useState<string | null>(null);

  // Local edits: keyed by "finishLevel|colourScheme", value is role→materialId
  const [edits, setEdits] = useState<Record<string, Record<string, number | null>>>({});

  const columnKey = (m: { finishLevel: string; colourScheme: string | null }) =>
    `${m.finishLevel}|${m.colourScheme || ''}`;

  const fetchMappings = useCallback(async () => {
    try {
      const res = await fetch(`/api/templates/${templateId}/mappings?activeOnly=false`);
      if (res.ok) {
        const data: MappingData[] = await res.json();
        setMappings(data);

        // Initialize edits from existing data
        const initialEdits: Record<string, Record<string, number | null>> = {};
        for (const mapping of data) {
          const key = columnKey(mapping);
          const roleAssignments: Record<string, number | null> = {};
          for (const role of materialRoles) {
            const assignment = mapping.materialAssignments[role];
            roleAssignments[role] = assignment ? assignment.materialId : null;
          }
          initialEdits[key] = roleAssignments;
        }
        setEdits(initialEdits);
      }
    } catch (err) {
      console.error('Failed to load mappings:', err);
    }
  }, [templateId, materialRoles]);

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials');
      if (res.ok) {
        const data = await res.json();
        setMaterials(data.filter((m: Material) => m.is_active));
      }
    } catch (err) {
      console.error('Failed to load materials:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchMappings(), fetchMaterials()]).finally(() => setLoading(false));
  }, [fetchMappings, fetchMaterials]);

  // Group materials by collection for the dropdown
  const materialsByCollection = materials.reduce<Record<string, Material[]>>((acc, mat) => {
    const key = mat.collection || 'Other';
    if (!acc[key]) acc[key] = [];
    acc[key].push(mat);
    return acc;
  }, {});
  const collectionNames = Object.keys(materialsByCollection).sort();

  function handleMaterialChange(colKey: string, role: string, materialId: number | null) {
    setEdits((prev) => ({
      ...prev,
      [colKey]: {
        ...prev[colKey],
        [role]: materialId,
      },
    }));
  }

  async function handleSaveColumn(mapping: MappingData) {
    const key = columnKey(mapping);
    const roleAssignments = edits[key];
    if (!roleAssignments) return;

    // Build materialAssignments object (role → materialId), excluding null values
    const materialAssignments: Record<string, number> = {};
    for (const [role, matId] of Object.entries(roleAssignments)) {
      if (matId !== null && matId !== undefined) {
        materialAssignments[role] = matId;
      }
    }

    setSaving(key);
    try {
      const res = await fetch(`/api/templates/${templateId}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finishLevel: mapping.finishLevel,
          colourScheme: mapping.colourScheme || undefined,
          materialAssignments,
          upsert: true,
        }),
      });

      if (res.ok) {
        toast.success(`Saved ${mapping.finishLevel}${mapping.colourScheme ? ' / ' + mapping.colourScheme : ''}`);
        await fetchMappings();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to save mapping');
      }
    } catch (err) {
      toast.error('Failed to save mapping');
    } finally {
      setSaving(null);
    }
  }

  async function handleAddTier() {
    if (!newFinishLevel.trim()) {
      toast.error('Finish level is required');
      return;
    }

    const key = `${newFinishLevel.trim()}|${newColourScheme.trim()}`;

    // If copying from another tier, use its assignments
    let materialAssignments: Record<string, number> = {};
    if (copySource) {
      const sourceEdits = edits[copySource];
      if (sourceEdits) {
        for (const [role, matId] of Object.entries(sourceEdits)) {
          if (matId !== null && matId !== undefined) {
            materialAssignments[role] = matId;
          }
        }
      }
    }

    setSaving('new');
    try {
      const res = await fetch(`/api/templates/${templateId}/mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          finishLevel: newFinishLevel.trim(),
          colourScheme: newColourScheme.trim() || undefined,
          materialAssignments,
          upsert: false,
        }),
      });

      if (res.ok) {
        toast.success('Tier added');
        setNewFinishLevel('');
        setNewColourScheme('');
        setCopySource(null);
        setShowAddTier(false);
        await fetchMappings();
      } else {
        const data = await res.json();
        toast.error(data.error || 'Failed to add tier');
      }
    } catch (err) {
      toast.error('Failed to add tier');
    } finally {
      setSaving(null);
    }
  }

  async function handleDeleteTier(mapping: MappingData) {
    if (!confirm(`Delete mapping for ${mapping.finishLevel}${mapping.colourScheme ? ' / ' + mapping.colourScheme : ''}?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/templates/${templateId}/mappings/${mapping.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        toast.success('Mapping deleted');
        await fetchMappings();
      } else {
        toast.error('Failed to delete mapping');
      }
    } catch (err) {
      toast.error('Failed to delete mapping');
    }
  }

  function handleCopyFrom(sourceKey: string, targetKey: string) {
    const sourceEdits = edits[sourceKey];
    if (!sourceEdits) return;
    setEdits((prev) => ({
      ...prev,
      [targetKey]: { ...sourceEdits },
    }));
    toast.success('Copied — remember to save');
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-8 bg-gray-100 rounded"></div>
          <div className="h-8 bg-gray-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (materialRoles.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">Finish Tier Mappings</h3>
        <p className="text-gray-500 text-sm">
          This template has no material roles defined. Add rooms and pieces with material roles first.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">Finish Tier Mappings</h3>
          <p className="text-sm text-gray-500 mt-1">
            Assign materials to each role for different finish levels and colour schemes.
          </p>
        </div>
        <button
          onClick={() => setShowAddTier(!showAddTier)}
          className="btn-primary text-sm"
        >
          + Add Tier
        </button>
      </div>

      {/* Add Tier Form */}
      {showAddTier && (
        <div className="p-6 border-b border-gray-200 bg-gray-50">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Finish Level *</label>
              <input
                type="text"
                value={newFinishLevel}
                onChange={(e) => setNewFinishLevel(e.target.value)}
                placeholder="e.g., STANDARD"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Colour Scheme</label>
              <input
                type="text"
                value={newColourScheme}
                onChange={(e) => setNewColourScheme(e.target.value)}
                placeholder="e.g., SCHEME_A"
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              />
            </div>
            {mappings.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Copy From</label>
                <select
                  value={copySource || ''}
                  onChange={(e) => setCopySource(e.target.value || null)}
                  className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
                >
                  <option value="">— None —</option>
                  {mappings.map((m) => {
                    const key = columnKey(m);
                    return (
                      <option key={key} value={key}>
                        {m.finishLevel}{m.colourScheme ? ` / ${m.colourScheme}` : ''}
                      </option>
                    );
                  })}
                </select>
              </div>
            )}
            <button
              onClick={handleAddTier}
              disabled={!newFinishLevel.trim() || saving === 'new'}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
            >
              {saving === 'new' ? 'Adding...' : 'Add'}
            </button>
            <button
              onClick={() => { setShowAddTier(false); setCopySource(null); }}
              className="px-4 py-2 text-gray-600 hover:text-gray-800 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {mappings.length === 0 ? (
        <div className="p-6 text-center text-gray-500 text-sm">
          No finish tier mappings yet. Click &quot;Add Tier&quot; to create the first one.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider border-b sticky left-0 bg-gray-50 z-10 min-w-[160px]">
                  Material Role
                </th>
                {mappings.map((mapping) => {
                  const key = columnKey(mapping);
                  return (
                    <th key={key} className="text-left px-4 py-3 border-b min-w-[200px]">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-xs font-medium text-gray-900">{mapping.finishLevel}</p>
                          {mapping.colourScheme && (
                            <p className="text-xs text-gray-500">{mapping.colourScheme}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Copy from dropdown */}
                          <select
                            className="text-xs border rounded px-1 py-0.5 text-gray-500"
                            value=""
                            onChange={(e) => {
                              if (e.target.value) {
                                handleCopyFrom(e.target.value, key);
                              }
                            }}
                            title="Copy assignments from another tier"
                          >
                            <option value="">Copy...</option>
                            {mappings
                              .filter((m) => columnKey(m) !== key)
                              .map((m) => {
                                const srcKey = columnKey(m);
                                return (
                                  <option key={srcKey} value={srcKey}>
                                    {m.finishLevel}{m.colourScheme ? ` / ${m.colourScheme}` : ''}
                                  </option>
                                );
                              })}
                          </select>
                          <button
                            onClick={() => handleDeleteTier(mapping)}
                            className="text-gray-400 hover:text-red-600 p-0.5"
                            title="Delete this tier"
                          >
                            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {materialRoles.map((role) => (
                <tr key={role} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-700 font-medium sticky left-0 bg-white z-10">
                    {ROLE_LABELS[role] || role}
                  </td>
                  {mappings.map((mapping) => {
                    const key = columnKey(mapping);
                    const currentValue = edits[key]?.[role] ?? null;
                    const isEmpty = currentValue === null || currentValue === undefined;

                    return (
                      <td
                        key={key}
                        className={`px-4 py-2 ${isEmpty ? 'bg-red-50' : ''}`}
                      >
                        <select
                          value={currentValue ?? ''}
                          onChange={(e) => {
                            const val = e.target.value ? parseInt(e.target.value, 10) : null;
                            handleMaterialChange(key, role, val);
                          }}
                          className={`w-full px-2 py-1.5 border rounded text-sm ${
                            isEmpty
                              ? 'border-red-300 bg-red-50 text-red-800'
                              : 'border-gray-300'
                          }`}
                        >
                          <option value="">— Select Material —</option>
                          {collectionNames.map((collection) => (
                            <optgroup key={collection} label={collection}>
                              {materialsByCollection[collection].map((mat) => (
                                <option key={mat.id} value={mat.id}>
                                  {mat.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </td>
                    );
                  })}
                </tr>
              ))}
              {/* Save row */}
              <tr>
                <td className="px-4 py-3 sticky left-0 bg-white z-10"></td>
                {mappings.map((mapping) => {
                  const key = columnKey(mapping);
                  const isSaving = saving === key;
                  return (
                    <td key={key} className="px-4 py-3">
                      <button
                        onClick={() => handleSaveColumn(mapping)}
                        disabled={isSaving}
                        className="w-full px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Save'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
