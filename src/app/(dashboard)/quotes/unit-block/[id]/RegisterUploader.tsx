'use client';

import { useState, useCallback } from 'react';
import MultiFileUpload, {
  type SelectedFile,
} from '@/components/unit-block/MultiFileUpload';

/* ─── Types matching the API / register-parser ─── */

interface ParsedUnit {
  unitNumber: string;
  level: number | null;
  colourScheme: string | null;
  finishLevel: string | null;
  unitTypeCode: string | null;
  saleStatus: string | null;
  buyerChangeSpec: boolean;
}

interface ParsedRegister {
  projectName: string | null;
  buildingName: string | null;
  units: ParsedUnit[];
  confidence: number;
  notes: string | null;
}

/* ─── Per-file processing status ─── */

type FileStatus = 'pending' | 'processing' | 'success' | 'error';

interface ProcessedFile {
  fileName: string;
  status: FileStatus;
  error?: string;
  unitCount?: number;
  fileId?: number;
  confidence?: number;
}

/* ─── Merged result ─── */

interface MergedRegisterResult {
  allUnits: ParsedUnit[];
  duplicates: string[];
  totalFromAllFiles: number;
  totalAfterDedup: number;
  fileIds: number[];
}

/* ─── Confirm result ─── */

interface ConfirmResult {
  unitsCreated: number;
  skipped: string[];
  templateLinking?: { linked: number; unlinked: number; missingTemplates: string[] };
  finishMappings?: { fullyMapped: number; partiallyMapped: number; unmapped: number };
}

/* ─── Component steps ─── */

type Step = 'select' | 'processing' | 'review' | 'confirming' | 'done';

interface RegisterUploaderProps {
  projectId: string;
  onUnitsCreated?: () => void;
}

let fileIdCounter = 0;

