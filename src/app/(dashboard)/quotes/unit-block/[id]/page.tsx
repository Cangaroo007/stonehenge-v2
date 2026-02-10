'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';
import ScheduleParser from './ScheduleParser';
import MappingReadiness from './MappingReadiness';
import BulkQuoteGenerator from './BulkQuoteGenerator';

interface QuoteSummary {
  id: number;
  quote_number: string;
  status: string;
  subtotal: string | number;
  total: string | number;
}

interface Unit {
  id: number;
  unitNumber: string;
  level: number | null;
  unitTypeCode: string | null;
  finishLevel: string | null;
  colourScheme: string | null;
  status: string;
  notes: string | null;
  quote: QuoteSummary | null;
  costDelta: string | number | null;
  changeHistory: BuyerChangeRecord[] | null;
  lastChangeAt: string | null;
}

interface BuyerChangeRecord {
  id: string;
  unitId: number;
  unitNumber: string;
  changeType: string;
  description: string;
  originalValue: string;
  newValue: string;
  costImpact: number;
  timestamp: string;
  recordedBy?: string;
}

interface ChangeReport {
  totalChanges: number;
  unitsWithChanges: number;
  totalCostImpact: number;
  changesByUnit: Array<{
    unitNumber: string;
    unitId: number;
    changeCount: number;
    costDelta: number;
    changes: BuyerChangeRecord[];
  }>;
  changesByType: Record<string, { count: number; totalImpact: number }>;
}

interface UnitChangeHistory {
  originalTotal: number;
  currentTotal: number;
  costDelta: number;
  changes: BuyerChangeRecord[];
}

interface UnitBlockProject {
  id: number;
  name: string;
  projectType: string;
  status: string;
  customer: {
    id: number;
    name: string;
    company: string | null;
  } | null;
  units: Unit[];
  totalUnits: number;
  totalArea_sqm: string | number | null;
  subtotalExGst: string | number | null;
  discountAmount: string | number | null;
  gstAmount: string | number | null;
  grandTotal: string | number | null;
  volumeTier: string | null;
  volumeDiscount: string | number | null;
  address: string | null;
  suburb: string | null;
  state: string | null;
  postcode: string | null;
  description: string | null;
  createdAt: string;
}

const CHANGE_TYPES = [
  { value: 'MATERIAL_UPGRADE', label: 'Material Upgrade' },
  { value: 'EDGE_CHANGE', label: 'Edge Change' },
  { value: 'THICKNESS_CHANGE', label: 'Thickness Change' },
  { value: 'CUTOUT_CHANGE', label: 'Cutout Change' },
  { value: 'LAYOUT_CHANGE', label: 'Layout Change' },
  { value: 'OTHER', label: 'Other' },
];

function formatDelta(delta: number): string {
  if (delta > 0) return `+${formatCurrency(delta)}`;
  if (delta < 0) return `-${formatCurrency(Math.abs(delta))}`;
  return formatCurrency(0);
}

