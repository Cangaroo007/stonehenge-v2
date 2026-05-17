'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';

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
          throw new Error('Failed to load LiDAR fixtures');
        }
        const data = await response.json();
        if (!cancelled) {
          setScans(data.scans ?? []);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to load LiDAR fixtures');
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
    try {
      const response = await fetch(`/api/quotes/${quoteId}/lidar-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId, replaceExisting }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to import LiDAR scan');
      }

      const warningText = Array.isArray(data.warnings) && data.warnings.length > 0
        ? ` (${data.warnings.length} warning${data.warnings.length === 1 ? '' : 's'})`
        : '';
      toast.success(`Imported ${data.imported?.length ?? 0} piece${warningText}`);
      router.push(`/quotes/${quoteId}?mode=edit`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import LiDAR scan');
    } finally {
      setImportingScanId(null);
    }
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-primary-600">Prototype bridge</p>
          <h1 className="text-2xl font-semibold text-gray-900">LiDAR scan import</h1>
          <p className="mt-2 text-sm text-gray-600 max-w-2xl">
            Import safe mock LiDAR scans from the prototype into this v2 quote as normal quote pieces.
            This is intentionally isolated from the production drawing reader.
          </p>
        </div>
        <Link href={`/quotes/${quoteId}?mode=edit`} className="btn-secondary">
          Back to quote
        </Link>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        This is a launch-safe bridge for testing geometry, cutout hints, wall-edge hints, and recalculated totals.
        It is not the full iOS LiDAR scanner or the full v3 Konva editor.
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

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-white p-6 text-sm text-gray-500">
          Loading LiDAR fixtures...
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
