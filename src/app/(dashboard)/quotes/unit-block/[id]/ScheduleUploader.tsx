'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import MultiFileUpload, {
  type SelectedFile,
} from '@/components/unit-block/MultiFileUpload';

/* ─── Types mirroring the API / schedule-parser ─── */

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

interface MaterialMatchResponse {
  parsedProductName: string;
  matchedMaterialId: number | null;
  matchedMaterialName: string | null;
  confidence: 'EXACT' | 'PARTIAL' | 'NONE';
}

/* ─── Internal state types ─── */

type MatchConfidence = 'EXACT' | 'PARTIAL' | 'NONE' | 'MANUAL';

interface ScheduleSpec {
  id: string;
  room: string;
  application: string;
  aiDetectedProduct: string;
  matchedMaterialId: number | null;
  matchedMaterialName: string | null;
  matchConfidence: MatchConfidence;
  thickness: string;
  edge: string;
  selected: boolean;
}

interface ScheduleGroup {
  finishLevel: string;
  colourScheme: string;
  fileName: string;
  fileId: number;
  specs: ScheduleSpec[];
  finishLevelEditable: boolean;
  saved: boolean;
}

interface MaterialOption {
  id: number;
  name: string;
}

interface EdgeOption {
  id: string;
  name: string;
}

interface ProductGroup {
  product: string;
  count: number;
  specIds: string[];
}

type OpenDropdown = 'product' | 'material' | 'edge' | null;

interface TemplateOption {
  id: number;
  name: string;
  unitTypeCode: string;
}

type FileStatus = 'pending' | 'processing' | 'success' | 'error';

interface ProcessedFileStatus {
  fileName: string;
  status: FileStatus;
  error?: string;
  specCount?: number;
  confidence?: number;
}

type Step = 'select' | 'processing' | 'review' | 'done';

interface ScheduleUploaderProps {
  projectId: string;
  onMappingsSaved?: () => void;
}

let specIdCounter = 0;
let fileIdCounter = 0;

/* ─── Component ─── */

