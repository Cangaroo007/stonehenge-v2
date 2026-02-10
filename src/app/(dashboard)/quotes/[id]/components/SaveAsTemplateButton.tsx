'use client';

import { useState } from 'react';

interface SaveAsTemplateButtonProps {
  analysisId: number;
  defaultName?: string;
  projectId?: number;
}

interface SaveResult {
  templateId: number;
  piecesConverted: number;
  piecesSkipped: number;
  warnings: string[];
}

export default function SaveAsTemplateButton({
  analysisId,
  defaultName,
  projectId,
}: SaveAsTemplateButtonProps) {
  const [showForm, setShowForm] = useState(false);
  const [templateName, setTemplateName] = useState(defaultName || '');
  const [unitTypeCode, setUnitTypeCode] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SaveResult | null>(null);

  const handleSave = async () => {
    if (!templateName.trim() || !unitTypeCode.trim()) return;

    setIsSaving(true);
    setError(null);

    try {
      const response = await fetch('/api/templates/from-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisId,
          name: templateName.trim(),
          unitTypeCode: unitTypeCode.trim(),
          projectId: projectId || undefined,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save template');
      }

      const data = await response.json();
      setResult({
        templateId: data.templateId,
        piecesConverted: data.piecesConverted,
        piecesSkipped: data.piecesSkipped,
        warnings: data.warnings || [],
      });
      setShowForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  if (result) {
    return (
      <div className="p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
        <div className="flex items-center gap-2">
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-700 text-sm font-medium">
            Template saved — {result.piecesConverted} piece{result.piecesConverted !== 1 ? 's' : ''} converted
            {result.piecesSkipped > 0 && (
              <span className="text-yellow-700">
                {' '}({result.piecesSkipped} skipped due to low confidence)
              </span>
            )}
          </span>
        </div>
        {result.warnings.length > 0 && (
          <ul className="text-xs text-yellow-700 ml-7 list-disc list-inside space-y-0.5">
            {result.warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        )}
        <div className="ml-7">
          <a
            href="/quotes/unit-block"
            className="text-sm text-primary-600 hover:text-primary-700 underline"
          >
            View templates in Unit Block Projects
          </a>
        </div>
      </div>
    );
  }

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
        </svg>
        Save as Template
      </button>
    );
  }

  return (
    <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
      <h4 className="text-sm font-semibold text-blue-900 mb-3">Save as Unit Type Template</h4>

      {error && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label className="block text-sm text-blue-800 mb-1">Template Name</label>
          <input
            type="text"
            value={templateName}
            onChange={(e) => setTemplateName(e.target.value)}
            placeholder="e.g. Type A — Kitchen & Wet Areas"
            className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <div>
          <label className="block text-sm text-blue-800 mb-1">Unit Type Code</label>
          <input
            type="text"
            value={unitTypeCode}
            onChange={(e) => setUnitTypeCode(e.target.value)}
            placeholder="e.g. A, B, C"
            className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      <div className="mt-3 flex gap-2 justify-end">
        <button
          onClick={() => {
            setShowForm(false);
            setError(null);
          }}
          className="px-3 py-1.5 text-sm text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving || !templateName.trim() || !unitTypeCode.trim()}
          className="px-3 py-1.5 text-sm font-medium text-white bg-primary-600 rounded hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? 'Saving...' : 'Save Template'}
        </button>
      </div>
    </div>
  );
}
