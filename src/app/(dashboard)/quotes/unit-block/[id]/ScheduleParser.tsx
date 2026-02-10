'use client';

import { useState, useCallback, useRef } from 'react';

interface ParsedStoneSpec {
  application: string;
  productName: string;
  thickness_mm: number;
  edgeProfile: string | null;
  notes: string | null;
}

interface ParsedFixture {
  type: string;
  notes: string | null;
}

interface ParsedScheduleRoom {
  roomName: string;
  stoneSpecs: ParsedStoneSpec[];
  fixtures: ParsedFixture[];
}

interface ParsedSchedule {
  finishLevel: string | null;
  colourScheme: string | null;
  documentTitle: string | null;
  rooms: ParsedScheduleRoom[];
  nonStoneAreas: string[];
  confidence: number;
  notes: string | null;
}

interface MaterialMatch {
  parsedProductName: string;
  matchedMaterialId: number | null;
  matchedMaterialName: string | null;
  confidence: 'EXACT' | 'PARTIAL' | 'NONE';
}

interface MaterialOption {
  id: number;
  name: string;
}

interface TemplateOption {
  id: number;
  name: string;
  unitTypeCode: string;
}

// Each row in the mapping table
interface MappingRow {
  roomName: string;
  application: string;
  parsedProductName: string;
  matchedMaterialId: number | null;
  matchedMaterialName: string | null;
  matchConfidence: 'EXACT' | 'PARTIAL' | 'NONE';
  edgeProfile: string | null;
  thickness_mm: number;
  fixtures: ParsedFixture[];
  notes: string | null;
}

type ParseStep = 'idle' | 'uploading' | 'parsed' | 'confirming' | 'done';

interface ScheduleParserProps {
  projectId: string;
  onMappingsCreated?: () => void;
}

