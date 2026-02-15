'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useUnits } from '@/lib/contexts/UnitContext';
import { formatAreaFromSqm } from '@/lib/utils/units';
import { formatCurrency, formatDate } from '@/lib/utils';
import QuoteLayout from '@/components/quotes/QuoteLayout';
import type { QuoteMode, QuoteTab } from '@/components/quotes/QuoteLayout';

// Builder sub-components
import PieceList from './builder/components/PieceList';
import RoomGrouping from './builder/components/RoomGrouping';
import PieceForm from './builder/components/PieceForm';
import PricingSummary from './builder/components/PricingSummary';
import QuoteActions from './builder/components/QuoteActions';
import DrawingImport from './builder/components/DrawingImport';
import { DrawingReferencePanel } from './builder/components/DrawingReferencePanel';
import DeliveryTemplatingCard from './builder/components/DeliveryTemplatingCard';
import { OptimizationDisplay } from './builder/components/OptimizationDisplay';
import MachineDetailsPanel from './builder/components/MachineDetailsPanel';
import { CutoutType, PieceCutout } from './builder/components/CutoutSelector';
import VersionHistoryTab from '@/components/quotes/VersionHistoryTab';
import type { CalculationResult } from '@/lib/types/pricing';

// Expandable cost breakdown components
import PieceRow from '@/components/quotes/PieceRow';
import QuoteLevelCostSections from '@/components/quotes/QuoteLevelCostSections';
import MaterialCostSection from '@/components/quotes/MaterialCostSection';

// View-mode components
import { DimensionsDisplay, AreaDisplay } from '@/components/ui/DimensionDisplay';
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import ManufacturingExportButton from './components/ManufacturingExportButton';
import QuoteViewTracker from './components/QuoteViewTracker';
import QuoteSignatureSection from './components/QuoteSignatureSection';
import SaveAsTemplateButton from './components/SaveAsTemplateButton';

// ─── Shared interfaces (from builder) ───────────────────────────────────────

interface MachineOption {
  id: string;
  name: string;
  kerfWidthMm: number;
  isDefault: boolean;
}

interface MachineOperationDefault {
  id: string;
  operationType: string;
  machineId: string;
  machine: {
    id: string;
    name: string;
    kerfWidthMm: number;
  };
}

interface QuotePiece {
  id: number;
  name: string;
  description: string | null;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  materialName: string | null;
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  cutouts: PieceCutout[];
  sortOrder: number;
  totalCost: number;
  machineProfileId: string | null;
  quote_rooms: {
    id: number;
    name: string;
  };
}

interface QuoteRoom {
  id: number;
  name: string;
  sortOrder: number;
  pieces: QuotePiece[];
}

interface EditQuote {
  id: number;
  quote_number: string;
  project_name: string | null;
  project_address: string | null;
  notes: string | null;
  status: string;
  subtotal: number;
  total: number;
  customer: {
    id: number;
    name: string;
    company: string | null;
    client_types?: { id: string; name: string } | null;
    client_tiers?: { id: string; name: string } | null;
  } | null;
  price_books?: { id: string; name: string } | null;
  rooms: QuoteRoom[];
}

interface CustomerOption {
  id: number;
  name: string;
  company: string | null;
  client_types?: { id: string; name: string } | null;
  client_tiers?: { id: string; name: string } | null;
}

interface Material {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
}

interface EdgeType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  baseRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface ThicknessOption {
  id: string;
  name: string;
  value: number;
  multiplier: number;
  isDefault: boolean;
  isActive: boolean;
  sortOrder: number;
}

// ─── Server data interfaces (view mode) ─────────────────────────────────────

interface AnalysisRoom {
  name: string;
  pieces: Array<{
    pieceNumber?: number;
    name: string;
    length: number;
    width: number;
    thickness: number;
    confidence: number;
  }>;
}

interface RawResults {
  drawingType?: string;
  metadata?: {
    jobNumber?: string | null;
    defaultThickness?: number;
  };
  rooms?: AnalysisRoom[];
  warnings?: string[];
}

export interface ServerQuoteData {
  id: number;
  quote_number: string;
  project_name: string | null;
  project_address: string | null;
  status: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  calculation_breakdown: CalculationResult | null;
  created_at: string;
  valid_until: string | null;
  customers: {
    id: number;
    name: string;
    company: string | null;
  } | null;
  quote_rooms: Array<{
    id: number;
    name: string;
    quote_pieces: Array<{
      id: number;
      description: string | null;
      name: string | null;
      length_mm: number;
      width_mm: number;
      thickness_mm: number;
      area_sqm: number;
      material_name: string | null;
      material_cost: number;
      features_cost: number;
      total_cost: number;
      piece_features: Array<{
        id: number;
        name: string;
        quantity: number;
      }>;
      materials: { name: string } | null;
    }>;
  }>;
  quote_drawing_analyses: {
    id: number;
    filename: string;
    analyzed_at: string;
    drawing_type: string;
    raw_results: RawResults | null;
  } | null;
  quote_signatures: {
    id: number;
    signature_type: string;
    signed_at: string;
    signer_name: string;
    signer_email: string;
    ip_address: string | null;
    user: {
      name: string | null;
      email: string;
    } | null;
  } | null;
}

// ─── Props ──────────────────────────────────────────────────────────────────

