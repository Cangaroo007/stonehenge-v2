'use client';

import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface GapData {
  gaps: {
    serviceRates: Array<{
      serviceType: string;
      fabricationCategory: string;
      description: string;
    }>;
    edgeRates: Array<{
      edgeTypeName: string;
      fabricationCategory: string;
      description: string;
    }>;
    cutoutRates: Array<{
      cutoutTypeName: string;
      fabricationCategory: string;
      description: string;
    }>;
  };
  summary: {
    totalGaps: number;
    serviceRateGaps: number;
    edgeRateGaps: number;
    cutoutRateGaps: number;
  };
  coverage: {
    serviceRates: { configured: number; total: number; percent: number };
    edgeRates: { configured: number; total: number; percent: number };
    cutoutRates: { configured: number; total: number; percent: number };
  };
}

const CATEGORY_LABELS: Record<string, string> = {
  ENGINEERED: 'Engineered Quartz',
  NATURAL_HARD: 'Natural Hard (Granite)',
  NATURAL_SOFT: 'Natural Soft (Marble)',
  NATURAL_PREMIUM: 'Natural Premium (Quartzite)',
  SINTERED: 'Sintered / Porcelain',
};

function formatServiceType(type: string): string {
  return type
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

function formatCategory(category: string): string {
  return CATEGORY_LABELS[category] || category.replace(/_/g, ' ');
}

function CoverageBar({
  label,
  configured,
  total,
  percent,
}: {
  label: string;
  configured: number;
  total: number;
  percent: number;
}) {
  return (
    <div className="flex items-center gap-4">
      <span className="text-sm font-medium text-gray-700 w-32 shrink-0">
        {label}:
      </span>
      <div className="flex-1 h-4 bg-gray-200 rounded-full overflow-hidden">
        <div
          className={cn(
            'h-full rounded-full transition-all',
            percent === 100
              ? 'bg-green-500'
              : percent >= 75
                ? 'bg-yellow-500'
                : 'bg-red-500'
          )}
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-sm text-gray-600 w-36 text-right shrink-0">
        {percent}% ({configured}/{total})
      </span>
    </div>
  );
}

export default function GapsPage() {
  const [data, setData] = useState<GapData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGaps = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch('/api/admin/pricing/gaps');
      if (!res.ok) throw new Error('Failed to fetch pricing gaps');
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error('Error fetching pricing gaps:', err);
      setError('Failed to load pricing gaps. Please try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGaps();
  }, [fetchGaps]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="card animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/3 mb-4" />
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded" />
            <div className="h-4 bg-gray-200 rounded" />
          </div>
        </div>
        <div className="card animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4" />
          <div className="space-y-2">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-8 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <p className="text-red-600">{error}</p>
          <button
            onClick={fetchGaps}
            className="mt-4 px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (!data) return null;

  // All rates configured — empty state
  if (data.summary.totalGaps === 0) {
    return (
      <div className="card">
        <div className="text-center py-12">
          <div className="text-green-500 text-5xl mb-4">&#10003;</div>
          <h2 className="text-lg font-semibold text-gray-900">
            All rates configured!
          </h2>
          <p className="text-sm text-gray-500 mt-2">
            No gaps found. Every service, edge, and cutout rate combination is
            configured.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Coverage Summary */}
      <div className="card">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Rate Coverage
        </h2>
        <div className="space-y-3">
          <CoverageBar
            label="Service Rates"
            configured={data.coverage.serviceRates.configured}
            total={data.coverage.serviceRates.total}
            percent={data.coverage.serviceRates.percent}
          />
          <CoverageBar
            label="Edge Rates"
            configured={data.coverage.edgeRates.configured}
            total={data.coverage.edgeRates.total}
            percent={data.coverage.edgeRates.percent}
          />
          <CoverageBar
            label="Cutout Rates"
            configured={data.coverage.cutoutRates.configured}
            total={data.coverage.cutoutRates.total}
            percent={data.coverage.cutoutRates.percent}
          />
        </div>
        <div className="mt-4 pt-4 border-t border-gray-200">
          <p className="text-sm font-medium text-gray-700">
            Total Gaps:{' '}
            <span className="text-red-600">{data.summary.totalGaps}</span>
          </p>
        </div>
      </div>

      {/* Missing Service Rates */}
      {data.gaps.serviceRates.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Missing Service Rates ({data.summary.serviceRateGaps})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.gaps.serviceRates.map((gap, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {formatServiceType(gap.serviceType)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatCategory(gap.fabricationCategory)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href="/admin/pricing/services"
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        Configure &rarr;
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Missing Edge Rates */}
      {data.gaps.edgeRates.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Missing Edge Rates ({data.summary.edgeRateGaps})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Edge Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.gaps.edgeRates.map((gap, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {gap.edgeTypeName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatCategory(gap.fabricationCategory)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href="/admin/pricing/edges"
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        Configure &rarr;
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Missing Cutout Rates */}
      {data.gaps.cutoutRates.length > 0 && (
        <div className="card">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Missing Cutout Rates ({data.summary.cutoutRateGaps})
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Cutout Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {data.gaps.cutoutRates.map((gap, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {gap.cutoutTypeName}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {formatCategory(gap.fabricationCategory)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <a
                        href="/admin/pricing/cutouts"
                        className="text-sm font-medium text-primary-600 hover:text-primary-700"
                      >
                        Configure &rarr;
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