export default function ScheduleParser({ projectId, onMappingsCreated }: ScheduleParserProps) {
  const [step, setStep] = useState<ParseStep>('idle');
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse results
  const [parsed, setParsed] = useState<ParsedSchedule | null>(null);
  const [mappingRows, setMappingRows] = useState<MappingRow[]>([]);
  const [fileId, setFileId] = useState<number | null>(null);
  const [finishLevelInput, setFinishLevelInput] = useState('');
  const [colourSchemeInput, setColourSchemeInput] = useState('');

  // Available materials and templates for dropdowns
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);

  // Confirm result
  const [confirmResult, setConfirmResult] = useState<{ mappingsCreated: number } | null>(null);

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials?active=true');
      if (res.ok) {
        const data = await res.json();
        const mats = Array.isArray(data) ? data : data.materials || [];
        setMaterials(mats.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name })));
      }
    } catch {
      // Materials dropdown will be empty — user can still type manually
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.templates) {
          setTemplates(data.templates.map((t: { id: number; name: string; unitTypeCode: string }) => ({
            id: t.id,
            name: t.name,
            unitTypeCode: t.unitTypeCode,
          })));
        }
      }
    } catch {
      // Templates will be empty
    }
  }, [projectId]);

  const handleFile = useCallback(async (file: File) => {
    setError(null);
    setStep('uploading');
    setParsed(null);
    setMappingRows([]);
    setConfirmResult(null);

    // Fetch materials and templates in parallel with parsing
    fetchMaterials();
    fetchTemplates();

    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch(
        `/api/unit-blocks/${projectId}/parse-schedule?action=parse`,
        { method: 'POST', body: formData }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to parse schedule');
      }

      const data = await res.json();
      const parsedResult: ParsedSchedule = data.parsed;
      const materialMatches: MaterialMatch[] = data.materialMatches || [];

      setParsed(parsedResult);
      setFileId(data.fileId);
      setFinishLevelInput(parsedResult.finishLevel || '');
      setColourSchemeInput(parsedResult.colourScheme || '');

      // Build mapping rows from parsed rooms + material matches
      const matchMap = new Map<string, MaterialMatch>();
      for (const match of materialMatches) {
        matchMap.set(match.parsedProductName, match);
      }

      const rows: MappingRow[] = [];
      for (const room of parsedResult.rooms) {
        for (const spec of room.stoneSpecs) {
          const match = matchMap.get(spec.productName);
          rows.push({
            roomName: room.roomName,
            application: spec.application,
            parsedProductName: spec.productName,
            matchedMaterialId: match?.matchedMaterialId ?? null,
            matchedMaterialName: match?.matchedMaterialName ?? null,
            matchConfidence: match?.confidence ?? 'NONE',
            edgeProfile: spec.edgeProfile,
            thickness_mm: spec.thickness_mm,
            fixtures: room.fixtures,
            notes: spec.notes,
          });
        }
      }

      setMappingRows(rows);
      setStep('parsed');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse schedule');
      setStep('idle');
    }
  }, [projectId, fetchMaterials, fetchTemplates]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const handleMaterialChange = useCallback((index: number, materialId: number) => {
    setMappingRows((prev) => {
      const updated = [...prev];
      const mat = materials.find((m) => m.id === materialId);
      updated[index] = {
        ...updated[index],
        matchedMaterialId: materialId,
        matchedMaterialName: mat?.name ?? null,
        matchConfidence: 'EXACT',
      };
      return updated;
    });
  }, [materials]);

  const handleTemplateToggle = useCallback((templateId: number) => {
    setSelectedTemplateIds((prev) =>
      prev.includes(templateId)
        ? prev.filter((id) => id !== templateId)
        : [...prev, templateId]
    );
  }, []);

  const handleConfirm = useCallback(async () => {
    // Validate all rows have a material selected
    const unmatched = mappingRows.filter((r) => !r.matchedMaterialId);
    if (unmatched.length > 0) {
      setError(`${unmatched.length} row(s) still need a material selected.`);
      return;
    }

    if (selectedTemplateIds.length === 0) {
      setError('Select at least one template to apply these mappings to.');
      return;
    }

    if (!finishLevelInput.trim()) {
      setError('Finish level is required.');
      return;
    }

    setError(null);
    setStep('confirming');

    try {
      const res = await fetch(
        `/api/unit-blocks/${projectId}/parse-schedule?action=confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            finishLevel: finishLevelInput.trim(),
            colourScheme: colourSchemeInput.trim() || null,
            mappings: mappingRows.map((row) => ({
              roomName: row.roomName,
              application: row.application,
              materialId: row.matchedMaterialId,
              edgeProfile: row.edgeProfile,
            })),
            fileId,
            templateIds: selectedTemplateIds,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to confirm mappings');
      }

      const result = await res.json();
      setConfirmResult(result);
      setStep('done');
      onMappingsCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm mappings');
      setStep('parsed');
    }
  }, [mappingRows, selectedTemplateIds, finishLevelInput, colourSchemeInput, projectId, fileId, onMappingsCreated]);

  const handleReset = useCallback(() => {
    setStep('idle');
    setParsed(null);
    setMappingRows([]);
    setFileId(null);
    setFinishLevelInput('');
    setColourSchemeInput('');
    setSelectedTemplateIds([]);
    setConfirmResult(null);
    setError(null);
  }, []);

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Finishes Schedule</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload a Finishes Schedule PDF to auto-detect stone material assignments per room.
        </p>
      </div>

      <div className="p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        {/* Step 1: Upload */}
        {step === 'idle' && (
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              dragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            <p className="mt-2 text-sm text-gray-600">
              Drag and drop a Finishes Schedule PDF, or{' '}
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                browse files
              </button>
            </p>
            <p className="mt-1 text-xs text-gray-400">PDF, PNG, or JPG up to 32MB</p>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.png,.jpg,.jpeg"
              className="hidden"
              onChange={handleFileInput}
            />
          </div>
        )}

        {/* Uploading / Parsing */}
        {step === 'uploading' && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-sm text-gray-600">Analysing Finishes Schedule with AI...</p>
            <p className="text-xs text-gray-400 mt-1">This may take a moment for multi-page documents</p>
          </div>
        )}

        {/* Step 2: Mapping Preview */}
        {(step === 'parsed' || step === 'confirming') && parsed && (
          <div className="space-y-6">
            {/* Document Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-900">
                  {parsed.documentTitle || 'Finishes Schedule'}
                </h3>
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                  parsed.confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                  parsed.confidence >= 0.5 ? 'bg-yellow-100 text-yellow-800' :
                  'bg-red-100 text-red-800'
                }`}>
                  {Math.round(parsed.confidence * 100)}% confidence
                </span>
              </div>
              {parsed.notes && (
                <p className="text-xs text-gray-500">{parsed.notes}</p>
              )}
            </div>

            {/* Finish Level & Colour Scheme */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Finish Level *</label>
                <input
                  type="text"
                  value={finishLevelInput}
                  onChange={(e) => setFinishLevelInput(e.target.value)}
                  placeholder="e.g., PREMIUM"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Colour Scheme</label>
                <input
                  type="text"
                  value={colourSchemeInput}
                  onChange={(e) => setColourSchemeInput(e.target.value)}
                  placeholder="e.g., LINEN (optional)"
                  className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Mapping Table */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                Material Mappings ({mappingRows.length} stone spec{mappingRows.length !== 1 ? 's' : ''} detected)
              </h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Room</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Application</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">AI Detected Product</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Matched Material</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Confidence</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Thickness</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Edge</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mappingRows.map((row, i) => (
                      <tr key={i} className={row.matchConfidence === 'NONE' ? 'bg-yellow-50' : ''}>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-900">{row.roomName}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">{row.application}</td>
                        <td className="px-3 py-2 text-gray-600">{row.parsedProductName}</td>
                        <td className="px-3 py-2">
                          <select
                            value={row.matchedMaterialId || ''}
                            onChange={(e) => handleMaterialChange(i, parseInt(e.target.value, 10))}
                            className={`w-full px-2 py-1 border rounded text-sm ${
                              row.matchConfidence === 'NONE'
                                ? 'border-yellow-400 bg-yellow-50'
                                : 'border-gray-300'
                            }`}
                          >
                            <option value="">-- Select Material --</option>
                            {materials.map((mat) => (
                              <option key={mat.id} value={mat.id}>{mat.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                            row.matchConfidence === 'EXACT' ? 'bg-green-100 text-green-800' :
                            row.matchConfidence === 'PARTIAL' ? 'bg-blue-100 text-blue-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {row.matchConfidence}
                          </span>
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">{row.thickness_mm}mm</td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                          {row.edgeProfile ? row.edgeProfile.replace(/_/g, ' ') : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Fixtures Summary */}
            {parsed.rooms.some((r) => r.fixtures.length > 0) && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Detected Fixtures</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {parsed.rooms.flatMap((room) =>
                    room.fixtures.map((f, i) => (
                      <div key={`${room.roomName}-${i}`} className="bg-gray-50 rounded-lg p-2 text-xs">
                        <span className="font-medium text-gray-700">{room.roomName}:</span>{' '}
                        <span className="text-gray-600">{f.type.replace(/_/g, ' ')}</span>
                        {f.notes && <span className="text-gray-400 block">{f.notes}</span>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Non-Stone Areas */}
            {parsed.nonStoneAreas.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-gray-900 mb-2">Non-Stone Areas (skipped)</h3>
                <ul className="text-xs text-gray-500 space-y-1 list-disc list-inside">
                  {parsed.nonStoneAreas.map((area, i) => (
                    <li key={i}>{area}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Template Selection */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">Apply to Templates *</h3>
              {templates.length === 0 ? (
                <p className="text-xs text-gray-500">No templates found for this project. Create templates first.</p>
              ) : (
                <div className="space-y-2">
                  {templates.map((t) => (
                    <label key={t.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedTemplateIds.includes(t.id)}
                        onChange={() => handleTemplateToggle(t.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">
                        {t.name} <span className="text-gray-400">(Type {t.unitTypeCode})</span>
                      </span>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={step === 'confirming'}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {step === 'confirming'
                  ? 'Saving...'
                  : `Save Mappings for ${finishLevelInput || '...'}`}
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Done */}
        {step === 'done' && confirmResult && (
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">Mappings Saved</h3>
            <p className="text-sm text-gray-500">
              Created {confirmResult.mappingsCreated} finish tier mapping{confirmResult.mappingsCreated !== 1 ? 's' : ''}.
            </p>
            <button
              onClick={handleReset}
              className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Upload Another Schedule
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
