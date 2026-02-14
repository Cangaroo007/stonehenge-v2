'use client';

import { useState, useEffect, useCallback } from 'react';

interface MachineProfile {
  id: string;
  name: string;
  kerfWidthMm: number;
  maxSlabLengthMm: number | null;
  maxSlabWidthMm: number | null;
  isDefault: boolean;
  isActive: boolean;
}

interface MachineOperationDefault {
  id: string;
  operationType: string;
  machineId: string;
  isDefault: boolean;
  machine: {
    id: string;
    name: string;
    kerfWidthMm: number;
    isDefault: boolean;
    isActive: boolean;
  };
}

const OPERATION_LABELS: Record<string, { label: string; description: string }> = {
  INITIAL_CUT: { label: 'Initial Cut', description: 'Extract piece from slab' },
  EDGE_POLISHING: { label: 'Edge Polishing', description: 'Finish visible profile' },
  MITRING: { label: 'Mitring', description: '45-degree bevel cut' },
  LAMINATION: { label: 'Lamination', description: 'Glue & stack drop-strips' },
  CUTOUT: { label: 'Cutouts/Features', description: 'Internal holes/sink extraction' },
};

export default function MachineManagement() {
  const [machines, setMachines] = useState<MachineProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingMachine, setEditingMachine] = useState<MachineProfile | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [operationDefaults, setOperationDefaults] = useState<MachineOperationDefault[]>([]);
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [savingDefault, setSavingDefault] = useState<string | null>(null);

  const fetchMachines = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pricing/machines');
      if (!res.ok) throw new Error('Failed to fetch machine profiles');
      const data = await res.json();
      setMachines(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchOperationDefaults = useCallback(async () => {
    setLoadingDefaults(true);
    try {
      const res = await fetch('/api/admin/pricing/machine-defaults');
      if (!res.ok) throw new Error('Failed to fetch operation defaults');
      const data = await res.json();
      setOperationDefaults(data);
    } catch (err) {
      console.error('Error fetching operation defaults:', err);
    } finally {
      setLoadingDefaults(false);
    }
  }, []);

  const handleUpdateDefault = async (operationType: string, machineId: string) => {
    setSavingDefault(operationType);
    try {
      const res = await fetch('/api/admin/pricing/machine-defaults', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operationType, machineId }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to update default');
      }

      showToast('Default machine assignment updated', 'success');
      fetchOperationDefaults();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to update default', 'error');
    } finally {
      setSavingDefault(null);
    }
  };

  useEffect(() => {
    fetchMachines();
    fetchOperationDefaults();
  }, [fetchMachines, fetchOperationDefaults]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleCreateMachine = () => {
    setEditingMachine(null);
    setModalOpen(true);
  };

  const handleEditMachine = (machine: MachineProfile) => {
    setEditingMachine(machine);
    setModalOpen(true);
  };

  const handleCloseModal = () => {
    setModalOpen(false);
    setEditingMachine(null);
  };

  const handleSaveMachine = async (machineData: Partial<MachineProfile>) => {
    try {
      const url = editingMachine 
        ? `/api/admin/pricing/machines/${editingMachine.id}` 
        : '/api/admin/pricing/machines';
      const method = editingMachine ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(machineData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save machine');
      }

      showToast(
        editingMachine ? 'Machine updated successfully' : 'Machine created successfully',
        'success'
      );
      handleCloseModal();
      fetchMachines();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save machine', 'error');
    }
  };

  const handleDeleteMachine = async (id: string) => {
    if (!confirm('Are you sure you want to delete this machine profile?')) return;

    try {
      const res = await fetch(`/api/admin/pricing/machines/${id}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to delete machine');
      }

      showToast('Machine deleted successfully', 'success');
      fetchMachines();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to delete machine', 'error');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-zinc-500">Loading machine profiles...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg bg-red-50 border border-red-200 p-4">
        <p className="text-sm text-red-800">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg ${
            toast.type === 'success' 
              ? 'bg-green-500 text-white' 
              : 'bg-red-500 text-white'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-zinc-900">Machine Profiles</h2>
          <p className="text-sm text-zinc-600 mt-1">
            Configure fabrication constraints like kerf width for your machines
          </p>
        </div>
        <button
          onClick={handleCreateMachine}
          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-medium transition-colors"
        >
          + Create Machine
        </button>
      </div>

      {/* Machine Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {machines.map((machine) => (
          <div
            key={machine.id}
            className={`bg-zinc-50 border rounded-lg p-5 transition-all hover:shadow-md ${
              machine.isDefault 
                ? 'border-amber-500 ring-2 ring-amber-200' 
                : 'border-zinc-200'
            }`}
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-zinc-900">
                  {machine.name}
                </h3>
                {machine.isDefault && (
                  <span className="inline-block mt-1 px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">
                    Default
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleEditMachine(machine)}
                  className="p-1.5 text-zinc-600 hover:text-zinc-900 hover:bg-zinc-200 rounded transition-colors"
                  title="Edit"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
                <button
                  onClick={() => handleDeleteMachine(machine.id)}
                  disabled={machine.isDefault}
                  className="p-1.5 text-red-600 hover:text-red-900 hover:bg-red-100 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  title={machine.isDefault ? 'Cannot delete default machine' : 'Delete'}
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-t border-zinc-200">
                <span className="text-sm text-zinc-600">Kerf Width:</span>
                <span className="text-sm font-semibold text-zinc-900">{machine.kerfWidthMm}mm</span>
              </div>

              {machine.maxSlabLengthMm && (
                <div className="flex items-center justify-between py-2 border-t border-zinc-200">
                  <span className="text-sm text-zinc-600">Max Slab Length:</span>
                  <span className="text-sm font-semibold text-zinc-900">{machine.maxSlabLengthMm}mm</span>
                </div>
              )}

              {machine.maxSlabWidthMm && (
                <div className="flex items-center justify-between py-2 border-t border-zinc-200">
                  <span className="text-sm text-zinc-600">Max Slab Width:</span>
                  <span className="text-sm font-semibold text-zinc-900">{machine.maxSlabWidthMm}mm</span>
                </div>
              )}

              <div className="flex items-center justify-between py-2 border-t border-zinc-200">
                <span className="text-sm text-zinc-600">Status:</span>
                <span className={`text-xs font-medium px-2 py-1 rounded ${
                  machine.isActive 
                    ? 'bg-green-100 text-green-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}>
                  {machine.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
          </div>
        ))}

        {machines.length === 0 && (
          <div className="col-span-full text-center py-12 text-zinc-500">
            <p className="mb-2">No machine profiles yet</p>
            <p className="text-sm">Click &quot;Create Machine&quot; to add your first machine</p>
          </div>
        )}
      </div>

      {/* Default Machine Assignments */}
      <div className="mt-10 pt-8 border-t border-zinc-300">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-zinc-900">Default Machine Assignments</h2>
          <p className="text-sm text-zinc-600 mt-1">
            Each fabrication operation has a default machine. These are used for cost estimation and manufacturing instructions.
          </p>
        </div>

        {loadingDefaults ? (
          <div className="text-sm text-zinc-500 py-4">Loading operation defaults...</div>
        ) : (
          <div className="bg-white border border-zinc-200 rounded-lg overflow-hidden">
            <table className="min-w-full divide-y divide-zinc-200">
              <thead className="bg-zinc-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Operation
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Description
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Default Machine
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-zinc-500 uppercase tracking-wider">
                    Kerf
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {Object.entries(OPERATION_LABELS).map(([opType, info]) => {
                  const currentDefault = operationDefaults.find(
                    (d) => d.operationType === opType
                  );
                  const activeMachines = machines.filter((m) => m.isActive);

                  return (
                    <tr key={opType} className="hover:bg-zinc-50 transition-colors">
                      <td className="px-4 py-3">
                        <span className="text-sm font-medium text-zinc-900">{info.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-500">{info.description}</span>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={currentDefault?.machineId || ''}
                          onChange={(e) => handleUpdateDefault(opType, e.target.value)}
                          disabled={savingDefault === opType}
                          className="text-sm border border-zinc-300 rounded-md px-2 py-1.5 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 disabled:opacity-50 min-w-[180px]"
                        >
                          <option value="" disabled>
                            Select machine...
                          </option>
                          {activeMachines.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                        {savingDefault === opType && (
                          <span className="ml-2 text-xs text-amber-600">Saving...</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm text-zinc-700">
                          {currentDefault?.machine?.kerfWidthMm != null
                            ? `${currentDefault.machine.kerfWidthMm}mm`
                            : '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {modalOpen && (
        <MachineModal
          machine={editingMachine}
          onSave={handleSaveMachine}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

// Machine Modal Component
interface MachineModalProps {
  machine: MachineProfile | null;
  onSave: (data: Partial<MachineProfile>) => void;
  onClose: () => void;
}

function MachineModal({ machine, onSave, onClose }: MachineModalProps) {
  const [name, setName] = useState(machine?.name || '');
  const [kerfWidthMm, setKerfWidthMm] = useState(machine?.kerfWidthMm || 8);
  const [maxSlabLengthMm, setMaxSlabLengthMm] = useState<number | null>(machine?.maxSlabLengthMm || null);
  const [maxSlabWidthMm, setMaxSlabWidthMm] = useState<number | null>(machine?.maxSlabWidthMm || null);
  const [isDefault, setIsDefault] = useState(machine?.isDefault || false);
  const [isActive, setIsActive] = useState(machine?.isActive !== false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      alert('Machine name is required');
      return;
    }

    if (kerfWidthMm <= 0) {
      alert('Kerf width must be greater than 0');
      return;
    }

    onSave({
      name: name.trim(),
      kerfWidthMm,
      maxSlabLengthMm: maxSlabLengthMm || null,
      maxSlabWidthMm: maxSlabWidthMm || null,
      isDefault,
      isActive,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-zinc-900">
            {machine ? 'Edit Machine' : 'Create Machine'}
          </h2>
          <button
            onClick={onClose}
            className="text-zinc-400 hover:text-zinc-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Machine Name */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Machine Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="e.g., GMM Bridge Saw"
              required
            />
            <p className="text-xs text-zinc-500 mt-1">The display name for this machine</p>
          </div>

          {/* Kerf Width */}
          <div>
            <label className="block text-sm font-medium text-zinc-700 mb-2">
              Kerf Width (mm) <span className="text-red-500">*</span>
            </label>
            <input
              type="number"
              value={kerfWidthMm}
              onChange={(e) => setKerfWidthMm(parseInt(e.target.value) || 0)}
              className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
              placeholder="8"
              min="1"
              required
            />
            <p className="text-xs text-zinc-500 mt-1">
              Blade width for this machine (used by Slab Optimiser)
            </p>
          </div>

          {/* Max Dimensions */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Max Slab Length (mm)
              </label>
              <input
                type="number"
                value={maxSlabLengthMm || ''}
                onChange={(e) => setMaxSlabLengthMm(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="Optional"
                min="1"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-2">
                Max Slab Width (mm)
              </label>
              <input
                type="number"
                value={maxSlabWidthMm || ''}
                onChange={(e) => setMaxSlabWidthMm(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-3 py-2 border border-zinc-300 rounded-lg focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                placeholder="Optional"
                min="1"
              />
            </div>
          </div>

          {/* Toggles */}
          <div className="space-y-3 pt-4 border-t border-zinc-200">
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-zinc-900">Set as Default</span>
                <p className="text-xs text-zinc-500">Use this machine by default in quotes</p>
              </div>
            </label>

            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="rounded border-zinc-300 text-amber-600 focus:ring-amber-500"
              />
              <div>
                <span className="text-sm font-medium text-zinc-900">Active</span>
                <p className="text-xs text-zinc-500">Machine is available for use</p>
              </div>
            </label>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-zinc-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-zinc-700 bg-white border border-zinc-300 rounded-lg hover:bg-zinc-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-amber-600 rounded-lg hover:bg-amber-700"
            >
              {machine ? 'Update Machine' : 'Create Machine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