interface QuoteDetailClientProps {
  quoteId: number;
  initialMode: QuoteMode;
  serverData: ServerQuoteData;
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function QuoteDetailClient({
  quoteId,
  initialMode,
  serverData,
}: QuoteDetailClientProps) {
  const router = useRouter();
  const { unitSystem } = useUnits();
  const quoteIdStr = String(quoteId);

  // ── Layout state ──────────────────────────────────────────────────────────
  const [mode, setMode] = useState<QuoteMode>(initialMode);
  const [activeTab, setActiveTab] = useState<QuoteTab>('pieces');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── Edit-mode state (from builder) ────────────────────────────────────────
  const [editQuote, setEditQuote] = useState<EditQuote | null>(null);
  const [pieces, setPieces] = useState<QuotePiece[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [edgeTypes, setEdgeTypes] = useState<EdgeType[]>([]);
  const [cutoutTypes, setCutoutTypes] = useState<CutoutType[]>([]);
  const [thicknessOptions, setThicknessOptions] = useState<ThicknessOption[]>([]);
  const [rooms, setRooms] = useState<QuoteRoom[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  const [isAddingPiece, setIsAddingPiece] = useState(false);
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'rooms'>('list');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const calculationRef = useRef<CalculationResult | null>(null);
  const [showDrawingImport, setShowDrawingImport] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [drawingsRefreshKey, setDrawingsRefreshKey] = useState(0);
  const [optimizationRefreshKey, setOptimizationRefreshKey] = useState(0);
  const [discountDisplayMode, setDiscountDisplayMode] = useState<'ITEMIZED' | 'TOTAL_ONLY'>('ITEMIZED');
  const { hasUnsavedChanges, markAsChanged, markAsSaved } = useUnsavedChanges();

  // Customer dropdown state
  const [customersList, setCustomersList] = useState<CustomerOption[]>([]);
  const [customerSearch, setCustomerSearch] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const customerDropdownRef = useRef<HTMLDivElement>(null);

  // Machine Profile state
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [defaultMachineId, setDefaultMachineId] = useState<string | null>(null);
  const [machineOperationDefaults, setMachineOperationDefaults] = useState<MachineOperationDefault[]>([]);
  const [machineOverrides, setMachineOverrides] = useState<Record<string, string>>({});

  // Auto re-optimisation ref
  const reOptimizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editDataLoaded = useRef(false);

  // ── Mode change handler ───────────────────────────────────────────────────

  const handleModeChange = useCallback((newMode: QuoteMode) => {
    setMode(newMode);
    // Update URL without full page reload
    const url = new URL(window.location.href);
    if (newMode === 'edit') {
      url.searchParams.set('mode', 'edit');
    } else {
      url.searchParams.delete('mode');
    }
    window.history.replaceState({}, '', url.toString());

    // Default sidebar state by mode
    if (newMode === 'view') {
      setSidebarOpen(false);
      setSelectedPieceId(null);
      setIsAddingPiece(false);
    }
    // Edit mode sidebar opens when a piece is selected (handled elsewhere)
  }, []);

  // ── Edit-mode data fetching ───────────────────────────────────────────────

  const triggerRecalculate = useCallback(() => {
    setRefreshTrigger(n => n + 1);
  }, []);

  const handleCalculationUpdate = useCallback((result: CalculationResult | null) => {
    setCalculation(result);
    calculationRef.current = result;
  }, []);

  const flattenPieces = useCallback((quoteRooms: QuoteRoom[]): QuotePiece[] => {
    return quoteRooms.flatMap(room =>
      room.pieces.map(piece => ({
        ...piece,
        quote_rooms: { id: room.id, name: room.name },
      }))
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);

  const fetchQuote = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}`);
      if (!response.ok) throw new Error('Failed to fetch quote');
      const data = await response.json();
      setEditQuote(data);
      setRooms(data.rooms || []);
      setPieces(flattenPieces(data.rooms || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quote');
    }
  }, [quoteIdStr, flattenPieces]);

  const fetchMaterials = useCallback(async () => {
    try {
      const response = await fetch('/api/materials');
      if (!response.ok) throw new Error('Failed to fetch materials');
      const data = await response.json();
      setMaterials(data);
    } catch (err) {
      console.error('Error fetching materials:', err);
    }
  }, []);

  const fetchEdgeTypes = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/edge-types');
      if (!response.ok) throw new Error('Failed to fetch edge types');
      const data = await response.json();
      setEdgeTypes(data.filter((e: EdgeType) => e.isActive !== false));
    } catch (err) {
      console.error('Error fetching edge types:', err);
    }
  }, []);

  const fetchCutoutTypes = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/cutout-types');
      if (!response.ok) throw new Error('Failed to fetch cutout types');
      const data = await response.json();
      setCutoutTypes(data.filter((c: CutoutType) => c.isActive !== false));
    } catch (err) {
      console.error('Error fetching cutout types:', err);
    }
  }, []);

  const fetchThicknessOptions = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/thickness-options');
      if (!response.ok) throw new Error('Failed to fetch thickness options');
      const data = await response.json();
      setThicknessOptions(data.filter((t: ThicknessOption) => t.isActive !== false));
    } catch (err) {
      console.error('Error fetching thickness options:', err);
    }
  }, []);

  const fetchMachines = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/machines');
      if (!response.ok) throw new Error('Failed to fetch machines');
      const data = await response.json();
      const activeMachines = data.filter((m: any) => m.isActive !== false);
      setMachines(activeMachines);
      const defaultMachine = activeMachines.find((m: any) => m.isDefault);
      if (defaultMachine) {
        setDefaultMachineId(defaultMachine.id);
      } else if (activeMachines.length > 0) {
        setDefaultMachineId(activeMachines[0].id);
      }
    } catch (err) {
      console.error('Error fetching machines:', err);
    }
  }, []);

  const fetchMachineOperationDefaults = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/machine-defaults');
      if (!response.ok) throw new Error('Failed to fetch machine defaults');
      const data = await response.json();
      setMachineOperationDefaults(data);
    } catch (err) {
      console.error('Error fetching machine operation defaults:', err);
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const response = await fetch('/api/customers');
      if (!response.ok) throw new Error('Failed to fetch customers');
      const data = await response.json();
      setCustomersList(data);
    } catch (err) {
      console.error('Error fetching customers:', err);
    }
  }, []);

  // Get effective kerf width
  const getEffectiveKerfWidth = useCallback((): number => {
    const overrideMachineId = machineOverrides['INITIAL_CUT'];
    if (overrideMachineId) {
      const overrideMachine = machines.find(m => m.id === overrideMachineId);
      if (overrideMachine) return overrideMachine.kerfWidthMm;
    }
    const initialCutDefault = machineOperationDefaults.find(d => d.operationType === 'INITIAL_CUT');
    if (initialCutDefault) return initialCutDefault.machine.kerfWidthMm;
    const defaultMachine = machines.find(m => m.id === defaultMachineId);
    return defaultMachine?.kerfWidthMm ?? 8;
  }, [machineOverrides, machineOperationDefaults, machines, defaultMachineId]);

  // Debounced auto re-optimisation
  const autoReOptimize = useCallback(() => {
    if (reOptimizeTimeoutRef.current) {
      clearTimeout(reOptimizeTimeoutRef.current);
    }
    reOptimizeTimeoutRef.current = setTimeout(async () => {
      try {
        const response = await fetch(`/api/quotes/${quoteIdStr}/optimize`);
        if (!response.ok) return;
        const saved = await response.json();
        if (!saved || !saved.placements) return;
        await fetch(`/api/quotes/${quoteIdStr}/optimize`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            slabWidth: saved.slabWidth || 3000,
            slabHeight: saved.slabHeight || 1400,
            kerfWidth: getEffectiveKerfWidth(),
            allowRotation: true,
          }),
        });
        setOptimizationRefreshKey(n => n + 1);
      } catch (err) {
        console.error('Auto re-optimisation failed:', err);
      }
    }, 1000);
  }, [quoteIdStr, getEffectiveKerfWidth]);

  // Machine override handler
  const handleMachineOverride = useCallback((operationType: string, machineId: string) => {
    setMachineOverrides(prev => ({ ...prev, [operationType]: machineId }));
    triggerRecalculate();
    autoReOptimize();
  }, [triggerRecalculate, autoReOptimize]);

  // Load edit-mode data when switching to edit or on initial mount in edit mode
  useEffect(() => {
    if (mode === 'edit' && !editDataLoaded.current) {
      editDataLoaded.current = true;
      setEditLoading(true);
      Promise.all([
        fetchQuote(),
        fetchMaterials(),
        fetchEdgeTypes(),
        fetchCutoutTypes(),
        fetchThicknessOptions(),
        fetchMachines(),
        fetchMachineOperationDefaults(),
        fetchCustomers(),
      ]).then(() => setEditLoading(false));
    }
  }, [mode, fetchQuote, fetchMaterials, fetchEdgeTypes, fetchCutoutTypes, fetchThicknessOptions, fetchMachines, fetchMachineOperationDefaults, fetchCustomers]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (reOptimizeTimeoutRef.current) {
        clearTimeout(reOptimizeTimeoutRef.current);
      }
    };
  }, []);

  // ── Auto-calculate pricing independent of sidebar visibility ──────────────
  // PricingSummary (in sidebar) handles calculation when the sidebar is open,
  // but the sidebar starts collapsed. This ensures pricing runs regardless.
  useEffect(() => {
    if (mode !== 'edit' || editLoading || !editDataLoaded.current) return;
    // When sidebar is open, PricingSummary handles calculation
    if (sidebarOpen) return;

    let cancelled = false;
    const calculate = async () => {
      try {
        const res = await fetch(`/api/quotes/${quoteIdStr}/calculate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (!cancelled && res.ok) {
          const data = await res.json();
          handleCalculationUpdate(data);
        }
      } catch (err) {
        console.error('Auto-calculation failed:', err);
      }
    };

    calculate();
    return () => { cancelled = true; };
  }, [mode, editLoading, sidebarOpen, quoteIdStr, refreshTrigger, handleCalculationUpdate]);