export default function ScheduleUploader({
  projectId,
  onMappingsSaved,
}: ScheduleUploaderProps) {
  const [step, setStep] = useState<Step>('select');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFileStatus[]>([]);
  const [groups, setGroups] = useState<ScheduleGroup[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // Materials & templates for dropdowns
  const [materials, setMaterials] = useState<MaterialOption[]>([]);
  const [templates, setTemplates] = useState<TemplateOption[]>([]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<number[]>([]);

  // Per-tab saving state
  const [savingTab, setSavingTab] = useState<number | null>(null);

  // Bulk action toolbar state
  const [openDropdown, setOpenDropdown] = useState<OpenDropdown>(null);
  const [edgeOptions, setEdgeOptions] = useState<EdgeOption[]>([]);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectAllRef = useRef<HTMLInputElement>(null);

  /* ─── Fetch materials + templates + edges on mount ─── */

  const fetchMaterials = useCallback(async () => {
    try {
      const res = await fetch('/api/materials?active=true');
      if (res.ok) {
        const data = await res.json();
        const mats = Array.isArray(data) ? data : data.materials || [];
        setMaterials(
          mats.map((m: { id: number; name: string }) => ({ id: m.id, name: m.name }))
        );
      }
    } catch {
      // Materials dropdown will be empty
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.templates) {
          setTemplates(
            data.templates.map(
              (t: { id: number; name: string; unitTypeCode: string }) => ({
                id: t.id,
                name: t.name,
                unitTypeCode: t.unitTypeCode,
              })
            )
          );
        }
      }
    } catch {
      // Templates will be empty
    }
  }, [projectId]);

  const fetchEdgeTypes = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/pricing/edge-types');
      if (res.ok) {
        const data = await res.json();
        const edges = Array.isArray(data) ? data : [];
        setEdgeOptions(
          edges
            .filter((e: { isActive: boolean }) => e.isActive)
            .map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))
        );
      }
    } catch {
      // Edge options will be empty — use fallbacks
    }
  }, []);

  useEffect(() => {
    fetchMaterials();
    fetchTemplates();
    fetchEdgeTypes();
  }, [fetchMaterials, fetchTemplates, fetchEdgeTypes]);

  /* ─── File selection handlers ─── */

  const handleFilesSelected = useCallback((files: File[]) => {
    const newSelected: SelectedFile[] = files.map((file) => ({
      file,
      id: `sfile-${++fileIdCounter}`,
    }));
    setSelectedFiles((prev: SelectedFile[]) => [...prev, ...newSelected]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setSelectedFiles((prev: SelectedFile[]) =>
      prev.filter((sf: SelectedFile) => sf.id !== id)
    );
  }, []);

  /* ─── Group results by finish level ─── */

  function buildGroups(
    results: Array<{
      fileName: string;
      parsed: ParsedSchedule;
      materialMatches: MaterialMatchResponse[];
      fileId: number;
    }>
  ): ScheduleGroup[] {
    return results.map((r) => {
      // Build a lookup for material matches by product name
      const matchMap = new Map<string, MaterialMatchResponse>();
      for (const m of r.materialMatches) {
        matchMap.set(m.parsedProductName, m);
      }

      const detectedLevel = r.parsed.finishLevel || 'UNKNOWN';
      const specs: ScheduleSpec[] = [];

      for (const room of r.parsed.rooms) {
        for (const spec of room.stoneSpecs) {
          const match = matchMap.get(spec.productName);
          specs.push({
            id: `spec-${++specIdCounter}`,
            room: room.roomName,
            application: spec.application,
            aiDetectedProduct: spec.productName,
            matchedMaterialId: match?.matchedMaterialId ?? null,
            matchedMaterialName: match?.matchedMaterialName ?? null,
            matchConfidence: match?.confidence ?? 'NONE',
            thickness: `${spec.thickness_mm}mm`,
            edge: spec.edgeProfile
              ? spec.edgeProfile.replace(/_/g, ' ')
              : '\u2014',
            selected: false,
          });
        }
      }

      return {
        finishLevel: detectedLevel,
        colourScheme: r.parsed.colourScheme || '',
        fileName: r.fileName,
        fileId: r.fileId,
        specs,
        finishLevelEditable: detectedLevel === 'UNKNOWN',
        saved: false,
      };
    });
  }

  /* ─── Process all files sequentially ─── */

  const processScheduleFiles = useCallback(
    async (files: File[]) => {
      const fileStatuses: ProcessedFileStatus[] = files.map((f) => ({
        fileName: f.name,
        status: 'pending' as const,
      }));
      setProcessedFiles([...fileStatuses]);
      setStep('processing');
      setError(null);

      const successfulResults: Array<{
        fileName: string;
        parsed: ParsedSchedule;
        materialMatches: MaterialMatchResponse[];
        fileId: number;
      }> = [];

      const updateStatus = (
        index: number,
        status: FileStatus,
        extra?: Partial<ProcessedFileStatus>
      ) => {
        fileStatuses[index] = { ...fileStatuses[index], status, ...extra };
        setProcessedFiles([...fileStatuses]);
      };

      for (let i = 0; i < files.length; i++) {
        updateStatus(i, 'processing');

        try {
          const formData = new FormData();
          formData.append('file', files[i]);

          const res = await fetch(
            `/api/unit-blocks/${projectId}/parse-schedule?action=parse`,
            { method: 'POST', body: formData }
          );

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Parse failed');
          }

          const data = await res.json();
          const parsed: ParsedSchedule = data.parsed;
          const materialMatches: MaterialMatchResponse[] =
            data.materialMatches || [];
          const apiFileId: number = data.fileId;

          // Count total stone specs across rooms
          const totalSpecs = parsed.rooms.reduce(
            (sum: number, room: ParsedScheduleRoom) =>
              sum + room.stoneSpecs.length,
            0
          );

          successfulResults.push({
            fileName: files[i].name,
            parsed,
            materialMatches,
            fileId: apiFileId,
          });

          updateStatus(i, 'success', {
            specCount: totalSpecs,
            confidence: parsed.confidence,
          });
        } catch (err) {
          updateStatus(i, 'error', {
            error: err instanceof Error ? err.message : 'Parse failed',
          });
        }
      }

      if (successfulResults.length === 0) {
        setError(
          'All files failed to parse. Please check the files and try again.'
        );
        setStep('select');
        return;
      }

      const grouped = buildGroups(successfulResults);
      setGroups(grouped);
      setActiveTab(0);
      setStep('review');
    },
    [projectId]
  );

  /* ─── Start processing ─── */

  const handleStartProcessing = useCallback(() => {
    if (selectedFiles.length === 0) return;
    const files = selectedFiles.map((sf: SelectedFile) => sf.file);
    processScheduleFiles(files);
  }, [selectedFiles, processScheduleFiles]);

  /* ─── Material change handler ─── */

  const handleMaterialChange = useCallback(
    (groupIndex: number, specId: string, materialId: number) => {
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        group.specs = group.specs.map((s: ScheduleSpec) => {
          if (s.id !== specId) return s;
          const mat = materials.find(
            (m: MaterialOption) => m.id === materialId
          );
          return {
            ...s,
            matchedMaterialId: materialId,
            matchedMaterialName: mat?.name ?? null,
            matchConfidence: 'MANUAL' as const,
          };
        });
        updated[groupIndex] = group;
        return updated;
      });
    },
    [materials]
  );

  /* ─── Finish level edit handler ─── */

  const handleFinishLevelChange = useCallback(
    (groupIndex: number, value: string) => {
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        updated[groupIndex] = { ...updated[groupIndex], finishLevel: value };
        return updated;
      });
    },
    []
  );

  /* ─── Toggle row selection ─── */

  const handleToggleSpec = useCallback(
    (groupIndex: number, specId: string) => {
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        group.specs = group.specs.map((s: ScheduleSpec) =>
          s.id === specId ? { ...s, selected: !s.selected } : s
        );
        updated[groupIndex] = group;
        return updated;
      });
    },
    []
  );

  const handleToggleAll = useCallback(
    (groupIndex: number) => {
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        const allSelected = group.specs.every(
          (s: ScheduleSpec) => s.selected
        );
        group.specs = group.specs.map((s: ScheduleSpec) => ({
          ...s,
          selected: !allSelected,
        }));
        updated[groupIndex] = group;
        return updated;
      });
    },
    []
  );

  /* ─── Bulk action: get product groups for current tab ─── */

  function getProductGroups(specs: ScheduleSpec[]): ProductGroup[] {
    const map = new Map<string, string[]>();
    specs.forEach((spec: ScheduleSpec) => {
      const key = spec.aiDetectedProduct;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(spec.id);
    });
    return Array.from(map.entries()).map(([product, specIds]) => ({
      product,
      count: specIds.length,
      specIds,
    }));
  }

  /* ─── Bulk action: select rows by same product ─── */

  const handleSelectSameProduct = useCallback(
    (groupIndex: number, specIds: string[]) => {
      const idSet = new Set(specIds);
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        group.specs = group.specs.map((s: ScheduleSpec) => ({
          ...s,
          selected: idSet.has(s.id),
        }));
        updated[groupIndex] = group;
        return updated;
      });
      setOpenDropdown(null);
    },
    []
  );

  /* ─── Bulk action: apply material to selected rows ─── */

  const handleBulkApplyMaterial = useCallback(
    (groupIndex: number, materialId: number) => {
      const mat = materials.find((m: MaterialOption) => m.id === materialId);
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        group.specs = group.specs.map((s: ScheduleSpec) => {
          if (!s.selected) return s;
          return {
            ...s,
            matchedMaterialId: materialId,
            matchedMaterialName: mat?.name ?? null,
            matchConfidence: 'MANUAL' as const,
            selected: false,
          };
        });
        updated[groupIndex] = group;
        return updated;
      });
      setOpenDropdown(null);
    },
    [materials]
  );

  /* ─── Bulk action: apply edge to selected rows ─── */

  const handleBulkApplyEdge = useCallback(
    (groupIndex: number, edgeName: string) => {
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        group.specs = group.specs.map((s: ScheduleSpec) => {
          if (!s.selected) return s;
          return { ...s, edge: edgeName, selected: false };
        });
        updated[groupIndex] = group;
        return updated;
      });
      setOpenDropdown(null);
    },
    []
  );

  /* ─── Deselect all rows in current tab ─── */

  const handleDeselectAll = useCallback(
    (groupIndex: number) => {
      setGroups((prev: ScheduleGroup[]) => {
        const updated = [...prev];
        const group = { ...updated[groupIndex] };
        group.specs = group.specs.map((s: ScheduleSpec) => ({
          ...s,
          selected: false,
        }));
        updated[groupIndex] = group;
        return updated;
      });
    },
    []
  );

  /* ─── Close dropdown on outside click ─── */

  useEffect(() => {
    if (!openDropdown) return;
    function handleClickOutside(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [openDropdown]);

  /* ─── Escape key: deselect all in current tab ─── */

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && step === 'review' && groups[activeTab]) {
        handleDeselectAll(activeTab);
        setOpenDropdown(null);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [step, activeTab, groups, handleDeselectAll]);

  /* ─── Indeterminate checkbox sync ─── */

  useEffect(() => {
    const currentGroup = groups[activeTab];
    if (!selectAllRef.current || !currentGroup) return;
    const selCount = currentGroup.specs.filter(
      (s: ScheduleSpec) => s.selected
    ).length;
    const totCount = currentGroup.specs.length;
    selectAllRef.current.indeterminate =
      selCount > 0 && selCount < totCount;
  }, [groups, activeTab]);

  /* ─── Template toggle ─── */

  const handleTemplateToggle = useCallback((templateId: number) => {
    setSelectedTemplateIds((prev: number[]) =>
      prev.includes(templateId)
        ? prev.filter((id: number) => id !== templateId)
        : [...prev, templateId]
    );
  }, []);

  /* ─── Save mappings for a tab ─── */

  const handleSaveMappings = useCallback(
    async (groupIndex: number) => {
      const group = groups[groupIndex];
      if (!group) return;

      if (!group.finishLevel.trim() || group.finishLevel === 'UNKNOWN') {
        setError('Please enter a valid finish level before saving.');
        return;
      }

      const unmapped = group.specs.filter(
        (s: ScheduleSpec) => !s.matchedMaterialId
      );
      if (unmapped.length > 0) {
        setError(
          `${unmapped.length} row(s) still need a material selected.`
        );
        return;
      }

      if (selectedTemplateIds.length === 0) {
        setError('Select at least one template to apply these mappings to.');
        return;
      }

      setError(null);
      setSavingTab(groupIndex);

      try {
        const res = await fetch(
          `/api/unit-blocks/${projectId}/parse-schedule?action=confirm`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              finishLevel: group.finishLevel.trim(),
              colourScheme: group.colourScheme.trim() || null,
              mappings: group.specs.map((s: ScheduleSpec) => ({
                roomName: s.room,
                application: s.application,
                materialId: s.matchedMaterialId,
                edgeProfile:
                  s.edge !== '\u2014' ? s.edge.replace(/\s+/g, '_') : null,
              })),
              fileId: group.fileId,
              templateIds: selectedTemplateIds,
            }),
          }
        );

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Failed to save mappings');
        }

        // Mark this group as saved
        setGroups((prev: ScheduleGroup[]) => {
          const updated = [...prev];
          updated[groupIndex] = { ...updated[groupIndex], saved: true };
          return updated;
        });

        onMappingsSaved?.();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to save mappings'
        );
      } finally {
        setSavingTab(null);
      }
    },
    [groups, selectedTemplateIds, projectId, onMappingsSaved]
  );

  /* ─── Reset ─── */

  const handleReset = useCallback(() => {
    setStep('select');
    setSelectedFiles([]);
    setProcessedFiles([]);
    setGroups([]);
    setActiveTab(0);
    setError(null);
    setSelectedTemplateIds([]);
  }, []);

  /* ─── Render helpers ─── */

  const statusIcon = (status: FileStatus) => {
    switch (status) {
      case 'pending':
        return (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-gray-100">
            <span className="h-2 w-2 rounded-full bg-gray-400" />
          </span>
        );
      case 'processing':
        return (
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-blue-200 border-t-blue-600" />
        );
      case 'success':
        return (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-green-100">
            <svg
              className="h-3 w-3 text-green-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M5 13l4 4L19 7"
              />
            </svg>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-3 w-3 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={3}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </span>
        );
    }
  };

  const allGroupsSaved = groups.length > 0 && groups.every((g: ScheduleGroup) => g.saved);
  const activeGroup: ScheduleGroup | undefined = groups[activeTab];
  const unmappedCount = activeGroup
    ? activeGroup.specs.filter((s: ScheduleSpec) => !s.matchedMaterialId).length
    : 0;
  const selectedCount = activeGroup
    ? activeGroup.specs.filter((s: ScheduleSpec) => s.selected).length
    : 0;
  const totalSpecCount = activeGroup ? activeGroup.specs.length : 0;
  const productGroups = activeGroup ? getProductGroups(activeGroup.specs) : [];

  // Fallback edge options if API returned none
  const displayEdgeOptions: EdgeOption[] =
    edgeOptions.length > 0
      ? edgeOptions
      : [
          { id: 'pencil-round', name: 'Pencil Round' },
          { id: 'bullnose', name: 'Bullnose' },
          { id: 'ogee', name: 'Ogee' },
          { id: 'bevel', name: 'Bevel' },
          { id: 'arris-2mm', name: 'Arris (2mm)' },
          { id: '40mm-apron-mitred', name: '40mm Apron Mitred' },
          { id: 'raw', name: 'Raw' },
        ];

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">
          Finishes Schedule
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload one or more Finishes Schedule PDFs to auto-detect stone
          material assignments per room.
        </p>
      </div>

      <div className="p-6">
        {/* Global error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
            {error}
          </div>
        )}

        {/* ─── Step 1: Select files ─── */}
        {step === 'select' && (
          <div className="space-y-4">
            <MultiFileUpload
              onFilesSelected={handleFilesSelected}
              selectedFiles={selectedFiles}
              onRemoveFile={handleRemoveFile}
            />

            {selectedFiles.length > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={handleStartProcessing}
                  className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
                >
                  Upload &amp; Process {selectedFiles.length} File
                  {selectedFiles.length !== 1 ? 's' : ''}
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Step 2: Processing ─── */}
        {step === 'processing' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-200 border-t-blue-600" />
              <p className="text-sm text-gray-700 font-medium">
                Analysing schedules with AI&hellip;
              </p>
            </div>

            <div className="space-y-2">
              {processedFiles.map((pf: ProcessedFileStatus, i: number) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    pf.status === 'error'
                      ? 'bg-red-50'
                      : pf.status === 'success'
                        ? 'bg-green-50'
                        : pf.status === 'processing'
                          ? 'bg-blue-50'
                          : 'bg-gray-50'
                  }`}
                >
                  {statusIcon(pf.status)}
                  <span className="text-sm text-gray-700 flex-1 truncate">
                    {pf.fileName}
                  </span>
                  {pf.status === 'success' && pf.specCount !== undefined && (
                    <span className="text-xs text-green-700 font-medium">
                      {pf.specCount} stone spec
                      {pf.specCount !== 1 ? 's' : ''} found
                    </span>
                  )}
                  {pf.status === 'error' && pf.error && (
                    <span className="text-xs text-red-700">{pf.error}</span>
                  )}
                </div>
              ))}
            </div>

            <p className="text-xs text-gray-400">
              This may take a moment for multi-page documents
            </p>
          </div>
        )}

        {/* ─── Step 3: Tabbed review ─── */}
        {step === 'review' && groups.length > 0 && (
          <div className="space-y-5">
            {/* Processing summary */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">
                Processing Summary
              </h3>
              {processedFiles.map((pf: ProcessedFileStatus, i: number) => (
                <div
                  key={i}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2 ${
                    pf.status === 'error' ? 'bg-red-50' : 'bg-green-50'
                  }`}
                >
                  {statusIcon(pf.status)}
                  <span className="text-sm text-gray-700 flex-1 truncate">
                    {pf.fileName}
                  </span>
                  {pf.status === 'success' && pf.specCount !== undefined && (
                    <span className="text-xs text-green-700 font-medium">
                      {pf.specCount} spec
                      {pf.specCount !== 1 ? 's' : ''}
                      {pf.confidence !== undefined &&
                        ` \u2022 ${Math.round(pf.confidence * 100)}% confidence`}
                    </span>
                  )}
                  {pf.status === 'error' && pf.error && (
                    <span className="text-xs text-red-700">{pf.error}</span>
                  )}
                </div>
              ))}
            </div>

            {/* No materials warning */}
            {materials.length === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                No materials in database. Add materials before mapping.
              </div>
            )}

            {/* Tab bar */}
            <div className="border-b border-gray-200">
              <nav className="-mb-px flex gap-4 overflow-x-auto" aria-label="Schedule tabs">
                {groups.map((group: ScheduleGroup, i: number) => {
                  const label = [group.colourScheme, group.finishLevel]
                    .filter(Boolean)
                    .join(' ')
                    || group.fileName;
                  const isActive = i === activeTab;

                  return (
                    <button
                      key={i}
                      onClick={() => setActiveTab(i)}
                      className={`whitespace-nowrap py-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                        isActive
                          ? 'border-amber-500 text-amber-600 font-semibold'
                          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                      }`}
                    >
                      <span className="flex items-center gap-1.5">
                        {label}
                        {group.saved && (
                          <svg
                            className="h-4 w-4 text-green-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M5 13l4 4L19 7"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="block text-xs text-gray-400 font-normal truncate max-w-[140px]">
                        {group.fileName}
                      </span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Active tab content */}
            {activeGroup && (
              <div className="space-y-4">
                {/* Finish level (editable if UNKNOWN) */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Finish Level *
                    </label>
                    {activeGroup.finishLevelEditable ? (
                      <input
                        type="text"
                        value={activeGroup.finishLevel}
                        onChange={(e) =>
                          handleFinishLevelChange(activeTab, e.target.value)
                        }
                        placeholder="e.g., PREMIUM"
                        className="w-full px-3 py-2 border border-amber-400 bg-amber-50 rounded-lg text-sm focus:ring-2 focus:ring-amber-500"
                      />
                    ) : (
                      <p className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-900 font-medium">
                        {activeGroup.finishLevel}
                      </p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Colour Scheme
                    </label>
                    <p className="px-3 py-2 bg-gray-50 rounded-lg text-sm text-gray-600">
                      {activeGroup.colourScheme || '\u2014'}
                    </p>
                  </div>
                </div>

                {/* Unmapped warning */}
                {unmappedCount > 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                    {unmappedCount} row{unmappedCount !== 1 ? 's' : ''} still
                    need a material selected.
                  </div>
                ) : (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800">
                    All rows have a material selected.
                  </div>
                )}

                {/* Already saved indicator */}
                {activeGroup.saved && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-sm text-green-800 font-medium">
                    Mappings saved for {activeGroup.finishLevel}.
                  </div>
                )}

                {/* ─── Bulk action toolbar ─── */}
                {selectedCount > 0 && !activeGroup.saved && (
                  <div
                    ref={dropdownRef}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg border border-gray-200 relative"
                  >
                    <span className="text-sm text-gray-700 font-medium whitespace-nowrap">
                      Selected: {selectedCount} of {totalSpecCount}
                    </span>

                    {/* Select Same Product */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenDropdown(
                            openDropdown === 'product' ? null : 'product'
                          )
                        }
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        Select Same Product
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {openDropdown === 'product' && (
                        <div className="absolute left-0 top-full mt-1 z-10 w-72 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto">
                          {productGroups.map(
                            (pg: ProductGroup, i: number) => (
                              <button
                                key={i}
                                onClick={() =>
                                  handleSelectSameProduct(
                                    activeTab,
                                    pg.specIds
                                  )
                                }
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                              >
                                <span className="block truncate">
                                  {pg.product}
                                </span>
                                <span className="text-xs text-gray-400">
                                  {pg.count} row
                                  {pg.count !== 1 ? 's' : ''}
                                </span>
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Apply Material */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenDropdown(
                            openDropdown === 'material' ? null : 'material'
                          )
                        }
                        disabled={selectedCount === 0}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Apply Material to {selectedCount} row
                        {selectedCount !== 1 ? 's' : ''}
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {openDropdown === 'material' && (
                        <div className="absolute left-0 top-full mt-1 z-10 w-64 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto">
                          {materials.length === 0 ? (
                            <p className="px-3 py-2 text-xs text-gray-500">
                              No materials available.
                            </p>
                          ) : (
                            materials.map((mat: MaterialOption) => (
                              <button
                                key={mat.id}
                                onClick={() =>
                                  handleBulkApplyMaterial(activeTab, mat.id)
                                }
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                              >
                                {mat.name}
                              </button>
                            ))
                          )}
                        </div>
                      )}
                    </div>

                    {/* Apply Edge */}
                    <div className="relative">
                      <button
                        onClick={() =>
                          setOpenDropdown(
                            openDropdown === 'edge' ? null : 'edge'
                          )
                        }
                        disabled={selectedCount === 0}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Apply Edge
                        <svg
                          className="h-3 w-3"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>
                      {openDropdown === 'edge' && (
                        <div className="absolute left-0 top-full mt-1 z-10 w-52 bg-white shadow-lg rounded-md border border-gray-200 max-h-60 overflow-y-auto">
                          {displayEdgeOptions.map(
                            (edge: EdgeOption) => (
                              <button
                                key={edge.id}
                                onClick={() =>
                                  handleBulkApplyEdge(
                                    activeTab,
                                    edge.name
                                  )
                                }
                                className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
                              >
                                {edge.name}
                              </button>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Mapping table */}
                <div className="overflow-x-auto border border-gray-200 rounded-lg">
                  <table className="min-w-full divide-y divide-gray-200 text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-3 py-2 text-left">
                          <input
                            ref={selectAllRef}
                            type="checkbox"
                            checked={
                              activeGroup.specs.length > 0 &&
                              activeGroup.specs.every(
                                (s: ScheduleSpec) => s.selected
                              )
                            }
                            onChange={() => handleToggleAll(activeTab)}
                            className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                          />
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Room
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Application
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          AI Detected Product
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Matched Material
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Confidence
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Thickness
                        </th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                          Edge
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {activeGroup.specs.map((spec: ScheduleSpec) => (
                        <tr
                          key={spec.id}
                          className={
                            spec.selected
                              ? 'bg-amber-50'
                              : spec.matchConfidence === 'NONE'
                                ? 'bg-yellow-50'
                                : ''
                          }
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={spec.selected}
                              onChange={() =>
                                handleToggleSpec(activeTab, spec.id)
                              }
                              className="rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                            />
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-900">
                            {spec.room}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                            {spec.application}
                          </td>
                          <td className="px-3 py-2 text-gray-600">
                            {spec.aiDetectedProduct}
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={spec.matchedMaterialId || ''}
                              onChange={(e) =>
                                handleMaterialChange(
                                  activeTab,
                                  spec.id,
                                  parseInt(e.target.value, 10)
                                )
                              }
                              disabled={activeGroup.saved}
                              className={`w-full px-2 py-1 border rounded text-sm ${
                                spec.matchConfidence === 'NONE'
                                  ? 'border-yellow-400 bg-yellow-50'
                                  : 'border-gray-300'
                              }`}
                            >
                              <option value="">-- Select Material --</option>
                              {materials.map((mat: MaterialOption) => (
                                <option key={mat.id} value={mat.id}>
                                  {mat.name}
                                </option>
                              ))}
                            </select>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium ${
                                spec.matchConfidence === 'MANUAL'
                                  ? 'bg-green-100 text-green-600'
                                  : spec.matchConfidence === 'EXACT'
                                    ? 'bg-green-100 text-green-800'
                                    : spec.matchConfidence === 'PARTIAL'
                                      ? 'bg-amber-100 text-amber-800'
                                      : 'bg-red-100 text-red-500'
                              }`}
                            >
                              {spec.matchConfidence}
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                            {spec.thickness}
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                            {spec.edge}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Template selection */}
                <div>
                  <h3 className="text-sm font-medium text-gray-900 mb-2">
                    Apply to Templates *
                  </h3>
                  {templates.length === 0 ? (
                    <p className="text-xs text-gray-500">
                      No templates found for this project. Create templates
                      first.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {templates.map((t: TemplateOption) => (
                        <label
                          key={t.id}
                          className="flex items-center gap-2 cursor-pointer"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTemplateIds.includes(t.id)}
                            onChange={() => handleTemplateToggle(t.id)}
                            disabled={activeGroup.saved}
                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700">
                            {t.name}{' '}
                            <span className="text-gray-400">
                              (Type {t.unitTypeCode})
                            </span>
                          </span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                {/* Save button for this tab */}
                <div className="flex items-center justify-between pt-4 border-t border-gray-200">
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
                  >
                    Cancel
                  </button>
                  {!activeGroup.saved && (
                    <button
                      onClick={() => handleSaveMappings(activeTab)}
                      disabled={
                        savingTab !== null ||
                        unmappedCount > 0 ||
                        selectedTemplateIds.length === 0
                      }
                      className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
                    >
                      {savingTab === activeTab
                        ? 'Saving\u2026'
                        : `Save Mappings for ${activeGroup.finishLevel || '\u2026'}`}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* All saved — show done prompt */}
            {allGroupsSaved && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg text-center">
                <p className="text-sm text-green-800 font-medium">
                  All {groups.length} schedule
                  {groups.length !== 1 ? 's' : ''} mapped and saved.
                </p>
                <button
                  onClick={handleReset}
                  className="mt-2 px-4 py-2 text-sm text-green-700 hover:text-green-900 font-medium"
                >
                  Upload More Schedules
                </button>
              </div>
            )}
          </div>
        )}

        {/* ─── Step 4: Done (fallback) ─── */}
        {step === 'done' && (
          <div className="text-center py-8">
            <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-4">
              <svg
                className="h-6 w-6 text-green-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">
              Mappings Saved
            </h3>
            <button
              onClick={handleReset}
              className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Upload More Schedules
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
