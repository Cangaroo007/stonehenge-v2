'use client';

import { useState, useEffect, useCallback } from 'react';

interface MissingMapping {
  unitTypeCode: string;
  finishLevel: string;
  colourScheme: string | null;
  missingRoles: string[];
  unitCount: number;
}

interface ReadinessData {
  totalUnits: number;
  fullyMapped: number;
  partiallyMapped: number;
  unmapped: number;
  missingMappings: MissingMapping[];
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
  NO_TEMPLATE: 'No Template',
};

interface MappingReadinessProps {
  projectId: string;
}

export default function MappingReadiness({ projectId }: MappingReadinessProps) {
  const [readiness, setReadiness] = useState<ReadinessData | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const fetchReadiness = useCallback(async () => {
    try {
      const res = await fetch(`/api/unit-blocks/${projectId}/mapping-status`);
      if (res.ok) {
        setReadiness(await res.json());
      }
    } catch (err) {
      console.error('Failed to load mapping readiness:', err);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    fetchReadiness();
  }, [fetchReadiness]);

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="animate-pulse space-y-3">
          <div className="h-4 bg-gray-200 rounded w-1/3"></div>
          <div className="h-6 bg-gray-100 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  if (!readiness || readiness.totalUnits === 0) {
    return null;
  }

  const allMapped = readiness.fullyMapped === readiness.totalUnits;
  const hasMissing = readiness.missingMappings.length > 0;

  // Progress percentage
  const progressPercent = readiness.totalUnits > 0
    ? Math.round((readiness.fullyMapped / readiness.totalUnits) * 100)
    : 0;

  return (
    <div className={`rounded-lg shadow ${
      allMapped
        ? 'bg-green-50 border border-green-200'
        : hasMissing
          ? 'bg-amber-50 border border-amber-200'
          : 'bg-white'
    }`}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full p-6 flex items-center justify-between text-left"
      >
        <div>
          <h2 className={`text-lg font-semibold ${
            allMapped ? 'text-green-900' : 'text-gray-900'
          }`}>
            Mapping Status
          </h2>
          <p className={`text-sm mt-1 ${allMapped ? 'text-green-700' : 'text-gray-600'}`}>
            <span className="font-semibold">{readiness.fullyMapped}</span> / {readiness.totalUnits} units ready for quote generation
          </p>

          {/* Progress bar */}
          <div className="mt-2 w-64 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                allMapped ? 'bg-green-500' : progressPercent > 50 ? 'bg-blue-500' : 'bg-amber-500'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {hasMissing && (
          <svg className={`h-5 w-5 text-gray-500 transition-transform ${expanded ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        )}
      </button>

      {expanded && hasMissing && (
        <div className="px-6 pb-6 space-y-2">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-white rounded-lg p-3 border border-green-200">
              <p className="text-xs text-gray-500">Fully Mapped</p>
              <p className="text-lg font-semibold text-green-600">{readiness.fullyMapped}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-amber-200">
              <p className="text-xs text-gray-500">Partially Mapped</p>
              <p className="text-lg font-semibold text-amber-600">{readiness.partiallyMapped}</p>
            </div>
            <div className="bg-white rounded-lg p-3 border border-red-200">
              <p className="text-xs text-gray-500">Unmapped</p>
              <p className="text-lg font-semibold text-red-600">{readiness.unmapped}</p>
            </div>
          </div>

          {/* Missing mappings detail */}
          <div className="space-y-2">
            {readiness.missingMappings.map((mm, idx) => {
              const isNoTemplate = mm.missingRoles.includes('NO_TEMPLATE');
              return (
                <div
                  key={idx}
                  className={`bg-white rounded-lg p-4 border ${
                    isNoTemplate ? 'border-red-200' : 'border-amber-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-sm ${isNoTemplate ? 'text-red-600' : 'text-amber-600'}`}>
                        {isNoTemplate ? '\u274C' : '\u26A0\uFE0F'}
                      </span>
                      <div>
                        <p className="text-sm font-medium text-gray-900">
                          Type {mm.unitTypeCode} &times; {mm.finishLevel}
                          {mm.colourScheme ? ` \u00D7 ${mm.colourScheme}` : ''}
                        </p>
                        <p className="text-xs text-gray-500">
                          {mm.unitCount} unit{mm.unitCount !== 1 ? 's' : ''}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      {isNoTemplate ? (
                        <span className="text-xs text-red-600 font-medium">No template for Type {mm.unitTypeCode}</span>
                      ) : (
                        <span className="text-xs text-amber-700">
                          Missing: {mm.missingRoles.map((r) => ROLE_LABELS[r] || r).join(', ')}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