  // ── Customer dropdown: close on click outside ────────────────────────────
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerDropdownRef.current && !customerDropdownRef.current.contains(e.target as Node)) {
        setShowCustomerDropdown(false);
        // Reset search text to selected customer name
        if (editQuote?.customer) {
          setCustomerSearch(
            editQuote.customer.company
              ? `${editQuote.customer.name} (${editQuote.customer.company})`
              : editQuote.customer.name
          );
        } else {
          setCustomerSearch('');
        }
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [editQuote?.customer]);

  // Initialise customer search text when editQuote loads
  useEffect(() => {
    if (editQuote?.customer) {
      setCustomerSearch(
        editQuote.customer.company
          ? `${editQuote.customer.name} (${editQuote.customer.company})`
          : editQuote.customer.name
      );
    } else {
      setCustomerSearch('');
    }
  }, [editQuote?.customer]);

  // ── Metadata save handler ───────────────────────────────────────────────
  const handleMetadataSave = useCallback(async (
    updates: Record<string, unknown>,
    refetchAfter = false,
  ) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) throw new Error('Failed to update quote');
      if (refetchAfter) {
        await fetchQuote();
      }
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update quote');
      await fetchQuote(); // Revert on error
    } finally {
      setSaving(false);
    }
  }, [quoteIdStr, fetchQuote, markAsChanged]);

  // ── Customer selection handler ──────────────────────────────────────────
  const handleCustomerSelect = useCallback(async (customer: CustomerOption | null) => {
    setShowCustomerDropdown(false);
    if (customer) {
      setCustomerSearch(
        customer.company
          ? `${customer.name} (${customer.company})`
          : customer.name
      );
    } else {
      setCustomerSearch('');
    }
    // Optimistic update
    setEditQuote(prev => {
      if (!prev) return null;
      return {
        ...prev,
        customer: customer
          ? {
              id: customer.id,
              name: customer.name,
              company: customer.company,
              client_types: customer.client_types,
              client_tiers: customer.client_tiers,
            }
          : null,
      };
    });
    await handleMetadataSave({ customerId: customer?.id ?? null }, true);
  }, [handleMetadataSave]);

  // ── Edit-mode handlers ────────────────────────────────────────────────────

  const handleSelectPiece = (pieceId: number) => {
    setIsAddingPiece(false);
    setSelectedPieceId(pieceId === selectedPieceId ? null : pieceId);
    setSidebarOpen(true);
  };

  const handleAddPiece = () => {
    setSelectedPieceId(null);
    setIsAddingPiece(true);
    setSidebarOpen(true);
  };

  const handleCancelForm = () => {
    setSelectedPieceId(null);
    setIsAddingPiece(false);
  };

  const handlePieceUpdate = useCallback(async (pieceId: number, updates: Partial<QuotePiece>) => {
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update piece');
      }
      setPieces(prev => prev.map(p =>
        p.id === pieceId ? { ...p, ...updates } : p
      ));
      triggerRecalculate();
      autoReOptimize();
      markAsChanged();
    } catch (err) {
      console.error('Failed to update piece:', err);
      await fetchQuote();
    }
  }, [quoteIdStr, triggerRecalculate, autoReOptimize, markAsChanged, fetchQuote]);

  const handleSavePiece = async (pieceData: Partial<QuotePiece>, roomName: string) => {
    setSaving(true);
    try {
      const isNew = !selectedPieceId;
      const url = isNew
        ? `/api/quotes/${quoteIdStr}/pieces`
        : `/api/quotes/${quoteIdStr}/pieces/${selectedPieceId}`;
      const method = isNew ? 'POST' : 'PUT';
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...pieceData, roomName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save piece');
      }
      await fetchQuote();
      setSelectedPieceId(null);
      setIsAddingPiece(false);
      triggerRecalculate();
      autoReOptimize();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save piece');
    } finally {
      setSaving(false);
    }
  };

  const handleInlineSavePiece = useCallback(async (pieceId: number, data: Record<string, unknown>, roomName: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, roomName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save piece');
      }
      await fetchQuote();
      triggerRecalculate();
      autoReOptimize();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save piece');
    } finally {
      setSaving(false);
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate, autoReOptimize, markAsChanged]);

  const handleDeletePiece = async (pieceId: number) => {
    if (!confirm('Are you sure you want to delete this piece?')) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete piece');
      await fetchQuote();
      if (selectedPieceId === pieceId) setSelectedPieceId(null);
      triggerRecalculate();
      autoReOptimize();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete piece');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicatePiece = async (pieceId: number) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}/duplicate`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to duplicate piece');
      }
      const newPiece = await response.json();
      await fetchQuote();
      setSelectedPieceId(newPiece.id);
      setIsAddingPiece(false);
      triggerRecalculate();
      autoReOptimize();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate piece');
    } finally {
      setSaving(false);
    }
  };

  const handleReorder = async (reorderedPieces: { id: number; sortOrder: number }[]) => {
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieces: reorderedPieces }),
      });
      if (!response.ok) throw new Error('Failed to reorder pieces');
      setPieces(prev => {
        const updated = [...prev];
        reorderedPieces.forEach(({ id, sortOrder }) => {
          const piece = updated.find(p => p.id === id);
          if (piece) piece.sortOrder = sortOrder;
        });
        return updated.sort((a, b) => a.sortOrder - b.sortOrder);
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reorder pieces');
      await fetchQuote();
    }
  };

  const handleSaveQuote = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveCalculation: true,
          calculation: calculationRef.current,
        }),
      });
      if (!response.ok) throw new Error('Failed to save quote');
      await fetchQuote();
      markAsSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!response.ok) throw new Error('Failed to update status');
      await fetchQuote();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  const handleImportComplete = useCallback(async (count: number) => {
    setShowDrawingImport(false);
    await fetchQuote();
    triggerRecalculate();
    autoReOptimize();
    markAsChanged();
    setImportSuccessMessage(`Imported ${count} piece${count !== 1 ? 's' : ''} from drawing`);
    setTimeout(() => setImportSuccessMessage(null), 5000);
  }, [fetchQuote, triggerRecalculate, autoReOptimize, markAsChanged]);

  const handleDrawingsSaved = useCallback(() => {
    setDrawingsRefreshKey(n => n + 1);
  }, []);

  const getKerfForPiece = useCallback((piece: QuotePiece): number => {
    if (piece.machineProfileId) {
      const machine = machines.find(m => m.id === piece.machineProfileId);
      if (machine) return machine.kerfWidthMm;
    }
    const defaultMachine = machines.find(m => m.id === defaultMachineId);
    return defaultMachine?.kerfWidthMm ?? 8;
  }, [machines, defaultMachineId]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedPiece = selectedPieceId
    ? pieces.find(p => p.id === selectedPieceId) ?? null
    : null;

  const roomNames: string[] = Array.from(new Set(rooms.map(r => r.name)));

  // Inline edit data bundle for PieceRow inline editor
  const inlineEditData = {
    materials,
    edgeTypes,
    cutoutTypes,
    thicknessOptions,
    roomNames,
  };

  // Filtered customers for dropdown
  const filteredCustomers = customersList.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.name.toLowerCase().includes(search) ||
      (c.company && c.company.toLowerCase().includes(search))
    );
  });

  // Resolve display values for the header — use edit data when available
  const displayQuoteNumber = editQuote?.quote_number ?? serverData.quote_number;
  const displayProjectName = editQuote?.project_name ?? serverData.project_name;
  const displayStatus = editQuote?.status ?? serverData.status;
  const displayCustomerName = mode === 'edit'
    ? (editQuote?.customer?.company
        ? `${editQuote.customer.name} (${editQuote.customer.company})`
        : editQuote?.customer?.name ?? null)
    : (serverData.customers?.company
        ? `${serverData.customers.name} (${serverData.customers.company})`
        : serverData.customers?.name ?? null);

  // Stored calculation breakdown for view mode
  const viewCalculation: CalculationResult | null = serverData.calculation_breakdown ?? null;

  // Calculated total for header
  const headerTotal = calculation
    ? calculation.total * 1.1  // Include GST
    : null;

  // ── Metadata section (shown between header and action buttons) ───────────

  const renderMetadataSection = () => {
    if (mode === 'edit' && editQuote) {
      return (
        <div className="card p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Customer — searchable dropdown */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
              <div className="relative" ref={customerDropdownRef}>
                <div className="relative">
                  <input
                    type="text"
                    value={customerSearch}
                    onChange={(e) => {
                      setCustomerSearch(e.target.value);
                      setShowCustomerDropdown(true);
                    }}
                    onFocus={() => setShowCustomerDropdown(true)}
                    placeholder="Select customer"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                  {editQuote.customer && (
                    <button
                      type="button"
                      onClick={() => handleCustomerSelect(null)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-lg leading-none"
                      title="Clear customer"
                    >
                      &times;
                    </button>
                  )}
                </div>
                {showCustomerDropdown && (
                  <div className="absolute z-20 mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-48 overflow-auto">
                    {filteredCustomers.length > 0 ? (
                      filteredCustomers.map(c => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleCustomerSelect(c)}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-100 border-b border-gray-50 ${
                            editQuote.customer?.id === c.id ? 'bg-primary-50 text-primary-700' : ''
                          }`}
                        >
                          <span className="font-medium">{c.name}</span>
                          {c.company && <span className="text-gray-500 ml-1">({c.company})</span>}
                        </button>
                      ))
                    ) : (
                      <div className="px-3 py-2 text-sm text-gray-500">No customers found</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Project Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name</label>
              <input
                type="text"
                value={editQuote.project_name || ''}
                onChange={(e) =>
                  setEditQuote(prev => prev ? { ...prev, project_name: e.target.value } : null)
                }
                onBlur={() => handleMetadataSave({ projectName: editQuote.project_name })}
                placeholder="Enter project name"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
              />
            </div>
          </div>

          {/* Project Address — full width */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Project Address</label>
            <input
              type="text"
              value={editQuote.project_address || ''}
              onChange={(e) =>
                setEditQuote(prev => prev ? { ...prev, project_address: e.target.value } : null)
              }
              onBlur={() => handleMetadataSave({ projectAddress: editQuote.project_address })}
              placeholder="Enter project address"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
            />
          </div>

          {/* Notes */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={editQuote.notes || ''}
              onChange={(e) =>
                setEditQuote(prev => prev ? { ...prev, notes: e.target.value } : null)
              }
              onBlur={() => handleMetadataSave({ notes: editQuote.notes })}
              placeholder="Enter notes (visible on quote)"
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500 resize-none"
            />
          </div>
        </div>
      );
    }

    // View mode — display metadata as read-only text
    return (
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500">Customer</p>
            <p className="font-medium">{serverData.customers?.name || '-'}</p>
            {serverData.customers?.company && (
              <p className="text-sm text-gray-500">{serverData.customers.company}</p>
            )}
          </div>
          <div>
            <p className="text-sm text-gray-500">Project Name</p>
            <p className="font-medium">{serverData.project_name || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Project Address</p>
            <p className="font-medium">{serverData.project_address || '-'}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500">Created</p>
            <p className="font-medium">{formatDate(serverData.created_at)}</p>
          </div>
        </div>
        {serverData.notes && (
          <div className="mt-3">
            <p className="text-sm text-gray-500">Notes</p>
            <p className="text-gray-600 text-sm whitespace-pre-wrap">{serverData.notes}</p>
          </div>
        )}
      </div>
    );
  };

  // ── View-mode action buttons ──────────────────────────────────────────────

  const viewActionButtons = (
    <>
      <Link href={`/api/quotes/${quoteId}/pdf`} target="_blank" className="btn-secondary flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        Preview PDF
      </Link>
      {['locked', 'accepted'].includes(serverData.status.toLowerCase()) && (
        <ManufacturingExportButton
          quoteId={serverData.id}
          quoteNumber={serverData.quote_number}
        />
      )}
      <DeleteQuoteButton quoteId={serverData.id} />
    </>
  );

  // ── Edit-mode action buttons ──────────────────────────────────────────────

  const editActionButtons = editQuote ? (
    <QuoteActions
      quoteId={quoteIdStr}
      quoteStatus={editQuote.status}
      calculation={calculation}
      onSave={handleSaveQuote}
      onStatusChange={handleStatusChange}
      onOptimizationSaved={() => setOptimizationRefreshKey(n => n + 1)}
      saving={saving}
      kerfWidth={getEffectiveKerfWidth()}
    />
  ) : null;

  // ── View-mode content ─────────────────────────────────────────────────────

  const analysisResults = serverData.quote_drawing_analyses?.raw_results;

  const renderViewContent = () => {
    if (activeTab === 'history') {
      return (
        <div className="card">
          <VersionHistoryTab quoteId={quoteId} />
        </div>
      );
    }

    if (activeTab === 'optimiser') {
      return <OptimizationDisplay quoteId={quoteIdStr} refreshKey={0} />;
    }

    // Pieces & Pricing tab (view mode)
    return (
      <div className="space-y-6">
        {/* View Tracking */}
        <QuoteViewTracker quoteId={serverData.id} showHistory={true} />

        {/* Signature Section */}
        <QuoteSignatureSection
          quoteId={serverData.id}
          quoteNumber={serverData.quote_number}
          customerName={serverData.customers?.company || serverData.customers?.name || 'Customer'}
          totalAmount={formatCurrency(serverData.total)}
          status={serverData.status}
          signature={serverData.quote_signatures ? {
            id: serverData.quote_signatures.id,
            signatureType: serverData.quote_signatures.signature_type,
            signedAt: serverData.quote_signatures.signed_at,
            signerName: serverData.quote_signatures.signer_name,
            signerEmail: serverData.quote_signatures.signer_email,
            ipAddress: serverData.quote_signatures.ip_address,
            user: serverData.quote_signatures.user ? {
              name: serverData.quote_signatures.user.name,
              email: serverData.quote_signatures.user.email,
            } : null,
          } : null}
        />

        {/* Drawing Analysis Section */}
        {serverData.quote_drawing_analyses && (
          <div className="card">
            <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <h3 className="text-lg font-semibold">Drawing Analysis</h3>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-sm text-gray-500">
                  Analysed {formatDate(serverData.quote_drawing_analyses.analyzed_at)}
                </span>
                <SaveAsTemplateButton
                  analysisId={serverData.quote_drawing_analyses.id}
                  defaultName={serverData.project_name || undefined}
                />
              </div>
            </div>
            <div className="p-6">
              {/* Analysis Metadata */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div>
                  <span className="text-xs text-gray-500 block">Filename</span>
                  <span className="font-medium text-gray-900 truncate block" title={serverData.quote_drawing_analyses.filename}>
                    {serverData.quote_drawing_analyses.filename}
                  </span>
                </div>
                <div>
                  <span className="text-xs text-gray-500 block">Drawing Type</span>
                  <span className="font-medium text-gray-900">
                    {serverData.quote_drawing_analyses.drawing_type.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())}
                  </span>
                </div>
                {analysisResults?.metadata?.jobNumber && (
                  <div>
                    <span className="text-xs text-gray-500 block">Job Number</span>
                    <span className="font-medium text-gray-900">{analysisResults.metadata.jobNumber}</span>
                  </div>
                )}
                {analysisResults?.metadata?.defaultThickness && (
                  <div>
                    <span className="text-xs text-gray-500 block">Default Thickness</span>
                    <span className="font-medium text-gray-900">{analysisResults.metadata.defaultThickness}mm</span>
                  </div>
                )}
              </div>

              {/* Warnings */}
              {analysisResults?.warnings && analysisResults.warnings.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                  <div className="flex items-start gap-2">
                    <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    <div>
                      <strong>Analysis Warnings:</strong>
                      <ul className="list-disc list-inside mt-1">
                        {analysisResults.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Detected pieces */}
              {analysisResults?.rooms && analysisResults.rooms.length > 0 && (
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Originally Detected Pieces</h4>
                  <div className="space-y-3">
                    {analysisResults.rooms.map((room, roomIndex) => (
                      <div key={roomIndex} className="border border-gray-200 rounded-lg p-3">
                        <h5 className="text-sm font-medium text-gray-600 mb-2">
                          {room.name} ({room.pieces.length} piece{room.pieces.length !== 1 ? 's' : ''})
                        </h5>
                        <div className="space-y-1">
                          {room.pieces.map((piece, pieceIndex) => (
                            <div
                              key={pieceIndex}
                              className="flex items-center justify-between text-sm bg-gray-50 rounded px-3 py-2"
                            >
                              <span className="text-gray-700">
                                {piece.pieceNumber ? `#${piece.pieceNumber} ` : ''}{piece.name}
                              </span>
                              <span className="text-gray-500">
                                {piece.length} × {piece.width}mm
                                <span
                                  className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                                    piece.confidence >= 0.7
                                      ? 'bg-green-100 text-green-700'
                                      : piece.confidence >= 0.5
                                      ? 'bg-yellow-100 text-yellow-700'
                                      : 'bg-red-100 text-red-700'
                                  }`}
                                >
                                  {Math.round(piece.confidence * 100)}%
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Rooms and Pieces */}
        <div className="space-y-4">
          {serverData.quote_rooms.map((room) => (
            <div key={room.id} className="card">
              <div className="p-4 border-b border-gray-200 bg-gray-50 rounded-t-xl">
                <h3 className="text-lg font-semibold">{room.name}</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="table-header">Description</th>
                      <th className="table-header">Dimensions</th>
                      <th className="table-header">Material</th>
                      <th className="table-header">Features</th>
                      <th className="table-header text-right">Fabrication</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {room.quote_pieces.map((piece) => {
                      // Prefer live calculation breakdown over stale DB per-piece cost
                      const viewPieceBreakdown = viewCalculation?.breakdown?.pieces?.find(
                        (pb: import('@/lib/types/pricing').PiecePricingBreakdown) => pb.pieceId === piece.id
                      );
                      const fabricationCost = viewPieceBreakdown
                        ? viewPieceBreakdown.pieceTotal
                        : Number(piece.features_cost);
                      return (
                        <tr key={piece.id}>
                          <td className="table-cell font-medium">
                            {piece.description || piece.name || 'Unnamed piece'}
                          </td>
                          <td className="table-cell">
                            <DimensionsDisplay lengthMm={piece.length_mm} widthMm={piece.width_mm} thicknessMm={piece.thickness_mm} />
                            <br />
                            <span className="text-xs text-gray-500">
                              (<AreaDisplay sqm={Number(piece.area_sqm)} />)
                            </span>
                          </td>
                          <td className="table-cell">{piece.materials?.name || piece.material_name || '-'}</td>
                          <td className="table-cell">
                            {piece.piece_features.length > 0 ? (
                              <ul className="text-sm">
                                {piece.piece_features.map((f) => (
                                  <li key={f.id}>
                                    {f.quantity}× {f.name}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td className="table-cell text-right font-medium">
                            {formatCurrency(fabricationCost)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>

        {/* Expandable Cost Breakdown (view mode) */}
        {viewCalculation && viewCalculation.breakdown?.pieces && viewCalculation.breakdown.pieces.length > 0 && (
          <div className="card">
            <div className="p-4 border-b border-gray-200">
              <h3 className="text-lg font-semibold">Cost Breakdown</h3>
            </div>
            <div className="p-4 space-y-2">
              {(viewCalculation.breakdown.pieces as import('@/lib/types/pricing').PiecePricingBreakdown[]).map((pb) => (
                <PieceRow
                  key={pb.pieceId}
                  piece={{
                    id: pb.pieceId,
                    name: pb.pieceName,
                    lengthMm: pb.dimensions.lengthMm,
                    widthMm: pb.dimensions.widthMm,
                    thicknessMm: pb.dimensions.thicknessMm,
                    materialName: null,
                    edgeTop: null,
                    edgeBottom: null,
                    edgeLeft: null,
                    edgeRight: null,
                  }}
                  breakdown={pb}
                  mode="view"
                />
              ))}
            </div>
          </div>
        )}

        {/* Material Cost Section (view mode — quote level) */}
        {viewCalculation?.breakdown?.materials && (
          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
              Material
            </h3>
            <MaterialCostSection
              materials={viewCalculation.breakdown.materials}
              pieceCount={serverData.quote_rooms.reduce((sum, r) => sum + r.quote_pieces.length, 0)}
            />
          </div>
        )}

        {/* Quote-Level Cost Sections (view mode) */}
        {viewCalculation && (
          <div className="card p-4">
            <QuoteLevelCostSections
              calculation={viewCalculation}
              mode="view"
            />
          </div>
        )}

      </div>
    );
  };

  // ── Edit-mode content ─────────────────────────────────────────────────────

  const renderEditContent = () => {
    if (editLoading) {
      return (
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      );
    }

    if (!editQuote) {
      return (
        <div className="text-center py-12">
          <p className="text-gray-600 mb-4">Failed to load quote data for editing</p>
        </div>
      );
    }

    if (activeTab === 'history') {
      return (
        <div className="card">
          <VersionHistoryTab quoteId={quoteId} />
        </div>
      );
    }

    if (activeTab === 'optimiser') {
      return <OptimizationDisplay quoteId={quoteIdStr} refreshKey={optimizationRefreshKey} />;
    }

    // Pieces & Pricing tab (edit mode)
    return (
      <div className="space-y-6">
        {/* Pieces Card */}
        <div className="card">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <h2 className="text-lg font-semibold">Pieces</h2>
              {/* View Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('list')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'list'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  List
                </button>
                <button
                  onClick={() => setViewMode('rooms')}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                    viewMode === 'rooms'
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  By Room
                </button>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowDrawingImport(true)}
                className="btn-secondary text-sm flex items-center gap-1"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Import Drawing
              </button>
              <button onClick={handleAddPiece} className="btn-primary text-sm">
                + Add Piece
              </button>
            </div>
          </div>
          {viewMode === 'list' ? (
            <PieceList
              pieces={pieces}
              selectedPieceId={selectedPieceId}
              onSelectPiece={handleSelectPiece}
              onDeletePiece={handleDeletePiece}
              onDuplicatePiece={handleDuplicatePiece}
              onReorder={handleReorder}
              onPieceUpdate={handlePieceUpdate}
              getKerfForPiece={getKerfForPiece}
              machines={machines}
              defaultMachineId={defaultMachineId}
              calculation={calculation}
              discountDisplayMode={discountDisplayMode}
              edgeTypes={edgeTypes}
            />
          ) : (
            <RoomGrouping
              pieces={pieces}
              selectedPieceId={selectedPieceId}
              onSelectPiece={handleSelectPiece}
              onDeletePiece={handleDeletePiece}
              onDuplicatePiece={handleDuplicatePiece}
            />
          )}
        </div>

        {/* Expandable Cost Breakdown per Piece */}
        {calculation?.breakdown?.pieces && calculation.breakdown.pieces.length > 0 && (
          <div className="card">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Cost Breakdown</h2>
            </div>
            <div className="p-4 space-y-2">
              {(calculation.breakdown.pieces as import('@/lib/types/pricing').PiecePricingBreakdown[]).map((pb) => {
                const matchedPiece = pieces.find(p => p.id === pb.pieceId);
                return (
                  <PieceRow
                    key={pb.pieceId}
                    piece={{
                      id: pb.pieceId,
                      name: pb.pieceName,
                      lengthMm: pb.dimensions.lengthMm,
                      widthMm: pb.dimensions.widthMm,
                      thicknessMm: pb.dimensions.thicknessMm,
                      materialName: matchedPiece?.materialName ?? null,
                      edgeTop: matchedPiece?.edgeTop ?? null,
                      edgeBottom: matchedPiece?.edgeBottom ?? null,
                      edgeLeft: matchedPiece?.edgeLeft ?? null,
                      edgeRight: matchedPiece?.edgeRight ?? null,
                    }}
                    breakdown={pb}
                    machines={machines}
                    machineOperationDefaults={machineOperationDefaults}
                    mode="edit"
                    onMachineChange={(pieceId, operationType, machineId) => {
                      handleMachineOverride(operationType, machineId);
                    }}
                    fullPiece={matchedPiece ? {
                      id: matchedPiece.id,
                      name: matchedPiece.name,
                      lengthMm: matchedPiece.lengthMm,
                      widthMm: matchedPiece.widthMm,
                      thicknessMm: matchedPiece.thicknessMm,
                      materialId: matchedPiece.materialId,
                      materialName: matchedPiece.materialName,
                      edgeTop: matchedPiece.edgeTop,
                      edgeBottom: matchedPiece.edgeBottom,
                      edgeLeft: matchedPiece.edgeLeft,
                      edgeRight: matchedPiece.edgeRight,
                      cutouts: matchedPiece.cutouts,
                      quote_rooms: matchedPiece.quote_rooms,
                    } : undefined}
                    editData={inlineEditData}
                    onSavePiece={handleInlineSavePiece}
                    savingPiece={saving}
                  />
                );
              })}
            </div>
          </div>
        )}

        {/* Material Cost Section (edit mode — quote level) */}
        {calculation?.breakdown?.materials && (
          <div className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
              Material
            </h3>
            <MaterialCostSection
              materials={calculation.breakdown.materials}
              pieceCount={pieces.length}
            />
          </div>
        )}

        {/* Quote-Level Cost Sections */}
        {calculation && (
          <div className="card p-4">
            <QuoteLevelCostSections
              calculation={calculation}
              mode="edit"
            />
          </div>
        )}
      </div>
    );
  };

  // ── Edit-mode sidebar content ─────────────────────────────────────────────

  const renderEditSidebar = () => {
    if (!editQuote) return null;

    return (
      <>
        {/* Drawing Reference Panel */}
        <DrawingReferencePanel quoteId={quoteIdStr} refreshKey={drawingsRefreshKey} />

        {/* Delivery & Templating Card */}
        <DeliveryTemplatingCard
          quoteId={quoteIdStr}
          initialProjectAddress={editQuote.project_name}
          onUpdate={triggerRecalculate}
        />

        {/* Machine Details Panel */}
        {machines.length > 0 && (
          <MachineDetailsPanel
            machines={machines}
            machineOperationDefaults={machineOperationDefaults}
            overrides={machineOverrides}
            onOverrideChange={handleMachineOverride}
          />
        )}

        {/* Piece Editor */}
        {(isAddingPiece || selectedPiece) ? (
          <div className="card">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">
                {isAddingPiece ? 'Add New Piece' : 'Edit Piece'}
              </h2>
            </div>
            <PieceForm
              piece={selectedPiece || undefined}
              materials={materials}
              edgeTypes={edgeTypes}
              cutoutTypes={cutoutTypes}
              thicknessOptions={thicknessOptions}
              roomNames={roomNames}
              machines={machines}
              defaultMachineId={defaultMachineId}
              onSave={handleSavePiece}
              onCancel={handleCancelForm}
              saving={saving}
            />
          </div>
        ) : (
          <div className="card p-6 text-center text-gray-500">
            <svg className="h-12 w-12 mx-auto mb-3 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <p className="font-medium">Select a piece to edit</p>
            <p className="text-sm mt-1">Click any piece to view and edit its details including edges</p>
          </div>
        )}

        {/* Pricing Summary */}
        <PricingSummary
          quoteId={quoteIdStr}
          refreshTrigger={refreshTrigger}
          customerName={editQuote.customer?.company || editQuote.customer?.name}
          customerTier={editQuote.customer?.client_tiers?.name}
          customerType={editQuote.customer?.client_types?.name}
          priceBookName={editQuote.price_books?.name}
          onCalculationComplete={handleCalculationUpdate}
          discountDisplayMode={discountDisplayMode}
          onDiscountDisplayModeChange={setDiscountDisplayMode}
        />

        {/* Piece Stats */}
        <div className="card p-4">
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Piece Statistics</h4>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Total Pieces:</span>
              <span className="font-medium">{pieces.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Area:</span>
              <span className="font-medium">
                {formatAreaFromSqm(pieces.reduce((sum, p) => sum + (p.lengthMm * p.widthMm) / 1_000_000, 0), unitSystem)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Rooms:</span>
              <span className="font-medium">{rooms.length}</span>
            </div>
          </div>
        </div>
      </>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between mb-4">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-700 hover:text-red-900">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Import Success Toast */}
      {importSuccessMessage && (
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between mb-4">
          <span className="flex items-center gap-2">
            <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
            </svg>
            {importSuccessMessage}
          </span>
          <button onClick={() => setImportSuccessMessage(null)} className="text-green-700 hover:text-green-900">
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      <QuoteLayout
        quoteNumber={displayQuoteNumber}
        projectName={displayProjectName}
        status={displayStatus}
        customerName={displayCustomerName}
        mode={mode}
        onModeChange={handleModeChange}
        calculatedTotal={mode === 'edit' ? headerTotal : null}
        showModeToggle={true}
        saving={mode === 'edit' ? saving : false}
        hasUnsavedChanges={mode === 'edit' ? hasUnsavedChanges : false}
        metadataContent={renderMetadataSection()}
        actionButtons={mode === 'view' ? viewActionButtons : editActionButtons}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        sidebarContent={mode === 'edit' ? renderEditSidebar() : undefined}
        sidebarOpen={mode === 'edit' ? sidebarOpen : false}
        onSidebarToggle={mode === 'edit' ? () => setSidebarOpen(prev => !prev) : undefined}
        showFooter={mode === 'view'}
        subtotal={serverData.subtotal}
        gstRate={serverData.tax_rate}
        gstAmount={serverData.tax_amount}
        total={serverData.total}
      >
        {mode === 'view' ? renderViewContent() : renderEditContent()}
      </QuoteLayout>

      {/* Drawing Import Modal */}
      {showDrawingImport && editQuote && (
        editQuote.customer ? (
          <DrawingImport
            quoteId={quoteIdStr}
            customerId={editQuote.customer.id}
            edgeTypes={edgeTypes}
            onImportComplete={handleImportComplete}
            onDrawingsSaved={handleDrawingsSaved}
            onClose={() => setShowDrawingImport(false)}
          />
        ) : (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
              <div className="flex items-start gap-3 mb-4">
                <svg className="h-6 w-6 text-amber-500 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">Customer Required</h3>
                  <p className="text-sm text-gray-600 mt-1">
                    Please assign a customer to this quote before importing a drawing. The drawing upload requires a customer to be linked.
                  </p>
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={() => setShowDrawingImport(false)}
                  className="btn-primary"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        )
      )}
    </>
  );
}
