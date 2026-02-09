'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

// ============================================================================
// Types
// ============================================================================

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

interface DryRunResult {
  unitId: number;
  unitNumber: string;
  status: 'created' | 'skipped' | 'failed';
  error?: string;
}

interface DryRunResponse {
  dryRun: true;
  ready: number;
  skipped: number;
  failed: number;
  results: DryRunResult[];
  errors: Array<{ unitNumber: string; error: string }>;
}

interface GenerationResult {
  totalUnits: number;
  quotesCreated: number;
  quotesSkipped: number;
  quotesFailed: number;
  results: Array<{
    unitId: number;
    unitNumber: string;
    status: 'created' | 'skipped' | 'failed';
    quoteId?: number;
    totalExGst?: number;
    error?: string;
  }>;
  errors: Array<{ unitNumber: string; error: string }>;
  totalArea_sqm: number;
  volumeTier: string;
  volumeDiscount: number;
  subtotalExGst: number;
  discountAmount: number;
  gstAmount: number;
  grandTotal: number;
}

// ============================================================================
// Component
// ============================================================================

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

  // Generation state
  const [dryRunData, setDryRunData] = useState<DryRunResponse | null>(null);
  const [loadingDryRun, setLoadingDryRun] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<GenerationResult | null>(null);
  const [overwriteExisting, setOverwriteExisting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showErrors, setShowErrors] = useState(false);

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

  const fetchDryRun = useCallback(async () => {
    setLoadingDryRun(true);
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: true, overwriteExisting }),
      });
      if (res.ok) {
        setDryRunData(await res.json());
      }
    } catch (err) {
      console.error('Failed to run pre-flight check:', err);
    } finally {
      setLoadingDryRun(false);
    }
  }, [projectId, overwriteExisting]);

  useEffect(() => {
    fetchProject();
  }, [fetchProject]);

  // Fetch dry run when project loads and has units
  useEffect(() => {
    if (project && project.units.length > 0 && project.customer) {
      fetchDryRun();
    }
  }, [project?.id, project?.units.length, overwriteExisting]); // eslint-disable-line react-hooks/exhaustive-deps

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
      }
    } catch (err) {
      console.error('Failed to delete unit:', err);
    }
  };

  const handleGenerate = async () => {
    setShowConfirm(false);
    setGenerating(true);
    setGenerationResult(null);
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ overwriteExisting }),
      });
      if (res.ok) {
        const result: GenerationResult = await res.json();
        setGenerationResult(result);
        // Refresh project data to show updated quotes
        await fetchProject();
        // Refresh dry run to update counts
        await fetchDryRun();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to generate quotes');
      }
    } catch (err) {
      alert('Failed to generate quotes');
    } finally {
      setGenerating(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (error || !project) return <div className="text-center py-12"><p className="text-gray-500 mb-4">{error || 'Project not found'}</p><Link href="/quotes/unit-block" className="btn-secondary">Back to Projects</Link></div>;

  const totalArea = Number(project.totalArea_sqm || 0);
  const subtotal = Number(project.subtotalExGst || 0);
  const discount = Number(project.discountAmount || 0);
  const grandTotal = Number(project.grandTotal || 0);

  // Gather missing template/mapping info from dry run
  const missingTemplates = dryRunData
    ? Array.from(new Set(
        dryRunData.errors
          .filter(e => e.error.startsWith('No template for type'))
          .map(e => e.error.replace('No template for type ', ''))
      ))
    : [];
  const missingMappings = dryRunData
    ? Array.from(new Set(
        dryRunData.errors
          .filter(e => e.error.startsWith('No finish mapping for'))
          .map(e => e.error.replace('No finish mapping for ', ''))
      ))
    : [];

  return (
    <div className="space-y-6">
      {/* Header */}
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
            project.status === 'QUOTED' ? 'bg-blue-100 text-blue-800' :
            'bg-blue-100 text-blue-800'
          }`}>
            {project.status}
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Units</p><p className="text-3xl font-bold text-gray-900">{project.units.length}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Total Area</p><p className="text-3xl font-bold text-gray-900">{totalArea.toFixed(2)} m&sup2;</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Volume Tier</p><p className="text-2xl font-bold text-blue-600">{project.volumeTier || 'N/A'}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Grand Total</p><p className="text-3xl font-bold text-green-600">{formatCurrency(grandTotal)}</p></div>
      </div>

      {/* Pricing Summary */}
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

      {/* Bulk Generation Panel */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Bulk Quote Generation</h2>
          <p className="text-sm text-gray-500 mt-1">Generate quotes for all units based on their templates and finish tier mappings.</p>
        </div>
        <div className="p-6 space-y-4">
          {/* Pre-generation summary */}
          {!project.customer ? (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800 font-medium">No customer assigned to this project. Assign a customer before generating quotes.</p>
            </div>
          ) : loadingDryRun ? (
            <div className="flex items-center gap-3 text-gray-500">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-sm">Running pre-flight check...</span>
            </div>
          ) : dryRunData ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <p className="text-sm text-green-700 font-medium">Ready for generation</p>
                  <p className="text-2xl font-bold text-green-800">{dryRunData.ready} units</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                  <p className="text-sm text-gray-600 font-medium">Already quoted</p>
                  <p className="text-2xl font-bold text-gray-700">{dryRunData.skipped} units</p>
                </div>
                {missingTemplates.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-700 font-medium">Missing template</p>
                    <p className="text-2xl font-bold text-yellow-800">{dryRunData.errors.filter(e => e.error.startsWith('No template')).length} units</p>
                    <p className="text-xs text-yellow-600 mt-1">Types: {missingTemplates.join(', ')}</p>
                  </div>
                )}
                {missingMappings.length > 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <p className="text-sm text-yellow-700 font-medium">Missing finish mapping</p>
                    <p className="text-2xl font-bold text-yellow-800">{dryRunData.errors.filter(e => e.error.startsWith('No finish mapping')).length} units</p>
                    <p className="text-xs text-yellow-600 mt-1">{missingMappings.join('; ')}</p>
                  </div>
                )}
                {dryRunData.failed > 0 && dryRunData.errors.filter(e => !e.error.startsWith('No template') && !e.error.startsWith('No finish mapping')).length > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <p className="text-sm text-red-700 font-medium">Other issues</p>
                    <p className="text-2xl font-bold text-red-800">{dryRunData.errors.filter(e => !e.error.startsWith('No template') && !e.error.startsWith('No finish mapping')).length} units</p>
                  </div>
                )}
              </div>

              {/* Overwrite checkbox and generate button */}
              <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={overwriteExisting}
                    onChange={(e) => setOverwriteExisting(e.target.checked)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Re-generate already quoted units</span>
                </label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={fetchDryRun}
                    className="px-3 py-2 text-sm text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Refresh
                  </button>
                  {showConfirm ? (
                    <div className="flex items-center gap-2 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-2">
                      <span className="text-sm text-yellow-800">Generate quotes for {dryRunData.ready} units?</span>
                      <button
                        onClick={handleGenerate}
                        className="px-3 py-1 bg-blue-600 text-white text-sm font-medium rounded hover:bg-blue-700"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setShowConfirm(false)}
                        className="px-3 py-1 text-gray-600 text-sm hover:text-gray-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setShowConfirm(true)}
                      disabled={dryRunData.ready === 0 || generating}
                      className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Generate Quotes
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : project.units.length === 0 ? (
            <p className="text-sm text-gray-500">Add units to the project to enable bulk generation.</p>
          ) : null}

          {/* Generating progress */}
          {generating && (
            <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
              <span className="text-sm text-blue-800 font-medium">Generating quotes for {dryRunData?.ready || 0} units...</span>
            </div>
          )}

          {/* Generation results */}
          {generationResult && !generating && (
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <h3 className="font-semibold text-gray-900">Generation Results</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-green-700">Created</p>
                  <p className="text-2xl font-bold text-green-800">{generationResult.quotesCreated}</p>
                </div>
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-center">
                  <p className="text-sm text-gray-600">Skipped</p>
                  <p className="text-2xl font-bold text-gray-700">{generationResult.quotesSkipped}</p>
                </div>
                <div className={`rounded-lg p-4 text-center ${generationResult.quotesFailed > 0 ? 'bg-red-50 border border-red-200' : 'bg-gray-50 border border-gray-200'}`}>
                  <p className={`text-sm ${generationResult.quotesFailed > 0 ? 'text-red-700' : 'text-gray-600'}`}>Errors</p>
                  <p className={`text-2xl font-bold ${generationResult.quotesFailed > 0 ? 'text-red-800' : 'text-gray-700'}`}>{generationResult.quotesFailed}</p>
                </div>
              </div>

              {/* Financial summary */}
              {generationResult.quotesCreated > 0 && (
                <div className="bg-gray-50 rounded-lg p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Total value (ex GST):</span>
                    <span className="font-medium">{formatCurrency(generationResult.subtotalExGst)}</span>
                  </div>
                  <div className="flex justify-between text-sm text-green-600">
                    <span>Volume discount ({generationResult.volumeDiscount}% — {generationResult.volumeTier} tier):</span>
                    <span className="font-medium">-{formatCurrency(generationResult.discountAmount)}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">GST:</span>
                    <span className="font-medium">{formatCurrency(generationResult.gstAmount)}</span>
                  </div>
                  <div className="flex justify-between text-base font-semibold pt-2 border-t border-gray-300">
                    <span>Grand total (incl. GST):</span>
                    <span className="text-blue-600">{formatCurrency(generationResult.grandTotal)}</span>
                  </div>
                </div>
              )}

              {/* Error details */}
              {generationResult.errors.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowErrors(!showErrors)}
                    className="text-sm text-red-600 hover:text-red-800 font-medium"
                  >
                    {showErrors ? 'Hide error details' : `Show ${generationResult.errors.length} error details`}
                  </button>
                  {showErrors && (
                    <div className="mt-2 bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                      {generationResult.errors.map((err, i) => (
                        <div key={i} className="text-sm">
                          <span className="font-medium text-red-800">Unit {err.unitNumber}:</span>{' '}
                          <span className="text-red-700">{err.error}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Units List */}
      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Units ({project.units.length})</h2>
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

        {/* Units table */}
        {project.units.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No units added yet. Click &quot;Add Unit&quot; to get started.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Finish</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quote Status</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {project.units.map((unit, index) => {
                  // Find this unit's dry run result for status indicator
                  const dryResult = dryRunData?.results.find(r => r.unitId === unit.id);
                  return (
                    <tr key={unit.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{index + 1}</td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <p className="text-sm font-medium text-gray-900">Unit {unit.unitNumber}</p>
                          {unit.level != null && <p className="text-xs text-gray-500">Level {unit.level}</p>}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {unit.unitTypeCode ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 text-xs font-medium">
                            Type {unit.unitTypeCode}
                          </span>
                        ) : (
                          <span className="text-xs text-gray-400">Not assigned</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm">
                          {unit.finishLevel ? (
                            <>
                              <span className="text-gray-900">{unit.finishLevel}</span>
                              {unit.colourScheme && <span className="text-gray-500 ml-1">/ {unit.colourScheme}</span>}
                            </>
                          ) : (
                            <span className="text-gray-400">Not assigned</span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {unit.quote ? (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Quoted
                            </span>
                            <Link
                              href={`/quotes/${unit.quote.id}`}
                              className="text-xs text-blue-600 hover:text-blue-800"
                            >
                              {unit.quote.quote_number}
                            </Link>
                          </div>
                        ) : dryResult?.status === 'created' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            Ready
                          </span>
                        ) : dryResult?.status === 'failed' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800" title={dryResult.error}>
                            Issue
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                            Pending
                          </span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        {unit.quote ? (
                          <span className="text-sm font-medium text-gray-900">{formatCurrency(Number(unit.quote.total))}</span>
                        ) : (
                          <span className="text-sm text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right">
                        <button onClick={() => handleDeleteUnit(unit.id)} className="text-gray-400 hover:text-red-600" title="Remove unit">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Volume Pricing Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Volume Pricing</h3>
        <p className="text-sm text-blue-800 mb-4">
          {project.volumeTier
            ? `This project qualifies for ${project.volumeTier} pricing tier based on a total area of ${totalArea.toFixed(2)} m\u00B2 across ${project.units.length} units.`
            : 'Generate quotes for units to determine the volume pricing tier.'}
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
