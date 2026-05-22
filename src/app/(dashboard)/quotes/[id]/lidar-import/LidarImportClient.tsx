'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { trackClarityEvent } from '@/lib/clarity';

interface LidarScanSummary {
  scanId: string;
  roomType: string;
  capturedAt: string;
  countertopCount: number;
  applianceCount: number;
  label: string;
}

interface LidarImportClientProps {
  quoteId: string;
}

export default function LidarImportClient({ quoteId }: LidarImportClientProps) {
  const router = useRouter();
  const [scans, setScans] = useState<LidarScanSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [importingScanId, setImportingScanId] = useState<string | null>(null);
  const [importingCustom, setImportingCustom] = useState(false);
  const [customScanJson, setCustomScanJson] = useState('');
  const [replaceExisting, setReplaceExisting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadScans() {
      setLoading(true);
      try {
        const response = await fetch(`/api/quotes/${quoteId}/lidar-import`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          throw new Error('Failed to load geometry fixtures');
        }
        const data = await response.json();
        if (!cancelled) {
          setScans(data.scans ?? []);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load geometry fixtures');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadScans();
    return () => {
      cancelled = true;
    };
  }, [quoteId]);

  async function importScan(scanId: string) {
    setImportingScanId(scanId);
    trackClarityEvent('lidar_import_started', {
      quoteId,
      scanId,
      replaceExisting,
    });
    try {
      const response = await fetch(`/api/quotes/${quoteId}/lidar-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, replaceExisting }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import geometry scan');
      }

      const warningText = Array.isArray(data.warnings) && data.warnings.length > 0
        ? ` (${data.warnings.length} warning${data.warnings.length === 1 ? '' : 's'})`
        : '';
      toast.success(`Imported ${data.imported?.length ?? 0} piece${warningText}`);
      trackClarityEvent('lidar_import_completed', {
        quoteId,
        scanId,
        importedPieces: data.imported?.length ?? 0,
        warningCount: Array.isArray(data.warnings) ? data.warnings.length : 0,
      });
      router.push(`/quotes/${quoteId}?mode=edit`);
      router.refresh();
    } catch (error) {
      trackClarityEvent('quote_error', {
        quoteId,
        area: 'lidar_import',
        message: error instanceof Error ? error.message : 'Failed to import geometry scan',
      });
      toast.error(error instanceof Error ? error.message : 'Failed to import geometry scan');
    } finally {
      setImportingScanId(null);
    }
  }

  async function importCustomScan() {
    if (!customScanJson.trim()) {
      toast.error('Paste geometry JSON first');
      return;
    }

    let parsedScan: unknown;
    try {
      parsedScan = JSON.parse(customScanJson);
    } catch {
      toast.error('Geometry JSON is not valid JSON');
      return;
    }

    setImportingCustom(true);
    trackClarityEvent('lidar_import_started', {
      quoteId,
      scanId: 'custom-json',
      replaceExisting,
    });
    try {
      const response = await fetch(`/api/quotes/${quoteId}/lidar-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scan: parsedScan, replaceExisting }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import geometry scan');
      }

      const warningText = Array.isArray(data.warnings) && data.warnings.length > 0
        ? ` (${data.warnings.length} warning${data.warnings.length === 1 ? '' : 's'})`
        : '';
      toast.success(`Imported ${data.imported?.length ?? 0} piece${warningText}`);
      trackClarityEvent('lidar_import_completed', {
        quoteId,
        scanId: data.scanId ?? 'custom-json',
        importedPieces: data.imported?.length ?? 0,
        warningCount: Array.isArray(data.warnings) ? data.warnings.length : 0,
      });
      router.push(`/quotes/${quoteId}?mode=edit`);
      router.refresh();
    } catch (error) {
      trackClarityEvent('quote_error', {
        quoteId,
        area: 'lidar_import_custom',
        message: error instanceof Error ? error.message : 'Failed to import geometry scan',
      });
      toast.error(error instanceof Error ? error.message : 'Failed to import geometry scan');
    } finally {
      setImportingCustom(false);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary-600">Geometry bridge</p>
          <h1 className="text-2xl font-semibold text-gray-900">Spatial geometry import</h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Import structured countertop geometry into this quote as normal pieces. This page is for
            scan/manual-trace JSON and prototype fixtures, not direct PDF drawing analysis.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/quotes/${quoteId}?mode=edit&importDrawing=1`} className="btn-primary">
            Import Drawing PDF
          </Link>
          <Link href={`/quotes/${quoteId}?mode=edit`} className="btn-secondary">
            Back to quote
          </Link>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        For files like the Law upstairs/downstairs PDFs, use Import Drawing PDF. This geometry bridge is
        for already-extracted polygon data: room dimensions, countertop vertices, cutout hints, wall-edge hints,
        and edge finish hints. It is not the AI drawing reader and it is not the full iOS LiDAR scanner.
      </div>

      <label className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={replaceExisting}
          onChange={(event) => setReplaceExisting(event.target.checked)}
          className="h-4 w-4 rounded border-gray-300"
        />
        Replace existing rooms and pieces in this quote before importing
      </label>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-semibold text-gray-900">Import Geometry JSON</h2>
            <p className="mt-1 text-sm text-gray-500">
              Paste an exported scan or manual trace with room dimensions, countertop vertices, walls, appliances,
              and exposure hints.
            </p>
          </div>
          <button
            type="button"
            onClick={importCustomScan}
            disabled={importingCustom || !customScanJson.trim()}
            className="btn-primary text-sm disabled:opacity-60"
          >
            {importingCustom ? 'Importing...' : 'Import JSON'}
          </button>
        </div>
        <textarea
          value={customScanJson}
          onChange={(event) => setCustomScanJson(event.target.value)}
          rows={8}
          spellCheck={false}
          placeholder='{"scanId":"site-scan-001","capturedAt":"2026-05-20T10:00:00+10:00","roomType":"kitchen","dimensions":{"widthMm":4200,"depthMm":3000,"ceilingHeightMm":2700},"walls":[],"countertops":[{"vertices":[{"x":0,"y":0},{"x":2400,"y":0},{"x":2400,"y":600},{"x":0,"y":600}],"heightFromFloorMm":900}],"appliances":[]}'
          className="mt-4 w-full rounded-lg border border-gray-200 px-3 py-2 font-mono text-xs text-gray-700 focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500"
        />
      </div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading geometry fixtures...
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {scans.map(scan => (
            <div key={scan.scanId} className="rounded-lg border border-gray-200 bg-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-semibold text-gray-900">{scan.label}</h2>
                  <p className="text-sm text-gray-500">
                    {scan.roomType} • {scan.countertopCount} top • {scan.applianceCount} appliance hints
                  </p>
                  <p className="mt-1 text-xs text-gray-400">{scan.scanId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => importScan(scan.scanId)}
                  disabled={!!importingScanId}
                  className="btn-primary text-sm disabled:opacity-60"
                >
                  {importingScanId === scan.scanId ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