export default function RegisterUploader({
  projectId,
  onUnitsCreated,
}: RegisterUploaderProps) {
  const [step, setStep] = useState<Step>('select');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [processedFiles, setProcessedFiles] = useState<ProcessedFile[]>([]);
  const [mergedResults, setMergedResults] = useState<MergedRegisterResult | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* ─── File selection handlers ─── */

  const handleFilesSelected = useCallback((files: File[]) => {
    const newSelected: SelectedFile[] = files.map((file) => ({
      file,
      id: `file-${++fileIdCounter}`,
    }));
    setSelectedFiles((prev: SelectedFile[]) => [...prev, ...newSelected]);
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setSelectedFiles((prev: SelectedFile[]) => prev.filter((sf: SelectedFile) => sf.id !== id));
  }, []);

  /* ─── Merge logic ─── */

  function mergeRegisterResults(
    parsedResults: ParsedUnit[][],
    fileIds: number[]
  ): MergedRegisterResult {
    const unitMap = new Map<string, ParsedUnit>();
    const duplicates: string[] = [];
    let totalFromAllFiles = 0;

    parsedResults.forEach((units) => {
      totalFromAllFiles += units.length;

      units.forEach((unit) => {
        const existing = unitMap.get(unit.unitNumber);
        if (existing) {
          // Duplicate — keep the first occurrence (already in map)
          duplicates.push(unit.unitNumber);
        } else {
          unitMap.set(unit.unitNumber, unit);
        }
      });
    });

    return {
      allUnits: Array.from(unitMap.values()),
      duplicates: Array.from(new Set(duplicates)),
      totalFromAllFiles,
      totalAfterDedup: unitMap.size,
      fileIds,
    };
  }

  /* ─── Process all files sequentially ─── */

  const processRegisterFiles = useCallback(
    async (files: File[]) => {
      const fileStatuses: ProcessedFile[] = files.map((f) => ({
        fileName: f.name,
        status: 'pending' as const,
      }));
      setProcessedFiles([...fileStatuses]);
      setStep('processing');
      setError(null);

      const allParsedUnits: ParsedUnit[][] = [];
      const allFileIds: number[] = [];

      const updateStatus = (
        index: number,
        status: FileStatus,
        extra?: Partial<ProcessedFile>
      ) => {
        fileStatuses[index] = { ...fileStatuses[index], status, ...extra };
        setProcessedFiles([...fileStatuses]);
      };

      for (let i = 0; i < files.length; i++) {
        updateStatus(i, 'processing');

        try {
          // Upload + parse via existing API
          const formData = new FormData();
          formData.append('file', files[i]);

          const res = await fetch(
            `/api/unit-blocks/${projectId}/parse-register?action=parse`,
            { method: 'POST', body: formData }
          );

          if (!res.ok) {
            const data = await res.json();
            throw new Error(data.error || 'Parse failed');
          }

          const data = await res.json();
          const parsed: ParsedRegister = data.parsed;
          const fileId: number = data.fileId;

          allParsedUnits.push(parsed.units);
          allFileIds.push(fileId);

          updateStatus(i, 'success', {
            unitCount: parsed.units.length,
            fileId,
            confidence: parsed.confidence,
          });
        } catch (err) {
          updateStatus(i, 'error', {
            error: err instanceof Error ? err.message : 'Parse failed',
          });
        }
      }

      // Only merge results from successfully parsed files
      const successfulResults = allParsedUnits;
      if (successfulResults.length === 0) {
        setError('All files failed to parse. Please check the files and try again.');
        setStep('select');
        return;
      }

      const merged = mergeRegisterResults(successfulResults, allFileIds);
      setMergedResults(merged);
      setStep('review');
    },
    [projectId]
  );

  /* ─── Start processing ─── */

  const handleStartProcessing = useCallback(() => {
    if (selectedFiles.length === 0) return;
    const files = selectedFiles.map((sf: SelectedFile) => sf.file);
    processRegisterFiles(files);
  }, [selectedFiles, processRegisterFiles]);

  /* ─── Confirm & create units ─── */

  const handleConfirm = useCallback(async () => {
    if (!mergedResults) return;

    setStep('confirming');
    setError(null);

    try {
      // Use the first fileId for the project's finishesRegisterId link
      const primaryFileId =
        mergedResults.fileIds.length > 0 ? mergedResults.fileIds[0] : undefined;

      const res = await fetch(
        `/api/unit-blocks/${projectId}/parse-register?action=confirm`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            parsed: {
              projectName: null,
              buildingName: null,
              units: mergedResults.allUnits,
              confidence: 1,
              notes: `Merged from ${mergedResults.fileIds.length} file(s)`,
            },
            fileId: primaryFileId,
          }),
        }
      );

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to confirm units');
      }

      const result: ConfirmResult = await res.json();
      setConfirmResult(result);
      setStep('done');
      onUnitsCreated?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm units');
      setStep('review');
    }
  }, [mergedResults, projectId, onUnitsCreated]);

  /* ─── Reset to start ─── */

  const handleReset = useCallback(() => {
    setStep('select');
    setSelectedFiles([]);
    setProcessedFiles([]);
    setMergedResults(null);
    setConfirmResult(null);
    setError(null);
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
            <svg className="h-3 w-3 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
            </svg>
          </span>
        );
      case 'error':
        return (
          <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-red-100">
            <svg className="h-3 w-3 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </span>
        );
    }
  };

  const successCount = processedFiles.filter((f: ProcessedFile) => f.status === 'success').length;
  const errorCount = processedFiles.filter((f: ProcessedFile) => f.status === 'error').length;

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-900">Finishes Register</h2>
        <p className="text-sm text-gray-500 mt-1">
          Upload one or more Finishes Register PDFs to auto-detect units and their finish specifications.
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
                  Upload &amp; Parse {selectedFiles.length} File
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
                Processing files with AI&hellip;
              </p>
            </div>

            <div className="space-y-2">
              {processedFiles.map((pf, i) => (
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
                  {pf.status === 'success' && pf.unitCount !== undefined && (
                    <span className="text-xs text-green-700 font-medium">
                      {pf.unitCount} unit{pf.unitCount !== 1 ? 's' : ''} found
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

        {/* ─── Step 3: Review merged results ─── */}
        {(step === 'review' || step === 'confirming') && mergedResults && (
          <div className="space-y-5">
            {/* File processing summary */}
            <div className="space-y-2">
              <h3 className="text-sm font-medium text-gray-900">Processing Summary</h3>
              {processedFiles.map((pf, i) => (
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
                  {pf.status === 'success' && pf.unitCount !== undefined && (
                    <span className="text-xs text-green-700 font-medium">
                      {pf.unitCount} unit{pf.unitCount !== 1 ? 's' : ''}
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

            {/* Error count warning */}
            {errorCount > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
                {errorCount} file{errorCount !== 1 ? 's' : ''} failed to parse.
                Results below are from the {successCount} successfully parsed file
                {successCount !== 1 ? 's' : ''} only.
              </div>
            )}

            {/* Duplicate warning */}
            {mergedResults.duplicates.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <span className="font-medium">
                  {mergedResults.duplicates.length} unit
                  {mergedResults.duplicates.length !== 1 ? 's' : ''} appeared in
                  multiple files
                </span>{' '}
                &mdash; first occurrence kept for each duplicate.
                <div className="mt-1 text-xs text-amber-600">
                  Duplicates: {mergedResults.duplicates.join(', ')}
                </div>
              </div>
            )}

            {/* Merged summary */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900 font-medium">
                Found {mergedResults.totalAfterDedup} unit
                {mergedResults.totalAfterDedup !== 1 ? 's' : ''} across{' '}
                {successCount} file{successCount !== 1 ? 's' : ''}
                {mergedResults.duplicates.length > 0 && (
                  <span>
                    {' '}
                    ({mergedResults.duplicates.length} duplicate
                    {mergedResults.duplicates.length !== 1 ? 's' : ''} removed)
                  </span>
                )}
              </p>
            </div>

            {/* Unit review table */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 mb-2">
                Units to Create ({mergedResults.allUnits.length})
              </h3>
              <div className="overflow-x-auto max-h-96 overflow-y-auto border border-gray-200 rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Unit No.
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Level
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Type Code
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Finish Level
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Colour Scheme
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Sale Status
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {mergedResults.allUnits.map((unit) => (
                      <tr
                        key={unit.unitNumber}
                        className={
                          mergedResults.duplicates.includes(unit.unitNumber)
                            ? 'bg-amber-50'
                            : ''
                        }
                      >
                        <td className="px-3 py-2 whitespace-nowrap font-medium text-gray-900">
                          {unit.unitNumber}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {unit.level != null ? unit.level : '\u2014'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {unit.unitTypeCode || '\u2014'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {unit.finishLevel || '\u2014'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-600">
                          {unit.colourScheme || '\u2014'}
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap text-gray-500">
                          {unit.saleStatus || '\u2014'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between pt-4 border-t border-gray-200">
              <button
                onClick={handleReset}
                disabled={step === 'confirming'}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirm}
                disabled={step === 'confirming' || mergedResults.allUnits.length === 0}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 font-medium"
              >
                {step === 'confirming'
                  ? 'Creating Units\u2026'
                  : `Confirm & Create ${mergedResults.allUnits.length} Unit${mergedResults.allUnits.length !== 1 ? 's' : ''}`}
              </button>
            </div>
          </div>
        )}

        {/* ─── Step 4: Done ─── */}
        {step === 'done' && confirmResult && (
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
            <h3 className="text-lg font-medium text-gray-900 mb-1">Units Created</h3>
            <p className="text-sm text-gray-500">
              Created {confirmResult.unitsCreated} unit
              {confirmResult.unitsCreated !== 1 ? 's' : ''} from{' '}
              {processedFiles.filter((f: ProcessedFile) => f.status === 'success').length} register file
              {processedFiles.filter((f: ProcessedFile) => f.status === 'success').length !== 1
                ? 's'
                : ''}
              .
            </p>

            {confirmResult.skipped.length > 0 && (
              <p className="text-xs text-amber-600 mt-2">
                {confirmResult.skipped.length} unit
                {confirmResult.skipped.length !== 1 ? 's' : ''} already existed and{' '}
                {confirmResult.skipped.length !== 1 ? 'were' : 'was'} skipped:{' '}
                {confirmResult.skipped.join(', ')}
              </p>
            )}

            {confirmResult.templateLinking && confirmResult.templateLinking.linked > 0 && (
              <p className="text-xs text-blue-600 mt-1">
                Auto-linked {confirmResult.templateLinking.linked} unit
                {confirmResult.templateLinking.linked !== 1 ? 's' : ''} to templates.
              </p>
            )}

            <button
              onClick={handleReset}
              className="mt-4 px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              Upload More Registers
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