export default function UnitBlockDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<UnitBlockProject | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Add unit form state
  const [showAddUnit, setShowAddUnit] = useState(false);
  const [newUnitNumber, setNewUnitNumber] = useState('');
  const [newUnitLevel, setNewUnitLevel] = useState('');
  const [addingUnit, setAddingUnit] = useState(false);

  // Change tracking state
  const [changeReport, setChangeReport] = useState<ChangeReport | null>(null);
  const [showChangeReport, setShowChangeReport] = useState(false);
  const [selectedUnit, setSelectedUnit] = useState<Unit | null>(null);
  const [unitHistory, setUnitHistory] = useState<UnitChangeHistory | null>(null);
  const [showChangeForm, setShowChangeForm] = useState(false);
  const [submittingChange, setSubmittingChange] = useState(false);

  // Change form fields
  const [changeType, setChangeType] = useState('OTHER');
  const [changeDescription, setChangeDescription] = useState('');
  const [changeOriginalValue, setChangeOriginalValue] = useState('');
  const [changeNewValue, setChangeNewValue] = useState('');
  const [changeCostImpact, setChangeCostImpact] = useState('');

  const fetchProject = useCallback(async () => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}`);
      if (res.ok) {
        setProject(await res.json());
      } else {
        setError('Project not found');
      }
    } catch (err) {
      console.error('Failed to load project:', err);
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  const fetchChangeReport = useCallback(async () => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/change-report`);
      if (res.ok) {
        setChangeReport(await res.json());
      }
    } catch (err) {
      console.error('Failed to load change report:', err);
    }
  }, [projectId]);

  const fetchUnitHistory = useCallback(async (unitId: number) => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/units/${unitId}/changes`);
      if (res.ok) {
        setUnitHistory(await res.json());
      }
    } catch (err) {
      console.error('Failed to load unit history:', err);
    }
  }, [projectId]);

  useEffect(() => {
    fetchProject();
    fetchChangeReport();
  }, [fetchProject, fetchChangeReport]);

  const handleAddUnit = async () => {
    if (!newUnitNumber.trim()) return;
    setAddingUnit(true);
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          unitNumber: newUnitNumber.trim(),
          level: newUnitLevel ? parseInt(newUnitLevel, 10) : null,
        }),
      });
      if (res.ok) {
        setNewUnitNumber('');
        setNewUnitLevel('');
        setShowAddUnit(false);
        await fetchProject();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to add unit');
      }
    } catch (err) {
      alert('Failed to add unit');
    } finally {
      setAddingUnit(false);
    }
  };

  const handleDeleteUnit = async (unitId: number) => {
    if (!confirm('Remove this unit from the project?')) return;
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/units/${unitId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        await fetchProject();
        await fetchChangeReport();
      }
    } catch (err) {
      console.error('Failed to delete unit:', err);
    }
  };

  const handleViewChanges = async (unit: Unit) => {
    setSelectedUnit(unit);
    await fetchUnitHistory(unit.id);
  };

  const handleCloseChanges = () => {
    setSelectedUnit(null);
    setUnitHistory(null);
    setShowChangeForm(false);
    resetChangeForm();
  };

  const resetChangeForm = () => {
    setChangeType('OTHER');
    setChangeDescription('');
    setChangeOriginalValue('');
    setChangeNewValue('');
    setChangeCostImpact('');
  };

  const handleSubmitChange = async () => {
    if (!selectedUnit || !changeDescription.trim()) return;
    setSubmittingChange(true);
    try {
      const body: Record<string, unknown> = {
        changeType,
        description: changeDescription.trim(),
        unitNumber: selectedUnit.unitNumber,
        originalValue: changeOriginalValue,
        newValue: changeNewValue,
        costImpact: changeCostImpact ? parseFloat(changeCostImpact) : 0,
      };

      const res = await fetch(
        `/api/unit-blocks/${projectId}/units/${selectedUnit.id}/changes`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      if (res.ok) {
        setShowChangeForm(false);
        resetChangeForm();
        await fetchUnitHistory(selectedUnit.id);
        await fetchProject();
        await fetchChangeReport();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to record change');
      }
    } catch (err) {
      alert('Failed to record change');
    } finally {
      setSubmittingChange(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (error || !project) return <div className="text-center py-12"><p className="text-gray-500 mb-4">{error || 'Project not found'}</p><Link href="/quotes/unit-block" className="btn-secondary">Back to Projects</Link></div>;

  const totalArea = Number(project.totalArea_sqm || 0);
  const subtotal = Number(project.subtotalExGst || 0);
  const discount = Number(project.discountAmount || 0);
  const grandTotal = Number(project.grandTotal || 0);

  const hasChanges = changeReport && changeReport.totalChanges > 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/quotes/unit-block" className="text-gray-500 hover:text-gray-700">&larr; Back to Projects</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500">{project.customer?.company || project.customer?.name || 'No customer'} &bull; {project.projectType}</p>
        </div>
        <div className="flex gap-3">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
            project.status === 'DRAFT' ? 'bg-gray-100 text-gray-800' :
            project.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {project.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Units</p><p className="text-3xl font-bold text-gray-900">{project.units.length}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Total Area</p><p className="text-3xl font-bold text-gray-900">{totalArea.toFixed(2)} m&sup2;</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Volume Tier</p><p className="text-2xl font-bold text-blue-600">{project.volumeTier || 'N/A'}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Grand Total</p><p className="text-3xl font-bold text-green-600">{formatCurrency(grandTotal)}</p></div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Pricing Summary</h2></div>
        <div className="p-6">
          <div className="max-w-md space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal ({project.units.length} units):</span><span className="font-medium">{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between text-sm text-green-600"><span>Volume Discount:</span><span className="font-medium">-{formatCurrency(discount)}</span></div>
            <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-200"><span>Grand Total (incl. GST):</span><span className="text-blue-600">{formatCurrency(grandTotal)}</span></div>
          </div>
        </div>
      </div>

      {/* Finishes Schedule Parser */}
      <ScheduleParser projectId={projectId} onMappingsCreated={fetchProject} />

      {/* Mapping Readiness Dashboard */}
      <MappingReadiness projectId={projectId} />

      {/* Bulk Quote Generator */}
      <BulkQuoteGenerator projectId={projectId} onGenerationComplete={fetchProject} />

      {/* Project Change Report */}
      {hasChanges && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg shadow">
          <button
            onClick={() => setShowChangeReport(!showChangeReport)}
            className="w-full p-6 flex items-center justify-between text-left"
          >
            <div>
              <h2 className="text-lg font-semibold text-amber-900">Buyer Change Report</h2>
              <p className="text-sm text-amber-700 mt-1">
                {changeReport.totalChanges} change{changeReport.totalChanges !== 1 ? 's' : ''} across {changeReport.unitsWithChanges} unit{changeReport.unitsWithChanges !== 1 ? 's' : ''} &mdash; Total impact: <span className={changeReport.totalCostImpact >= 0 ? 'text-red-700 font-semibold' : 'text-green-700 font-semibold'}>{formatDelta(changeReport.totalCostImpact)}</span>
              </p>
            </div>
            <svg className={`h-5 w-5 text-amber-600 transition-transform ${showChangeReport ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {showChangeReport && (
            <div className="px-6 pb-6 space-y-4">
              {/* Change type breakdown */}
              <div>
                <h3 className="text-sm font-medium text-amber-900 mb-2">By Change Type</h3>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {Object.entries(changeReport.changesByType).map(([type, data]) => (
                    <div key={type} className="bg-white rounded-lg p-3 border border-amber-200">
                      <p className="text-xs text-gray-500">{type.replace(/_/g, ' ')}</p>
                      <p className="text-sm font-medium">{data.count} change{data.count !== 1 ? 's' : ''}</p>
                      <p className={`text-xs font-medium ${data.totalImpact >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                        {formatDelta(data.totalImpact)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Per-unit breakdown */}
              <div>
                <h3 className="text-sm font-medium text-amber-900 mb-2">By Unit</h3>
                <div className="space-y-2">
                  {changeReport.changesByUnit.map((unitReport) => (
                    <div key={unitReport.unitId} className="bg-white rounded-lg p-4 border border-amber-200">
                      <div className="flex items-center justify-between mb-2">
                        <p className="font-medium text-gray-900">Unit {unitReport.unitNumber}</p>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-gray-500">{unitReport.changeCount} change{unitReport.changeCount !== 1 ? 's' : ''}</span>
                          <span className={`text-sm font-semibold ${unitReport.costDelta >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatDelta(unitReport.costDelta)}
                          </span>
                        </div>
                      </div>
                      <div className="space-y-1">
                        {unitReport.changes.map((change) => (
                          <div key={change.id} className="text-xs text-gray-600 flex justify-between">
                            <span>{change.description}</span>
                            <span className={change.costImpact >= 0 ? 'text-red-500' : 'text-green-500'}>
                              {formatDelta(change.costImpact)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Units</h2>
          <button onClick={() => setShowAddUnit(!showAddUnit)} className="btn-primary text-sm">
            + Add Unit
          </button>
        </div>

        {showAddUnit && (
          <div className="p-6 border-b border-gray-200 bg-gray-50">
            <div className="flex items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Unit Number *</label>
                <input type="text" value={newUnitNumber} onChange={(e) => setNewUnitNumber(e.target.value)} placeholder="e.g., 1101" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Level</label>
                <input type="number" value={newUnitLevel} onChange={(e) => setNewUnitLevel(e.target.value)} placeholder="e.g., 11" className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 w-24" />
              </div>
              <button onClick={handleAddUnit} disabled={!newUnitNumber.trim() || addingUnit} className="btn-primary disabled:opacity-50">
                {addingUnit ? 'Adding...' : 'Add'}
              </button>
              <button onClick={() => setShowAddUnit(false)} className="btn-secondary">
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="divide-y divide-gray-200">
          {project.units.length === 0 ? (
            <div className="p-6 text-center text-gray-500">
              No units added yet. Click &quot;Add Unit&quot; to get started.
            </div>
          ) : (
            project.units.map((unit, index) => {
              const delta = Number(unit.costDelta || 0);
              const hasUnitChanges = unit.status === 'BUYER_CHANGE' || (unit.changeHistory && unit.changeHistory.length > 0);

              return (
                <div key={unit.id} className="p-6 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold text-sm">{index + 1}</span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900">Unit {unit.unitNumber}</p>
                          {hasUnitChanges && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              Changed
                            </span>
                          )}
                          {hasUnitChanges && delta !== 0 && (
                            <span className={`text-xs font-semibold ${delta > 0 ? 'text-red-600' : 'text-green-600'}`}>
                              {formatDelta(delta)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">
                          {unit.level != null ? `Level ${unit.level}` : ''}
                          {unit.unitTypeCode ? ` \u2022 Type ${unit.unitTypeCode}` : ''}
                          {unit.finishLevel ? ` \u2022 ${unit.finishLevel}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        {unit.quote ? (
                          <>
                            <p className="font-medium">{formatCurrency(Number(unit.quote.total))}</p>
                            <p className="text-sm text-gray-500">{unit.quote.quote_number}</p>
                          </>
                        ) : (
                          <p className="text-sm text-gray-400">No quote linked</p>
                        )}
                      </div>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        unit.status === 'APPROVED' ? 'bg-green-100 text-green-800' :
                        unit.status === 'QUOTED' ? 'bg-blue-100 text-blue-800' :
                        unit.status === 'BUYER_CHANGE' ? 'bg-amber-100 text-amber-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {unit.status}
                      </span>
                      {unit.quote && (
                        <button
                          onClick={() => handleViewChanges(unit)}
                          className="text-gray-400 hover:text-amber-600"
                          title="View / record changes"
                        >
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                      )}
                      <button onClick={() => handleDeleteUnit(unit.id)} className="text-gray-400 hover:text-red-600" title="Remove unit">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Unit Change Detail Modal */}
      {selectedUnit && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">Unit {selectedUnit.unitNumber} &mdash; Change History</h2>
                {unitHistory && (
                  <p className="text-sm text-gray-500 mt-1">
                    Original: {formatCurrency(unitHistory.originalTotal)} &rarr; Current: {formatCurrency(unitHistory.currentTotal)}
                    <span className={`ml-2 font-semibold ${unitHistory.costDelta >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      ({formatDelta(unitHistory.costDelta)})
                    </span>
                  </p>
                )}
              </div>
              <button onClick={handleCloseChanges} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Change history timeline */}
              {unitHistory && unitHistory.changes.length > 0 ? (
                <div className="space-y-3">
                  {unitHistory.changes.map((change) => (
                    <div key={change.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                              {change.changeType.replace(/_/g, ' ')}
                            </span>
                            <span className="text-xs text-gray-400">
                              {new Date(change.timestamp).toLocaleDateString('en-AU', {
                                day: '2-digit',
                                month: 'short',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                          <p className="text-sm text-gray-900 mt-1">{change.description}</p>
                          <div className="flex gap-4 mt-1 text-xs text-gray-500">
                            <span>Was: <span className="text-gray-700">{change.originalValue || '—'}</span></span>
                            <span>Now: <span className="text-gray-700">{change.newValue || '—'}</span></span>
                          </div>
                        </div>
                        <span className={`text-sm font-semibold whitespace-nowrap ${change.costImpact >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                          {formatDelta(change.costImpact)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm text-center py-4">No changes recorded yet.</p>
              )}

              {/* Record Change form */}
              {!showChangeForm ? (
                <button
                  onClick={() => setShowChangeForm(true)}
                  className="w-full py-2 px-4 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                >
                  + Record Change
                </button>
              ) : (
                <div className="border border-blue-200 rounded-lg p-4 bg-blue-50 space-y-3">
                  <h3 className="text-sm font-medium text-gray-900">Record Buyer Change</h3>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Change Type</label>
                    <select
                      value={changeType}
                      onChange={(e) => setChangeType(e.target.value)}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    >
                      {CHANGE_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Description *</label>
                    <input
                      type="text"
                      value={changeDescription}
                      onChange={(e) => setChangeDescription(e.target.value)}
                      placeholder="e.g., Upgrade kitchen stone to Calacatta"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Original Value</label>
                      <input
                        type="text"
                        value={changeOriginalValue}
                        onChange={(e) => setChangeOriginalValue(e.target.value)}
                        placeholder="e.g., Ambassador Carrara"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">New Value</label>
                      <input
                        type="text"
                        value={changeNewValue}
                        onChange={(e) => setChangeNewValue(e.target.value)}
                        placeholder="e.g., Calacatta Nuvo"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Cost Impact ($)</label>
                    <input
                      type="number"
                      step="0.01"
                      value={changeCostImpact}
                      onChange={(e) => setChangeCostImpact(e.target.value)}
                      placeholder="e.g., 1750 (positive = more expensive)"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowChangeForm(false); resetChangeForm(); }}
                      className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitChange}
                      disabled={!changeDescription.trim() || submittingChange}
                      className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {submittingChange ? 'Recording...' : 'Record Change'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Volume Pricing</h3>
        <p className="text-sm text-blue-800 mb-4">
          {project.volumeTier
            ? `This project qualifies for ${project.volumeTier} pricing tier based on a total area of ${totalArea.toFixed(2)} m\u00B2 across ${project.units.length} units.`
            : 'Link quotes to units and recalculate to determine the volume pricing tier.'}
        </p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Benefits</h4>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              <li>Volume discount on materials</li>
              <li>Discounted fabrication rates</li>
              <li>Consolidated material ordering</li>
              <li>Single point of contact</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Savings</h4>
            <p className="text-blue-800">Total volume discount: <strong className="text-green-700">{formatCurrency(discount)}</strong></p>
            <p className="text-blue-800 mt-1">Compared to individual unit pricing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
