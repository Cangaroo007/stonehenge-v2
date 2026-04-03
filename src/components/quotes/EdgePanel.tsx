'use client';

import { useState, useMemo } from 'react';

// ── Props ────────────────────────────────────────────────────────────────────

export interface EdgePanelProps {
  // Edge selection state
  allEdgeIds: string[];
  selectedEdgeIds: string[];
  onSelectionChange: (edgeIds: string[]) => void;

  // Current edge state (keyed by edge ID)
  edgeProfiles: Record<string, string | null>;
  edgeBuildups: Record<string, { depth: number }>;

  // Available options
  edgeTypes: Array<{ id: string; name: string }>;

  // Apply callbacks
  onApplyProfile: (edgeIds: string[], profileId: string | null) => void;
  onApplyBuildup: (edgeIds: string[], depth: number | null) => void;

  // Attach piece callbacks — only when exactly 1 edge selected
  onAttachWaterfall: (edgeId: string) => void;
  onAttachSplashback: (edgeId: string) => void;

  // Optional
  disabled?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function humaniseEdgeId(edgeId: string): string {
  return edgeId
    .replace(/_/g, ' ')
    .replace(/\br\b/gi, 'R')
    .replace(/\bbtm\b/gi, 'Bottom')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Component ────────────────────────────────────────────────────────────────

export default function EdgePanel({
  allEdgeIds,
  selectedEdgeIds,
  onSelectionChange,
  edgeProfiles,
  edgeBuildups,
  edgeTypes,
  onApplyProfile,
  onApplyBuildup,
  onAttachWaterfall,
  onAttachSplashback,
  disabled = false,
}: EdgePanelProps) {
  // ── Local pending state (not applied until user clicks Apply) ──────────
  const [pendingProfileId, setPendingProfileId] = useState<string | null | undefined>(undefined);
  const [pendingBuildupChoice, setPendingBuildupChoice] = useState<'off' | '20' | '40' | 'custom' | null>(null);
  const [customBuildupMm, setCustomBuildupMm] = useState('');

  const selectionCount = selectedEdgeIds.length;
  const hasSelection = selectionCount > 0;

  // ── Current state helpers ──────────────────────────────────────────────

  const currentProfileSummary = useMemo(() => {
    if (selectionCount === 0) return '';
    const profiles = selectedEdgeIds.map((id) => edgeProfiles[id] ?? null);
    const uniqueIds = Array.from(new Set(profiles));
    if (uniqueIds.length > 1) return 'Currently: Mixed';
    const profileId = uniqueIds[0];
    if (!profileId) return 'Currently: Raw';
    const match = edgeTypes.find((e) => e.id === profileId);
    return `Currently: ${match?.name ?? 'Unknown'}`;
  }, [selectedEdgeIds, edgeProfiles, edgeTypes, selectionCount]);

  const currentBuildupSummary = useMemo(() => {
    if (selectionCount === 0) return '';
    const depths = selectedEdgeIds.map((id) => edgeBuildups[id]?.depth ?? null);
    const unique = Array.from(new Set(depths));
    if (unique.length > 1) return 'Currently: Mixed';
    const d = unique[0];
    return d ? `Currently: ${d}mm` : 'Currently: Off';
  }, [selectedEdgeIds, edgeBuildups, selectionCount]);

  // ── Derived pending values ─────────────────────────────────────────────

  const pendingDepthMm: number | null | undefined = useMemo(() => {
    if (pendingBuildupChoice === null) return undefined; // nothing chosen
    if (pendingBuildupChoice === 'off') return null;
    if (pendingBuildupChoice === '20') return 20;
    if (pendingBuildupChoice === '40') return 40;
    if (pendingBuildupChoice === 'custom') {
      const parsed = parseInt(customBuildupMm);
      return isNaN(parsed) || parsed <= 0 ? undefined : parsed;
    }
    return undefined;
  }, [pendingBuildupChoice, customBuildupMm]);

  // ── Handlers ───────────────────────────────────────────────────────────

  const toggleEdge = (edgeId: string) => {
    if (disabled) return;
    if (selectedEdgeIds.includes(edgeId)) {
      onSelectionChange(selectedEdgeIds.filter((id) => id !== edgeId));
    } else {
      onSelectionChange([...selectedEdgeIds, edgeId]);
    }
  };

  const selectAll = () => {
    if (disabled) return;
    onSelectionChange([...allEdgeIds]);
  };

  const clearSelection = () => {
    if (disabled) return;
    onSelectionChange([]);
  };

  const handleApplyProfile = () => {
    if (!hasSelection || pendingProfileId === undefined || disabled) return;
    onApplyProfile(selectedEdgeIds, pendingProfileId);
    setPendingProfileId(undefined);
  };

  const handleApplyBuildup = () => {
    if (!hasSelection || pendingDepthMm === undefined || disabled) return;
    onApplyBuildup(selectedEdgeIds, pendingDepthMm);
    setPendingBuildupChoice(null);
    setCustomBuildupMm('');
  };

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <div className={`border border-gray-200 rounded-lg overflow-hidden ${disabled ? 'opacity-50 pointer-events-none' : ''}`}>
      {/* ── Edge Selection ──────────────────────────────────────────────── */}
      <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700">
            {selectionCount === 0
              ? 'No edges selected'
              : selectionCount === 1
                ? '1 edge selected'
                : `${selectionCount} edges selected`}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={selectAll}
              className="text-xs text-primary-600 hover:text-primary-700 font-medium"
            >
              Select All
            </button>
            {hasSelection && (
              <button
                type="button"
                onClick={clearSelection}
                className="text-xs text-gray-500 hover:text-gray-700 font-medium"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {allEdgeIds.map((edgeId) => {
            const isSelected = selectedEdgeIds.includes(edgeId);
            return (
              <button
                key={edgeId}
                type="button"
                onClick={() => toggleEdge(edgeId)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  isSelected
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400 hover:bg-primary-50'
                }`}
              >
                {humaniseEdgeId(edgeId)}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Edge Finish + Build-Up (side by side on wider screens) ────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-gray-200">
        {/* ── Edge Finish ──────────────────────────────────────────────── */}
        <div className="p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Edge Finish</h4>
          {currentProfileSummary && (
            <p className="text-xs text-gray-500">{currentProfileSummary}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setPendingProfileId(null)}
              className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                pendingProfileId === null
                  ? 'bg-gray-700 text-white border-gray-700'
                  : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
              }`}
            >
              Raw
            </button>
            {edgeTypes.map((et) => (
              <button
                key={et.id}
                type="button"
                onClick={() => setPendingProfileId(et.id)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  pendingProfileId === et.id
                    ? 'bg-primary-600 text-white border-primary-600'
                    : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                }`}
              >
                {et.name}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleApplyProfile}
            disabled={!hasSelection || pendingProfileId === undefined}
            className="w-full text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply to selected edges
          </button>
        </div>

        {/* ── Build-Up ─────────────────────────────────────────────────── */}
        <div className="p-4 space-y-3">
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Build-Up</h4>
          {currentBuildupSummary && (
            <p className="text-xs text-gray-500">{currentBuildupSummary}</p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(['off', '20', '40', 'custom'] as const).map((choice) => {
              const label = choice === 'off' ? 'Off' : choice === 'custom' ? 'Custom' : `${choice}mm`;
              return (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setPendingBuildupChoice(choice)}
                  className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                    pendingBuildupChoice === choice
                      ? 'bg-primary-600 text-white border-primary-600'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-primary-400'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {pendingBuildupChoice === 'custom' && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={customBuildupMm}
                onChange={(e) => setCustomBuildupMm(e.target.value)}
                placeholder="mm"
                className="w-20 text-sm px-2 py-1 border border-gray-300 rounded focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
              />
              <span className="text-xs text-gray-500">mm</span>
            </div>
          )}
          <button
            type="button"
            onClick={handleApplyBuildup}
            disabled={!hasSelection || pendingDepthMm === undefined}
            className="w-full text-sm px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Apply to selected edges
          </button>
        </div>
      </div>

      {/* ── Attach Piece ───────────────────────────────────────────────── */}
      <div className="border-t border-gray-200 px-4 py-3">
        <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Attach Piece</h4>
        {selectionCount === 0 && (
          <p className="text-xs text-gray-400 italic">Select an edge to attach a piece</p>
        )}
        {selectionCount > 1 && (
          <p className="text-xs text-gray-400 italic">Select a single edge to attach a piece</p>
        )}
        {selectionCount === 1 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onAttachWaterfall(selectedEdgeIds[0])}
              className="flex-1 text-sm px-3 py-1.5 font-medium text-orange-600 bg-white border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
            >
              + Waterfall
            </button>
            <button
              type="button"
              onClick={() => onAttachSplashback(selectedEdgeIds[0])}
              className="flex-1 text-sm px-3 py-1.5 font-medium text-orange-600 bg-white border border-orange-300 rounded-lg hover:bg-orange-50 transition-colors"
            >
              + Splashback
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
