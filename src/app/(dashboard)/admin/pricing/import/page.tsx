'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Upload,
  Sparkles,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronRight,
  X,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
  Send,
  RotateCcw,
  Database,
  MessageSquare,
  Plus,
} from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import type { Proposal, ProposedMaterial, Uncertainty } from '@/lib/services/material-ingestor';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcDisplayPricePerSqm(costPrice: number | null, lengthMm: number | null, widthMm: number | null): string {
  if (!costPrice || !lengthMm || !widthMm) return '—';
  const areaSqm = (lengthMm * widthMm) / 1_000_000;
  if (areaSqm <= 0) return '—';
  return `$${(costPrice / areaSqm).toFixed(2)}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase = 'upload' | 'parsing' | 'staging' | 'syncing' | 'done';

interface Supplier {
  id: string;
  name: string;
}

interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SeverityIcon({ severity }: { severity: Uncertainty['severity'] }) {
  if (severity === 'critical')
    return <AlertTriangle className="h-4 w-4 text-red-500 flex-shrink-0" />;
  if (severity === 'warning')
    return <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />;
  return <Info className="h-4 w-4 text-blue-500 flex-shrink-0" />;
}

function SeverityBadge({ severity }: { severity: Uncertainty['severity'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
        severity === 'critical' && 'bg-red-100 text-red-700',
        severity === 'warning' && 'bg-amber-100 text-amber-700',
        severity === 'info' && 'bg-blue-100 text-blue-700',
      )}
    >
      {severity}
    </span>
  );
}

function ActionBadge({ action }: { action: ProposedMaterial['action'] }) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide',
        action === 'create' && 'bg-emerald-100 text-emerald-700',
        action === 'update' && 'bg-blue-100 text-blue-700',
        action === 'skip' && 'bg-gray-100 text-gray-500',
        action === 'create_variant' && 'bg-purple-100 text-purple-700',
      )}
    >
      {action === 'create' && 'NEW'}
      {action === 'update' && 'UPDATE'}
      {action === 'skip' && 'SKIP'}
      {action === 'create_variant' && 'VARIANT'}
    </span>
  );
}

function ConfidenceDots({ level }: { level: ProposedMaterial['confidence'] }) {
  const filled = level === 'high' ? 3 : level === 'medium' ? 2 : 1;
  const filledColor =
    level === 'high' ? 'bg-emerald-500' : level === 'medium' ? 'bg-amber-500' : 'bg-red-500';
  return (
    <span className="inline-flex gap-0.5" title={`Confidence: ${level}`}>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full',
            i <= filled ? filledColor : 'bg-gray-200',
          )}
        />
      ))}
    </span>
  );
}

function PriceDelta({ change }: { change: ProposedMaterial['priceChange'] }) {
  if (!change || change.percentChange === null) return null;
  const pct = change.percentChange;
  const abs = Math.abs(pct);
  if (abs < 0.1) return <Minus className="h-3 w-3 text-gray-400" />;
  return pct > 0 ? (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-red-600 font-medium">
      <ArrowUpRight className="h-3 w-3" />
      {abs.toFixed(1)}%
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 text-[11px] text-emerald-600 font-medium">
      <ArrowDownRight className="h-3 w-3" />
      {abs.toFixed(1)}%
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [phase, setPhase] = useState<Phase>('upload');
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [selectedSupplierId, setSelectedSupplierId] = useState('');
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [commandInput, setCommandInput] = useState('');
  const [isRefining, setIsRefining] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [showNewSupplierForm, setShowNewSupplierForm] = useState(false);
  const [isCreatingSupplier, setIsCreatingSupplier] = useState(false);
  const [newSupplierForm, setNewSupplierForm] = useState({
    name: '',
    contactEmail: '',
    phone: '',
    website: '',
    defaultMarginPercent: '',
    defaultSlabLengthMm: '',
    defaultSlabWidthMm: '',
    defaultThicknessMm: '',
    notes: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const commandInputRef = useRef<HTMLInputElement>(null);

  // Load suppliers on mount
  useEffect(() => {
    fetch('/api/suppliers')
      .then((r) => r.json())
      .then((data: Supplier[]) => setSuppliers(Array.isArray(data) ? data : []))
      .catch(() => setSuppliers([]));
  }, []);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  // Warn before navigating away if a proposal is loaded
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!proposal) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [proposal]);

  // ── Derived state ──────────────────────────────────────────────────────────

  const criticalOpen = proposal?.uncertainties.filter(
    (u) => u.severity === 'critical' && !u.resolved,
  ) ?? [];

  const hasUnsetFabrication = proposal?.extractedData
    .filter(m => m.action !== 'skip')
    .some(m => !m.fabricationCategory) ?? false;

  const canSync = proposal !== null && criticalOpen.length === 0 && !hasUnsetFabrication && phase === 'staging';

  const activeItems = proposal?.extractedData.filter((m) => m.action !== 'skip') ?? [];
  const newItems = activeItems.filter((m) => m.action === 'create' || m.action === 'create_variant');
  const updateItems = activeItems.filter((m) => m.action === 'update');

  // ── Helpers ────────────────────────────────────────────────────────────────

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
  }, []);

  /**
   * Safely parse a Response as JSON.
   * If the server returns HTML (a 404/500 error page, a login redirect, or an
   * uncaught Next.js exception), this throws a readable error instead of the
   * cryptic "Unexpected token <" SyntaxError.
   */
  async function safeJson(res: Response): Promise<Record<string, unknown>> {
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.includes('application/json')) {
      const body = await res.text();
      const title = body.match(/<title>([^<]+)<\/title>/i)?.[1];
      const hint = title ?? body.slice(0, 160).replace(/\s+/g, ' ');
      throw new Error(
        `Server returned a non-JSON response (HTTP ${res.status}):\n${hint}\n\nMake sure ANTHROPIC_API_KEY is set in .env and the dev server was restarted.`,
      );
    }
    return res.json() as Promise<Record<string, unknown>>;
  }

  async function handleFileUpload(file: File) {
    setPhase('parsing');
    try {
      const fd = new FormData();
      fd.append('file', file);
      if (selectedSupplierId) fd.append('supplierId', selectedSupplierId);

      const res = await fetch('/api/admin/pricing/import/parse', {
        method: 'POST',
        body: fd,
      });

      const data = await res.json() as { error?: string } & Partial<Proposal>;
      if (!res.ok || data.error) {
        throw new Error(data.error ?? `Server error (HTTP ${res.status})`);
      }

      const proposal = data as Proposal;
      setProposal(proposal);
      setPhase('staging');

      if (!selectedSupplierId && proposal.supplierName) {
        const match = suppliers.find(
          (s) => s.name.toLowerCase() === proposal.supplierName!.toLowerCase(),
        );
        if (match) {
          setSelectedSupplierId(match.id);
        } else {
          // Pre-fill new supplier form from parsed data
          setNewSupplierForm((prev) => ({
            ...prev,
            name: proposal.supplierName ?? '',
            defaultSlabLengthMm: proposal.extractedData[0]?.slabLengthMm?.toString() ?? '',
            defaultSlabWidthMm: proposal.extractedData[0]?.slabWidthMm?.toString() ?? '',
            defaultThicknessMm: proposal.extractedData[0]?.thicknessMm?.toString() ?? '',
          }));
        }
      }

      const critCount = proposal.uncertainties.filter(
        (u: Uncertainty) => u.severity === 'critical',
      ).length;
      if (critCount > 0) setDrawerOpen(true);

    } catch (err) {
      setPhase('upload');
      showToast(err instanceof Error ? err.message : 'Failed to parse price list', 'error');
    }
  }

  function onDropFile(e: React.DragEvent) {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }

  async function handleCommand() {
    if (!commandInput.trim() || !proposal || isRefining) return;
    const cmd = commandInput.trim();
    setCommandInput('');
    setIsRefining(true);
    try {
      const res = await fetch('/api/admin/pricing/import/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposal, command: cmd }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) ?? 'Refine failed');
      setProposal(data as unknown as Proposal);
      showToast('Proposal updated');
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Command failed', 'error');
    } finally {
      setIsRefining(false);
    }
  }

  function toggleAction(id: string) {
    if (!proposal) return;
    setProposal({
      ...proposal,
      extractedData: proposal.extractedData.map((m) => {
        if (m._id !== id) return m;
        if (m.action === 'skip') {
          return { ...m, action: m.existingMaterialId ? 'update' : 'create' };
        }
        return { ...m, action: 'skip' };
      }),
    });
  }

  function cycleCollisionAction(id: string) {
    if (!proposal) return;
    setProposal({
      ...proposal,
      extractedData: proposal.extractedData.map((m) => {
        if (m._id !== id) return m;
        const cycle: ProposedMaterial['action'][] = ['update', 'create_variant', 'skip'];
        const idx = cycle.indexOf(m.action as ProposedMaterial['action']);
        return { ...m, action: cycle[(idx + 1) % cycle.length] };
      }),
    });
  }

  async function handleSync() {
    if (!proposal || !selectedSupplierId) {
      showToast('Select the supplier for these materials before syncing. The AI could not detect one automatically.', 'error');
      return;
    }
    setPhase('syncing');
    try {
      const res = await fetch('/api/admin/pricing/import/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proposal,
          supplierId: selectedSupplierId,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) ?? 'Sync failed');
      setSyncResult(data as unknown as SyncResult);
      setPhase('done');
    } catch (err) {
      setPhase('staging');
      showToast(err instanceof Error ? err.message : 'Sync failed', 'error');
    }
  }

  async function handleCreateSupplier() {
    if (!newSupplierForm.name.trim()) {
      showToast('Supplier name is required', 'error');
      return;
    }
    setIsCreatingSupplier(true);
    try {
      const res = await fetch('/api/suppliers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newSupplierForm.name.trim(),
          contactEmail: newSupplierForm.contactEmail.trim() || null,
          phone: newSupplierForm.phone.trim() || null,
          website: newSupplierForm.website.trim() || null,
          defaultMarginPercent: newSupplierForm.defaultMarginPercent ? Number(newSupplierForm.defaultMarginPercent) : 0,
          defaultSlabLengthMm: newSupplierForm.defaultSlabLengthMm ? Number(newSupplierForm.defaultSlabLengthMm) : null,
          defaultSlabWidthMm: newSupplierForm.defaultSlabWidthMm ? Number(newSupplierForm.defaultSlabWidthMm) : null,
          defaultThicknessMm: newSupplierForm.defaultThicknessMm ? Number(newSupplierForm.defaultThicknessMm) : null,
          notes: newSupplierForm.notes.trim() || null,
        }),
      });
      const data = await safeJson(res);
      if (!res.ok) throw new Error((data.error as string) ?? 'Failed to create supplier');
      const created = data as unknown as Supplier & { id: string };
      setSuppliers((prev) => [...prev, { id: created.id, name: newSupplierForm.name.trim() }]);
      setSelectedSupplierId(created.id);
      setShowNewSupplierForm(false);
      showToast(`✓ ${newSupplierForm.name.trim()} added`);
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to create supplier', 'error');
    } finally {
      setIsCreatingSupplier(false);
    }
  }

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderUpload() {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-8">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary-50 ring-1 ring-primary-100">
            <Sparkles className="h-8 w-8 text-primary-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">AI Material Import</h2>
          <p className="mt-1 text-sm text-gray-500">
            Drop a supplier PDF and let the AI discover and stage all materials for you.
          </p>
        </div>

        {/* Supplier selector */}
        <div className="w-full max-w-sm space-y-1">
          <label className="block text-sm font-medium text-gray-700">Supplier</label>
          <select
            value={selectedSupplierId}
            onChange={(e) => setSelectedSupplierId(e.target.value)}
            className="w-full rounded-lg border-gray-300 shadow-sm focus:border-primary-500 focus:ring-primary-500 text-sm"
          >
            <option value="">— let AI detect from document —</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <Link href="/materials/suppliers" className="text-xs text-primary-600 hover:underline">
            Supplier not listed? Add one first &rarr;
          </Link>
        </div>

        {/* Hint: AI detect mode */}
        {!selectedSupplierId && (
          <div className="w-full max-w-sm rounded-lg bg-blue-50 border border-blue-200 px-4 py-2 text-sm text-blue-700 flex items-center gap-2">
            <Info className="h-4 w-4 flex-shrink-0" />
            AI will attempt to detect the supplier from the uploaded document.
          </div>
        )}

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); }}
          onDrop={onDropFile}
          onClick={() => { fileInputRef.current?.click(); }}
          className="w-full max-w-sm rounded-2xl border-2 border-dashed p-10 text-center transition cursor-pointer border-gray-300 bg-gray-50 hover:border-primary-400 hover:bg-primary-50"
        >
          <Upload className="mx-auto h-8 w-8 text-gray-400 mb-3" />
          <p className="text-sm font-medium text-gray-700">Click or drag & drop a PDF</p>
          <p className="mt-1 text-xs text-gray-400">Supplier price list · PDF only</p>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={onPickFile}
          />
        </div>
      </div>
    );
  }

  function renderParsing() {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        <p className="text-sm font-medium text-gray-600">AI is reading your price list…</p>
        <p className="text-xs text-gray-400">This can take up to 90 seconds for large price lists</p>
      </div>
    );
  }

  function renderStagingGrid() {
    if (!proposal) return null;
    return (
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50">
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Action
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Name
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Collection
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Code
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Cost
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Price/m²
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Δ
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Dimensions
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Grain
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Fabrication
              </th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                Surface Finish
              </th>
              <th className="whitespace-nowrap px-3 py-2.5 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Conf.
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {proposal.extractedData.map((m) => (
              <tr
                key={m._id}
                className={cn(
                  'transition-colors',
                  m.action === 'skip'
                    ? 'bg-gray-50 opacity-50'
                    : 'bg-white hover:bg-gray-50',
                )}
              >
                {/* Action */}
                <td className="px-3 py-2">
                  {m.matchType !== null ? (
                    <button
                      onClick={() => cycleCollisionAction(m._id)}
                      title="Click to cycle: update → create variant → skip"
                    >
                      <ActionBadge action={m.action} />
                    </button>
                  ) : (
                    <button onClick={() => toggleAction(m._id)}>
                      <ActionBadge action={m.action} />
                    </button>
                  )}
                </td>
                {/* Name */}
                <td className="px-3 py-2 font-medium text-gray-900 max-w-[200px] truncate">
                  {m.name}
                  {m.isDiscontinued && (
                    <span className="ml-1.5 text-[10px] font-semibold text-orange-500 uppercase">
                      DISC
                    </span>
                  )}
                </td>
                {/* Collection */}
                <td className="px-3 py-2 text-gray-500 max-w-[140px] truncate">
                  {m.collection ?? '—'}
                </td>
                {/* Code */}
                <td className="px-3 py-2 font-mono text-xs text-gray-500">
                  {m.productCode ?? (
                    <span className="text-amber-500 text-[10px]">auto-slug</span>
                  )}
                </td>
                {/* Cost */}
                <td className="px-3 py-2 text-right tabular-nums text-gray-900 font-medium">
                  {m.costPrice != null ? `$${m.costPrice.toFixed(2)}` : '—'}
                </td>
                {/* Price per m² */}
                <td className="px-3 py-2 text-right tabular-nums text-gray-500 text-xs">
                  {calcDisplayPricePerSqm(m.costPrice, m.slabLengthMm, m.slabWidthMm)}
                </td>
                {/* Delta */}
                <td className="px-3 py-2 text-right">
                  <PriceDelta change={m.priceChange} />
                </td>
                {/* Dimensions */}
                <td className="px-3 py-2 text-gray-500 tabular-nums text-xs">
                  {m.slabLengthMm && m.slabWidthMm
                    ? `${m.slabLengthMm}×${m.slabWidthMm}`
                    : '—'}
                  {m.thicknessMm ? (
                    <span className="ml-1 text-gray-400">{m.thicknessMm}mm</span>
                  ) : null}
                </td>
                {/* Grain match toggle */}
                <td className="px-3 py-2 text-center">
                  <button
                    onClick={() => {
                      if (!proposal) return;
                      setProposal({
                        ...proposal,
                        extractedData: proposal.extractedData.map((row) =>
                          row._id === m._id
                            ? { ...row, requiresGrainMatch: !row.requiresGrainMatch }
                            : row,
                        ),
                      });
                    }}
                    title={m.requiresGrainMatch ? 'Grain match required — click to unset' : 'No grain match — click to flag'}
                    className={cn(
                      'inline-flex items-center justify-center rounded-full w-5 h-5 text-[10px] font-bold transition-colors',
                      m.requiresGrainMatch
                        ? 'bg-amber-100 text-amber-700 ring-1 ring-amber-300'
                        : 'bg-gray-100 text-gray-400 hover:bg-amber-50 hover:text-amber-500',
                    )}
                  >
                    G
                  </button>
                </td>
                {/* Fabrication category */}
                <td className="px-3 py-2">
                  <select
                    value={m.fabricationCategory ?? ''}
                    onChange={(e) => {
                      if (!proposal) return;
                      setProposal({
                        ...proposal,
                        extractedData: proposal.extractedData.map((row) =>
                          row._id === m._id
                            ? { ...row, fabricationCategory: (e.target.value || null) as ProposedMaterial['fabricationCategory'] }
                            : row,
                        ),
                      });
                    }}
                    className={cn(
                      'text-xs rounded border px-1.5 py-0.5',
                      !m.fabricationCategory
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-gray-200 bg-white text-gray-700',
                    )}
                  >
                    <option value="">Select...</option>
                    <option value="ENGINEERED">Engineered Quartz</option>
                    <option value="NATURAL_HARD">Natural Granite</option>
                    <option value="NATURAL_SOFT">Natural Marble</option>
                    <option value="NATURAL_PREMIUM">Natural Premium</option>
                    <option value="SINTERED">Porcelain / Sintered</option>
                  </select>
                </td>
                {/* Surface Finish */}
                <td className="px-3 py-2">
                  <select
                    value={m.surfaceFinish ?? ''}
                    onChange={(e) => {
                      if (!proposal) return;
                      setProposal({
                        ...proposal,
                        extractedData: proposal.extractedData.map((row) =>
                          row._id === m._id
                            ? { ...row, surfaceFinish: (e.target.value || null) }
                            : row,
                        ),
                      });
                    }}
                    className={cn(
                      'text-xs rounded border px-1.5 py-0.5',
                      !m.surfaceFinish
                        ? 'border-amber-400 bg-amber-50 text-amber-700'
                        : 'border-gray-200 bg-white text-gray-700',
                    )}
                  >
                    <option value="">Select...</option>
                    <option value="Polished">Polished</option>
                    <option value="Matte">Matte</option>
                    <option value="Honed">Honed</option>
                    <option value="Brushed">Brushed</option>
                    <option value="Textured">Textured</option>
                  </select>
                </td>
                {/* Confidence */}
                <td className="px-3 py-2 text-center">
                  <ConfidenceDots level={m.confidence} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  function renderClarificationDrawer() {
    if (!proposal) return null;
    const open = proposal.uncertainties.filter((u) => !u.resolved);
    const resolved = proposal.uncertainties.filter((u) => u.resolved);

    return (
      <aside
        className={cn(
          'flex-shrink-0 transition-all duration-200',
          drawerOpen ? 'w-80' : 'w-10',
        )}
      >
        <div className="sticky top-0">
          {/* Toggle button */}
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-900 mb-3"
          >
            <MessageSquare className="h-4 w-4" />
            {drawerOpen && (
              <>
                <span>Clarifications</span>
                {open.length > 0 && (
                  <span className="ml-1 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                    {open.length}
                  </span>
                )}
              </>
            )}
          </button>

          {drawerOpen && (
            <div className="space-y-3 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {open.length === 0 && resolved.length === 0 && (
                <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-center">
                  <CheckCircle2 className="mx-auto h-5 w-5 text-emerald-500 mb-1" />
                  <p className="text-xs text-emerald-700 font-medium">No questions — all clear!</p>
                </div>
              )}

              {open.map((u) => (
                <div
                  key={u.id}
                  className={cn(
                    'rounded-xl border p-3 text-xs',
                    u.severity === 'critical' && 'border-red-200 bg-red-50',
                    u.severity === 'warning' && 'border-amber-200 bg-amber-50',
                    u.severity === 'info' && 'border-blue-100 bg-blue-50',
                  )}
                >
                  <div className="flex items-start gap-2 mb-1.5">
                    <SeverityIcon severity={u.severity} />
                    <SeverityBadge severity={u.severity} />
                  </div>
                  <p className="font-medium text-gray-800 leading-snug mb-1">{u.question}</p>
                  <p className="text-gray-500 leading-snug">{u.context}</p>
                  {u.relatedMaterialIds.length > 0 && (
                    <p className="mt-1 text-gray-400">
                      Affects {u.relatedMaterialIds.length} item
                      {u.relatedMaterialIds.length !== 1 ? 's' : ''}
                    </p>
                  )}
                  <p className="mt-2 text-gray-400 italic">
                    Use the command bar to answer ↑
                  </p>
                </div>
              ))}

              {resolved.length > 0 && (
                <details className="group">
                  <summary className="cursor-pointer text-xs text-gray-400 flex items-center gap-1 py-1">
                    <ChevronRight className="h-3 w-3 group-open:rotate-90 transition-transform" />
                    {resolved.length} resolved
                  </summary>
                  <div className="mt-2 space-y-2">
                    {resolved.map((u) => (
                      <div
                        key={u.id}
                        className="rounded-xl border border-gray-200 bg-gray-50 p-3 opacity-60 text-xs"
                      >
                        <div className="flex items-center gap-1.5 mb-1">
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                          <span className="font-medium text-gray-600 line-through">
                            {u.question}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>
          )}
        </div>
      </aside>
    );
  }

  function renderStaging() {
    if (!proposal) return null;

    return (
      <div className="space-y-4">
        {/* Header row */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-base font-semibold text-gray-900">
              {proposal.supplierName ?? 'Unknown Supplier'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {proposal.extractedData.length} items detected ·{' '}
              <span className="text-emerald-600 font-medium">{newItems.length} new</span>
              {' · '}
              <span className="text-blue-600 font-medium">{updateItems.length} updates</span>
              {proposal.effectiveDate && ` · effective ${proposal.effectiveDate}`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setPhase('upload');
                setProposal(null);
              }}
              className="flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start over
            </button>
          </div>
        </div>

        {/* Supplier matching banner */}
        {selectedSupplierId ? (
          <div className="flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
            <span className="font-medium">
              Matched to {suppliers.find((s) => s.id === selectedSupplierId)?.name ?? 'supplier'}
            </span>
            <button
              onClick={() => setSelectedSupplierId('')}
              className="ml-auto text-xs text-emerald-600 hover:text-emerald-800 underline"
            >
              Change
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-3">
            <div className="flex items-start gap-2 text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
              <span>
                <strong>{proposal.supplierName ?? 'Unknown supplier'}</strong> is not in your supplier list.
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowNewSupplierForm(true)}
                className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                <Plus className="h-3.5 w-3.5" />
                Add {proposal.supplierName ?? 'supplier'} as a new supplier
              </button>
              <select
                value=""
                onChange={(e) => setSelectedSupplierId(e.target.value)}
                className="rounded-lg border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
              >
                <option value="">Select an existing supplier</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Inline supplier creation form */}
            {showNewSupplierForm && (
              <div className="rounded-lg border border-amber-300 bg-white p-4 space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={newSupplierForm.name}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, name: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Contact Email</label>
                    <input
                      type="email"
                      value={newSupplierForm.contactEmail}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, contactEmail: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="text"
                      value={newSupplierForm.phone}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, phone: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Website</label>
                    <input
                      type="text"
                      value={newSupplierForm.website}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, website: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Default Margin %</label>
                    <input
                      type="number"
                      value={newSupplierForm.defaultMarginPercent}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, defaultMarginPercent: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Default Slab Length mm</label>
                    <input
                      type="number"
                      value={newSupplierForm.defaultSlabLengthMm}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, defaultSlabLengthMm: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Default Slab Width mm</label>
                    <input
                      type="number"
                      value={newSupplierForm.defaultSlabWidthMm}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, defaultSlabWidthMm: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Default Thickness mm</label>
                    <input
                      type="number"
                      value={newSupplierForm.defaultThicknessMm}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, defaultThicknessMm: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                    <input
                      type="text"
                      value={newSupplierForm.notes}
                      onChange={(e) => setNewSupplierForm((f) => ({ ...f, notes: e.target.value }))}
                      className="w-full rounded border-gray-300 text-sm shadow-sm focus:border-primary-500 focus:ring-primary-500"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleCreateSupplier}
                    disabled={isCreatingSupplier || !newSupplierForm.name.trim()}
                    className={cn(
                      'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                      !isCreatingSupplier && newSupplierForm.name.trim()
                        ? 'bg-gray-900 text-white hover:bg-gray-800'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                    )}
                  >
                    {isCreatingSupplier ? (
                      <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-white animate-spin" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    )}
                    Save Supplier
                  </button>
                  <button
                    onClick={() => setShowNewSupplierForm(false)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Command bar */}
        <div
          className={cn(
            'flex items-center gap-2 rounded-xl border bg-white shadow-sm px-4 py-2.5 transition-all',
            isRefining ? 'border-primary-300 ring-2 ring-primary-100' : 'border-gray-200',
          )}
        >
          <Sparkles className="h-4 w-4 text-primary-500 flex-shrink-0" />
          <input
            ref={commandInputRef}
            type="text"
            value={commandInput}
            onChange={(e) => setCommandInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCommand()}
            placeholder='e.g. "Ignore the Builders range" or "Factor in 5% waste margin"'
            disabled={isRefining}
            className="flex-1 bg-transparent text-sm text-gray-800 placeholder:text-gray-400 outline-none"
          />
          {commandInput.trim() && (
            <button
              onClick={() => setCommandInput('')}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={handleCommand}
            disabled={!commandInput.trim() || isRefining}
            className={cn(
              'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
              commandInput.trim() && !isRefining
                ? 'bg-primary-600 text-white hover:bg-primary-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed',
            )}
          >
            {isRefining ? (
              <span className="h-3.5 w-3.5 rounded-full border-2 border-gray-300 border-t-primary-500 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Apply
          </button>
        </div>

        {/* Command history pills */}
        {proposal.commandHistory.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {proposal.commandHistory.map((cmd, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600"
              >
                <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                {cmd}
              </span>
            ))}
          </div>
        )}

        {/* Critical blockers banner */}
        {criticalOpen.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>
              <strong>{criticalOpen.length} critical question{criticalOpen.length !== 1 ? 's' : ''}</strong> must
              be resolved before syncing. Use the command bar or clarification panel to answer them.
            </span>
          </div>
        )}

        {/* Two-column layout: grid + drawer */}
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-4">
            {renderStagingGrid()}

            {/* Legend */}
            <p className="text-[11px] text-gray-400">
              <span className="inline-flex items-center justify-center rounded-full w-4 h-4 bg-amber-100 text-amber-700 font-bold mr-1">G</span>
              Grain match required — AI infers from notes &amp; material type. Click to toggle per row.
            </p>

            {/* Sync footer */}
            <div className="flex items-center justify-between border-t border-gray-200 pt-4">
              <div>
                <p className="text-sm text-gray-500">
                  {activeItems.length} item{activeItems.length !== 1 ? 's' : ''} selected ·{' '}
                  {proposal.extractedData.filter((m) => m.action === 'skip').length} skipped
                </p>
                {hasUnsetFabrication && (
                  <p className="text-xs text-amber-600">
                    Assign fabrication category to all materials before syncing.
                  </p>
                )}
              </div>
              <button
                onClick={handleSync}
                disabled={!canSync || !selectedSupplierId}
                className={cn(
                  'flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all',
                  canSync && selectedSupplierId
                    ? 'bg-gray-900 text-white hover:bg-gray-800 shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed',
                )}
              >
                <Database className="h-4 w-4" />
                Sync {activeItems.length} Item{activeItems.length !== 1 ? 's' : ''} to Database
              </button>
            </div>
          </div>

          {renderClarificationDrawer()}
        </div>
      </div>
    );
  }

  function renderSyncing() {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4">
        <div className="h-10 w-10 rounded-full border-4 border-primary-200 border-t-primary-600 animate-spin" />
        <p className="text-sm font-medium text-gray-600">Writing to database…</p>
      </div>
    );
  }

  function renderDone() {
    if (!syncResult) return null;
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-6">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-50 ring-1 ring-emerald-100">
          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
        </div>
        <div className="text-center">
          <h2 className="text-xl font-semibold text-gray-900">Import complete</h2>
          <p className="mt-1 text-sm text-gray-500">Materials have been synced to your library.</p>
        </div>
        <div className="flex gap-6">
          {[
            { label: 'Created', value: syncResult.created, color: 'text-emerald-600' },
            { label: 'Updated', value: syncResult.updated, color: 'text-blue-600' },
            { label: 'Skipped', value: syncResult.skipped, color: 'text-gray-500' },
          ].map((stat) => (
            <div key={stat.label} className="text-center">
              <p className={cn('text-3xl font-bold tabular-nums', stat.color)}>{stat.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
        <div className="flex gap-3">
          <a
            href="/materials"
            className="rounded-xl bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-800"
          >
            View Materials Library
          </a>
          <button
            onClick={() => {
              setPhase('upload');
              setProposal(null);
              setSyncResult(null);
            }}
            className="rounded-xl border border-gray-300 px-5 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Import Another
          </button>
        </div>
      </div>
    );
  }

  // ── Layout ──────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Toast */}
      {toast && (
        <div
          className={cn(
            'fixed top-4 right-4 z-50 flex items-center gap-2 rounded-xl px-4 py-3 shadow-lg text-sm font-medium',
            toast.type === 'success'
              ? 'bg-gray-900 text-white'
              : 'bg-red-600 text-white',
          )}
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-red-200" />
          )}
          {toast.message}
        </div>
      )}

      <div className="space-y-6">
        {phase === 'upload' && renderUpload()}
        {phase === 'parsing' && renderParsing()}
        {phase === 'staging' && renderStaging()}
        {phase === 'syncing' && renderSyncing()}
        {phase === 'done' && renderDone()}
      </div>
    </>
  );
}
