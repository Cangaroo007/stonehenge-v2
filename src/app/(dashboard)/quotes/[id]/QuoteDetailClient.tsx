'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useAutoSlabOptimiser } from '@/hooks/useAutoSlabOptimiser';
import { useUnits } from '@/lib/contexts/UnitContext';
import { formatAreaFromSqm } from '@/lib/utils/units';
import { formatCurrency, formatDate } from '@/lib/utils';
import QuoteLayout from '@/components/quotes/QuoteLayout';
import type { QuoteMode, QuoteTab } from '@/components/quotes/QuoteLayout';

// Builder sub-components
import PieceForm from './builder/components/PieceForm';
import PricingSummary from './builder/components/PricingSummary';
import QuoteActions from './builder/components/QuoteActions';
import DrawingImport from './builder/components/DrawingImport';
import { DrawingReferencePanel } from './builder/components/DrawingReferencePanel';
import DrawingsAccordion from '@/components/quotes/DrawingsAccordion';
import RoomSpatialView from '@/components/quotes/RoomSpatialView';
import MachineOperationsAccordion from '@/components/quotes/MachineOperationsAccordion';
import DeliveryTemplatingCard from './builder/components/DeliveryTemplatingCard';
import { OptimizationDisplay } from './builder/components/OptimizationDisplay';
import MachineDetailsPanel from './builder/components/MachineDetailsPanel';
import { CutoutType, PieceCutout } from './builder/components/CutoutSelector';
import VersionHistoryTab from '@/components/quotes/VersionHistoryTab';
import type { CalculationResult } from '@/lib/types/pricing';
import type { PieceRelationshipData } from '@/lib/types/piece-relationship';
import type { RelationshipType } from '@prisma/client';

// Expandable cost breakdown components
// MiniPieceEditor available for future re-enablement (12.J1: quick view toggle removed)
// import MiniPieceEditor from '@/components/quotes/MiniPieceEditor';
import PieceRow from '@/components/quotes/PieceRow';
import QuoteLevelCostSections from '@/components/quotes/QuoteLevelCostSections';
import MaterialCostSection from '@/components/quotes/MaterialCostSection';
import InlinePieceEditor from '@/components/quotes/InlinePieceEditor';
import type { InlinePieceData } from '@/components/quotes/InlinePieceEditor';
import QuoteCostSummaryBar from '@/components/quotes/QuoteCostSummaryBar';
import OptionTabsBar from '@/components/quotes/OptionTabsBar';
import CreateOptionDialog from '@/components/quotes/CreateOptionDialog';
import OptionComparisonSummary from '@/components/quotes/OptionComparisonSummary';
import PieceOverrideIndicator from '@/components/quotes/PieceOverrideIndicator';
import PieceOverrideEditor from '@/components/quotes/PieceOverrideEditor';
// MaterialView available for future re-enablement (12.J1: toggle removed, not component)
// import MaterialView from '@/components/quotes/MaterialView';
import BulkMaterialSwap from '@/components/quotes/BulkMaterialSwap';
import MultiSelectToolbar from '@/components/quotes/MultiSelectToolbar';
import PieceContextMenu from '@/components/quotes/PieceContextMenu';
import { useQuoteOptions } from '@/hooks/useQuoteOptions';
import { useUndoRedo } from '@/hooks/useUndoRedo';
import { useQuoteKeyboardShortcuts } from '@/hooks/useQuoteKeyboardShortcuts';
import toast from 'react-hot-toast';
import type { EdgeScope } from '@/components/quotes/EdgeProfilePopover';

// View-mode components
import DeleteQuoteButton from '@/components/DeleteQuoteButton';
import ManufacturingExportButton from './components/ManufacturingExportButton';
// QuoteViewTracker available for future re-enablement (12.J1: tab removed, not component)
// import QuoteViewTracker from './components/QuoteViewTracker';
import QuoteSignatureSection from './components/QuoteSignatureSection';
import SaveAsTemplateButton from './components/SaveAsTemplateButton';
import FromTemplateSheet from '@/components/quotes/FromTemplateSheet';
import FloatingActionButton from '@/components/quotes/FloatingActionButton';
import ContactPicker from '@/components/quotes/ContactPicker';
import { generatePieceDescription } from '@/lib/utils/description-generator';

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
  notes: string | null;
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
  contact_id: number | null;
  contact: {
    id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    role: string;
    role_title: string | null;
    is_primary: boolean;
  } | null;
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
  contact: {
    id: number;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    role: string;
    role_title: string | null;
    is_primary: boolean;
  } | null;
  quote_rooms: Array<{
    id: number;
    name: string;
    notes?: string | null;
    quote_pieces: Array<{
      id: number;
      description: string | null;
      name: string | null;
      length_mm: number;
      width_mm: number;
      thickness_mm: number;
      area_sqm: number;
      material_id: number | null;
      material_name: string | null;
      material_cost: number;
      features_cost: number;
      total_cost: number;
      edge_top: string | null;
      edge_bottom: string | null;
      edge_left: string | null;
      edge_right: string | null;
      piece_features: Array<{
        id: number;
        name: string;
        quantity: number;
      }>;
      materials: { name: string } | null;
      sourceRelationships: Array<{
        id: number;
        source_piece_id: number;
        target_piece_id: number;
        relationship_type: string | null;
        relation_type: string;
        side: string | null;
      }>;
      targetRelationships: Array<{
        id: number;
        source_piece_id: number;
        target_piece_id: number;
        relationship_type: string | null;
        relation_type: string;
        side: string | null;
      }>;
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
  // Force view mode for read-only statuses even if URL says ?mode=edit
  const readOnlyStatuses = ['sent', 'accepted', 'in_production', 'completed', 'archived'];
  const initialIsReadOnly = readOnlyStatuses.includes(serverData.status.toLowerCase());
  const [mode, setMode] = useState<QuoteMode>(initialIsReadOnly ? 'view' : initialMode);
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
  const [addingInlinePiece, setAddingInlinePiece] = useState(false);
  const [addingInlinePieceRoom, setAddingInlinePieceRoom] = useState<string | null>(null);
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [editLoading, setEditLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'rooms' | 'material'>('rooms');
  const [builderView, setBuilderView] = useState<'detailed' | 'quick'>('detailed');
  const [collapsedRooms, setCollapsedRooms] = useState<Set<number>>(new Set());
  const [spatialExpandedRooms, setSpatialExpandedRooms] = useState<Set<number>>(new Set());
  const [showBulkSwap, setShowBulkSwap] = useState(false);
  const [selectedPieceIds, setSelectedPieceIds] = useState<Set<string>>(new Set());
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; pieceId: string; pieceName: string; position: { x: number; y: number } }>({ isOpen: false, pieceId: '', pieceName: '', position: { x: 0, y: 0 } });
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [relationships, setRelationships] = useState<PieceRelationshipData[]>([]);
  const [roomSuggestions, setRoomSuggestions] = useState<string[]>([]);
  const [pieceSuggestions, setPieceSuggestions] = useState<string[]>([]);
  const [calculation, setCalculation] = useState<CalculationResult | null>(null);
  const calculationRef = useRef<CalculationResult | null>(null);
  const [viewCalculation, setViewCalculation] = useState<CalculationResult | null>(
    (serverData.calculation_breakdown as CalculationResult | null) ?? null
  );
  const [showDrawingImport, setShowDrawingImport] = useState(false);
  const [showFromTemplate, setShowFromTemplate] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [drawingsRefreshKey, setDrawingsRefreshKey] = useState(0);
  const [deliveryEnabled, setDeliveryEnabled] = useState<boolean>(() => {
    const del = (serverData.calculation_breakdown as CalculationResult | null)?.breakdown?.delivery;
    return !!(del && (del.address || del.distanceKm || del.finalCost > 0));
  });
  const [discountDisplayMode, setDiscountDisplayMode] = useState<'ITEMIZED' | 'TOTAL_ONLY'>('ITEMIZED');
  const { hasUnsavedChanges, markAsChanged, markAsSaved } = useUnsavedChanges();

  // ── Undo/Redo (Rule 23 — top-level, not inside conditional UI) ──────────
  const {
    canUndo, canRedo,
    undoDescription, redoDescription,
    undo, redo, pushAction,
  } = useUndoRedo(50);

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

  const editDataLoaded = useRef(false);
  const addPieceRef = useRef<HTMLDivElement>(null);
  const actionBarRef = useRef<HTMLDivElement>(null);

  // ── Quote Options state ─────────────────────────────────────────────────
  const [showCreateOptionDialog, setShowCreateOptionDialog] = useState(false);
  const [showOverrideEditor, setShowOverrideEditor] = useState<number | null>(null); // pieceId being overridden
  const [optionCalculations, setOptionCalculations] = useState<Record<number, CalculationResult>>({});
  const quoteOptions = useQuoteOptions({
    quoteId: quoteIdStr,
    enabled: mode === 'edit' && !editLoading && editDataLoaded.current,
  });

  // Track whether options exist (to show/hide tabs bar)
  const hasOptions = quoteOptions.options.length > 0;

  // Get override map for the active option
  const activeOverrideMap = useMemo(() => {
    if (!quoteOptions.activeOptionId) return new Map();
    return quoteOptions.getOverrideMap(quoteOptions.activeOptionId);
  }, [quoteOptions]);

  // ── Option Independence: ref + derived state for non-base option handling ──
  // Use a ref so handlers can access latest quoteOptions without dependency array bloat
  const quoteOptionsRef = useRef(quoteOptions);
  quoteOptionsRef.current = quoteOptions;

  const isActiveNonBaseOption = !!(quoteOptions.activeOption && !quoteOptions.activeOption.isBase);

  // Option Independence: merge active option overrides into piece data for display.
  // Base option or no overrides → raw pieces; non-base → override values applied.
  const effectivePieces = useMemo(() => {
    if (!isActiveNonBaseOption || activeOverrideMap.size === 0) {
      return pieces;
    }
    return pieces.map(p => {
      const override = activeOverrideMap.get(p.id);
      if (!override) return p;
      return {
        ...p,
        lengthMm: override.lengthMm ?? p.lengthMm,
        widthMm: override.widthMm ?? p.widthMm,
        thicknessMm: override.thicknessMm ?? p.thicknessMm,
        materialId: override.materialId ?? p.materialId,
        materialName: override.materialId
          ? (materials.find(m => m.id === override.materialId)?.name ?? p.materialName)
          : p.materialName,
        edgeTop: override.edgeTop ?? p.edgeTop,
        edgeBottom: override.edgeBottom ?? p.edgeBottom,
        edgeLeft: override.edgeLeft ?? p.edgeLeft,
        edgeRight: override.edgeRight ?? p.edgeRight,
        cutouts: (override.cutouts as PieceCutout[] | null) ?? p.cutouts,
      };
    });
  }, [pieces, isActiveNonBaseOption, activeOverrideMap, materials]);

  // Recalculate all options when base pieces change
  const recalculateOptionsAfterPieceChange = useCallback(async () => {
    if (quoteOptions.options.length > 0) {
      await quoteOptions.recalculateAllOptions();
    }
  }, [quoteOptions]);

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

  const fetchRelationships = useCallback(async () => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/relationships`);
      const data = res.ok ? await res.json() : [];
      setRelationships(Array.isArray(data) ? data : []);
    } catch {
      // Relationships are non-critical — silently continue with empty
      setRelationships([]);
    }
  }, [quoteIdStr]);

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

  // ── Background slab optimiser ─────────────────────────────────────────────
  // Stable fingerprint data for the hook (only fields that affect slab layout)
  const piecesForOptimiser = useMemo(
    () =>
      effectivePieces.map((p) => ({
        id: p.id,
        lengthMm: p.lengthMm,
        widthMm: p.widthMm,
        thicknessMm: p.thicknessMm,
        materialId: p.materialId,
        edgeTop: p.edgeTop,
        edgeBottom: p.edgeBottom,
        edgeLeft: p.edgeLeft,
        edgeRight: p.edgeRight,
      })),
    [effectivePieces]
  );

  const {
    optimisationRefreshKey,
    isOptimising,
    optimiserError,
    triggerOptimise,
  } = useAutoSlabOptimiser({
    quoteId: quoteIdStr,
    pieces: piecesForOptimiser,
    enabled: mode === 'edit' && !editLoading && editDataLoaded.current,
    getKerfWidth: getEffectiveKerfWidth,
  });

  // Trigger pricing recalculation when slab optimisation completes.
  // The optimiser runs asynchronously after piece changes, so by the time
  // the initial calculate call fires the optimisation result may not exist yet.
  // This ensures material cost (PER_SLAB) picks up the freshly-saved slab count.
  useEffect(() => {
    if (optimisationRefreshKey > 0) {
      triggerRecalculate();
    }
  }, [optimisationRefreshKey, triggerRecalculate]);

  // Machine override handler
  const handleMachineOverride = useCallback((operationType: string, machineId: string) => {
    setMachineOverrides(prev => ({ ...prev, [operationType]: machineId }));
    triggerRecalculate();
    triggerOptimise();
  }, [triggerRecalculate, triggerOptimise]);

  // Track quote view on page load
  useEffect(() => {
    fetch(`/api/quotes/${serverData.id}/track-view`, { method: 'POST' }).catch(() => {});
  }, [serverData.id]);

  // Fetch autocomplete suggestions for room/piece names
  useEffect(() => {
    if (mode !== 'edit') return;
    let cancelled = false;
    const fetchSuggestions = async () => {
      try {
        const [roomRes, pieceRes] = await Promise.all([
          fetch('/api/suggestions?type=room_names'),
          fetch('/api/suggestions?type=piece_names'),
        ]);
        if (cancelled) return;
        if (roomRes.ok) {
          const data = await roomRes.json();
          setRoomSuggestions(data.suggestions || []);
        }
        if (pieceRes.ok) {
          const data = await pieceRes.json();
          setPieceSuggestions(data.suggestions || []);
        }
      } catch {
        // Non-blocking
      }
    };
    fetchSuggestions();
    return () => { cancelled = true; };
  }, [mode]);

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
        fetchRelationships(),
      ]).then(() => setEditLoading(false));
    }
  }, [mode, fetchQuote, fetchMaterials, fetchEdgeTypes, fetchCutoutTypes, fetchThicknessOptions, fetchMachines, fetchMachineOperationDefaults, fetchCustomers, fetchRelationships]);

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

  // ── Fresh calculation for view mode ────────────────────────────────────────
  // The stored calculation_breakdown may be stale. Fetch a fresh calculation
  // so view mode shows accurate material cost, slab counts, and totals.
  useEffect(() => {
    if (mode !== 'view') return;

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
          setViewCalculation(data);
        }
      } catch {
        // Keep the server-provided calculation_breakdown as fallback
      }
    };

    calculate();
    return () => { cancelled = true; };
  }, [mode, quoteIdStr]);

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

  // Scroll to inline add piece form when it appears
  useEffect(() => {
    if (addingInlinePiece && addPieceRef.current) {
      setTimeout(() => {
        addPieceRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [addingInlinePiece]);

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
    // Optimistic update — clear contact when customer changes
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
        contact_id: null,
        contact: null,
      };
    });
    await handleMetadataSave({ customerId: customer?.id ?? null, contactId: null }, true);
  }, [handleMetadataSave]);

  // ── Contact selection handler ──────────────────────────────────────────
  const handleContactChange = useCallback(async (contactId: number | null) => {
    setEditQuote(prev => {
      if (!prev) return null;
      return { ...prev, contact_id: contactId };
    });
    await handleMetadataSave({ contactId: contactId }, true);
  }, [handleMetadataSave]);

  // ── Edit-mode handlers ────────────────────────────────────────────────────

  const handleSelectPiece = (pieceId: number) => {
    setIsAddingPiece(false);
    setSelectedPieceId(pieceId === selectedPieceId ? null : pieceId);
    setSidebarOpen(true);
  };

  const handleAddPiece = (preselectedRoom?: string) => {
    setAddingInlinePiece(true);
    setAddingInlinePieceRoom(preselectedRoom || null);
    setSelectedPieceId(null);
    setIsAddingPiece(false);
  };

  const handleCancelForm = () => {
    setSelectedPieceId(null);
    setIsAddingPiece(false);
  };

  const handlePieceUpdate = useCallback(async (pieceId: number, updates: Partial<QuotePiece>) => {
    // Option Independence: redirect edits to override API for non-base options
    const qoRef = quoteOptionsRef.current;
    if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
      const overrideData = {
        pieceId,
        ...(updates.materialId !== undefined ? { materialId: updates.materialId } : {}),
        ...(updates.thicknessMm !== undefined ? { thicknessMm: updates.thicknessMm } : {}),
        ...(updates.edgeTop !== undefined ? { edgeTop: updates.edgeTop } : {}),
        ...(updates.edgeBottom !== undefined ? { edgeBottom: updates.edgeBottom } : {}),
        ...(updates.edgeLeft !== undefined ? { edgeLeft: updates.edgeLeft } : {}),
        ...(updates.edgeRight !== undefined ? { edgeRight: updates.edgeRight } : {}),
        ...((updates as Record<string, unknown>).cutouts !== undefined ? { cutouts: (updates as Record<string, unknown>).cutouts } : {}),
        ...(updates.lengthMm !== undefined ? { lengthMm: updates.lengthMm } : {}),
        ...(updates.widthMm !== undefined ? { widthMm: updates.widthMm } : {}),
      };
      await qoRef.setOverrides(qoRef.activeOptionId, [overrideData]);
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();
      return;
    }

    // Capture before-state for undo
    const oldPiece = pieces.find(p => p.id === pieceId);
    const oldValues: Partial<QuotePiece> = {};
    if (oldPiece) {
      for (const key of Object.keys(updates) as (keyof QuotePiece)[]) {
        (oldValues as Record<string, unknown>)[key] = oldPiece[key];
      }
    }
    const pieceName = oldPiece?.name || `Piece #${pieceId}`;

    // Auto-generate description from merged piece state
    const merged = oldPiece ? { ...oldPiece, ...updates } : updates;
    const mergedPiece = merged as QuotePiece;
    const resolvedCutouts = (mergedPiece.cutouts || []).map((c: PieceCutout) => {
      const ct = cutoutTypes.find(t => t.id === c.cutoutTypeId);
      return { type: ct?.name || 'unknown', quantity: c.quantity ?? 1 };
    });
    const autoDesc = generatePieceDescription({
      name: mergedPiece.name || undefined,
      length_mm: mergedPiece.lengthMm,
      width_mm: mergedPiece.widthMm,
      thickness: mergedPiece.thicknessMm,
      material_name: mergedPiece.materialName || undefined,
      edge_top: mergedPiece.edgeTop,
      edge_bottom: mergedPiece.edgeBottom,
      edge_left: mergedPiece.edgeLeft,
      edge_right: mergedPiece.edgeRight,
      cutouts: resolvedCutouts,
    });
    const updatesWithDesc = { ...updates };
    if (autoDesc && !updates.description) {
      (updatesWithDesc as Record<string, unknown>).description = autoDesc;
    }

    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatesWithDesc),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update piece');
      }
      setPieces(prev => prev.map(p =>
        p.id === pieceId ? { ...p, ...updatesWithDesc } : p
      ));
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();
      recalculateOptionsAfterPieceChange();

      // Register undoable action
      const changedFields = Object.keys(updates).join(', ');
      pushAction({
        type: 'PIECE_EDIT',
        description: `Edited ${pieceName} (${changedFields})`,
        forward: async () => {
          await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updates),
          });
          await fetchQuote();
          triggerRecalculate();
        },
        backward: async () => {
          await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(oldValues),
          });
          await fetchQuote();
          triggerRecalculate();
        },
      });
    } catch (err) {
      console.error('Failed to update piece:', err);
      await fetchQuote();
    }
  }, [quoteIdStr, pieces, triggerRecalculate, triggerOptimise, markAsChanged, fetchQuote, recalculateOptionsAfterPieceChange, pushAction]);

  const handleMaterialChange = useCallback(async (pieceId: number, materialId: number | null) => {
    const material = materialId ? materials.find(m => m.id === materialId) : null;
    const materialName = material?.name ?? null;
    await handlePieceUpdate(pieceId, { materialId, materialName } as Partial<QuotePiece>);
  }, [materials, handlePieceUpdate]);

  const handleBulkMaterialApply = useCallback(async (changes: { pieceId: number; toMaterialId: number }[]) => {
    const toMaterial = materials.find(m => m.id === changes[0]?.toMaterialId);
    if (!toMaterial) throw new Error('Material not found');

    // Option Independence: redirect to overrides for non-base options
    const qoRef = quoteOptionsRef.current;
    if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
      const overrideDataArray = changes.map(change => ({
        pieceId: change.pieceId,
        materialId: change.toMaterialId,
      }));
      await qoRef.setOverrides(qoRef.activeOptionId, overrideDataArray);
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();
      return;
    }

    // Update each piece individually (no batch endpoint available)
    for (const change of changes) {
      const mat = materials.find(m => m.id === change.toMaterialId);
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${change.pieceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId: change.toMaterialId, materialName: mat?.name ?? null }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Failed to update piece ${change.pieceId}`);
      }
    }

    // Update local state in one pass
    setPieces(prev => prev.map(p => {
      const change = changes.find(c => c.pieceId === p.id);
      if (!change) return p;
      const mat = materials.find(m => m.id === change.toMaterialId);
      return { ...p, materialId: change.toMaterialId, materialName: mat?.name ?? null };
    }));

    // Single recalculation after all changes
    triggerRecalculate();
    triggerOptimise();
    markAsChanged();
    recalculateOptionsAfterPieceChange();
  }, [quoteIdStr, materials, triggerRecalculate, triggerOptimise, markAsChanged, recalculateOptionsAfterPieceChange]);

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
      triggerOptimise();
      markAsChanged();
      recalculateOptionsAfterPieceChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save piece');
    } finally {
      setSaving(false);
    }
  };

  const handleInlineSavePiece = useCallback(async (pieceId: number, data: Record<string, unknown>, roomName: string) => {
    // Capture before-state for edit undo
    const isCreate = pieceId === 0;
    const oldPiece = !isCreate ? pieces.find(p => p.id === pieceId) : null;
    const oldValues: Record<string, unknown> = {};
    if (oldPiece) {
      const pieceRecord = oldPiece as unknown as Record<string, unknown>;
      for (const key of Object.keys(data)) {
        oldValues[key] = pieceRecord[key];
      }
      oldValues.roomName = oldPiece.quote_rooms?.name;
    }

    // Option Independence: redirect existing piece edits to override API for non-base options
    const qoRef = quoteOptionsRef.current;
    if (!isCreate && qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
      setSaving(true);
      try {
        const overrideData = {
          pieceId,
          ...(data.materialId !== undefined ? { materialId: data.materialId as number | null } : {}),
          ...(data.thicknessMm !== undefined ? { thicknessMm: data.thicknessMm as number | null } : {}),
          ...(data.edgeTop !== undefined ? { edgeTop: data.edgeTop as string | null } : {}),
          ...(data.edgeBottom !== undefined ? { edgeBottom: data.edgeBottom as string | null } : {}),
          ...(data.edgeLeft !== undefined ? { edgeLeft: data.edgeLeft as string | null } : {}),
          ...(data.edgeRight !== undefined ? { edgeRight: data.edgeRight as string | null } : {}),
          ...(data.cutouts !== undefined ? { cutouts: data.cutouts } : {}),
          ...(data.lengthMm !== undefined ? { lengthMm: data.lengthMm as number | null } : {}),
          ...(data.widthMm !== undefined ? { widthMm: data.widthMm as number | null } : {}),
        };
        await qoRef.setOverrides(qoRef.activeOptionId, [overrideData]);
        triggerRecalculate();
        triggerOptimise();
        markAsChanged();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save override');
      } finally {
        setSaving(false);
      }
      return;
    }

    setSaving(true);
    try {
      // Auto-generate piece description from current attributes
      const materialForDesc = materials.find(m => m.id === (data.materialId as number | null));
      const pieceCutouts = ((data.cutouts as PieceCutout[]) || oldPiece?.cutouts || []);
      const resolvedCutoutsForDesc = pieceCutouts.map((c: PieceCutout) => {
        const ct = cutoutTypes.find(t => t.id === c.cutoutTypeId);
        return { type: ct?.name || 'unknown', quantity: c.quantity ?? 1 };
      });
      const autoDesc = generatePieceDescription({
        name: (data.name as string) || oldPiece?.name || undefined,
        length_mm: (data.lengthMm as number) || oldPiece?.lengthMm,
        width_mm: (data.widthMm as number) || oldPiece?.widthMm,
        thickness: (data.thicknessMm as number) || oldPiece?.thicknessMm,
        material_name: materialForDesc?.name || (data.materialName as string) || oldPiece?.materialName || undefined,
        edge_top: (data.edgeTop as string | null) ?? oldPiece?.edgeTop ?? null,
        edge_bottom: (data.edgeBottom as string | null) ?? oldPiece?.edgeBottom ?? null,
        edge_left: (data.edgeLeft as string | null) ?? oldPiece?.edgeLeft ?? null,
        edge_right: (data.edgeRight as string | null) ?? oldPiece?.edgeRight ?? null,
        cutouts: resolvedCutoutsForDesc,
      });
      // Only set auto-description if user hasn't manually edited it
      const dataWithDesc = { ...data };
      if (!data.description && autoDesc) {
        dataWithDesc.description = autoDesc;
      }

      const url = isCreate
        ? `/api/quotes/${quoteIdStr}/pieces`
        : `/api/quotes/${quoteIdStr}/pieces/${pieceId}`;
      const method = isCreate ? 'POST' : 'PUT';

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dataWithDesc, roomName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save piece');
      }
      const savedPiece = await response.json();

      if (isCreate) {
        setAddingInlinePiece(false);
        setAddingInlinePieceRoom(null);
      }
      await fetchQuote();
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();
      recalculateOptionsAfterPieceChange();

      // Register undoable action
      const pieceName = (data.name as string) || oldPiece?.name || 'Piece';
      if (isCreate) {
        const newPieceId = savedPiece.id;
        pushAction({
          type: 'PIECE_CREATE',
          description: `Created ${pieceName}`,
          forward: async () => {
            await fetch(`/api/quotes/${quoteIdStr}/pieces`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...data, roomName }),
            });
            await fetchQuote();
            triggerRecalculate();
          },
          backward: async () => {
            await fetch(`/api/quotes/${quoteIdStr}/pieces/${newPieceId}`, { method: 'DELETE' });
            await fetchQuote();
            triggerRecalculate();
          },
        });
      } else {
        pushAction({
          type: 'PIECE_EDIT',
          description: `Edited ${pieceName}`,
          forward: async () => {
            await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...data, roomName }),
            });
            await fetchQuote();
            triggerRecalculate();
          },
          backward: async () => {
            await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(oldValues),
            });
            await fetchQuote();
            triggerRecalculate();
          },
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save piece');
    } finally {
      setSaving(false);
    }
  }, [quoteIdStr, pieces, fetchQuote, triggerRecalculate, triggerOptimise, markAsChanged, recalculateOptionsAfterPieceChange, pushAction]);

  // Bulk edge apply — applies edge profile template to all pieces in room or quote
  const handleBulkEdgeApply = useCallback(async (
    edges: { top: string | null; bottom: string | null; left: string | null; right: string | null },
    scope: 'room' | 'quote',
    sourcePieceId: number
  ) => {
    try {
      // Find which pieces to update based on scope
      let targetPieceIds: number[] = [];

      if (scope === 'room') {
        // Find the room of the source piece, then get all piece IDs in that room
        const sourcePiece = effectivePieces.find(p => p.id === sourcePieceId);
        if (sourcePiece?.quote_rooms?.id) {
          targetPieceIds = effectivePieces
            .filter(p => p.quote_rooms?.id === sourcePiece.quote_rooms?.id && p.id !== sourcePieceId)
            .map(p => p.id);
        }
      } else {
        // All pieces in quote except the source
        targetPieceIds = effectivePieces
          .filter(p => p.id !== sourcePieceId)
          .map(p => p.id);
      }

      if (targetPieceIds.length === 0) return;

      // Option Independence: redirect to overrides for non-base options
      const qoRef = quoteOptionsRef.current;
      if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
        const overrideDataArray = targetPieceIds.map(pid => ({
          pieceId: pid,
          edgeTop: edges.top,
          edgeBottom: edges.bottom,
          edgeLeft: edges.left,
          edgeRight: edges.right,
        }));
        await qoRef.setOverrides(qoRef.activeOptionId, overrideDataArray);
        triggerRecalculate();
        triggerOptimise();
        markAsChanged();
        return;
      }

      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-edges`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds: targetPieceIds, edges }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to bulk update edges');
      }

      const result = await response.json() as { updated: number; skipped: number; skippedReasons: string[] };

      // Refresh data
      await fetchQuote();
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();

      // Show skip reasons if any
      if (result.skippedReasons.length > 0) {
        setError(`Updated ${result.updated} pieces. ${result.skippedReasons.join('. ')}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk update edges');
    }
  }, [pieces, quoteIdStr, fetchQuote, triggerRecalculate, triggerOptimise, markAsChanged]);

  // Single-edge change from RoomSpatialView (1-click edge editing — Rule 37)
  const handlePieceEdgeChange = useCallback(async (pieceId: string, side: string, profileId: string | null) => {
    const piece = effectivePieces.find(p => String(p.id) === pieceId);
    if (!piece) return;

    const edgeKey = `edge${side.charAt(0).toUpperCase()}${side.slice(1)}` as
      'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight';

    await handleInlineSavePiece(
      piece.id,
      {
        lengthMm: piece.lengthMm,
        widthMm: piece.widthMm,
        thicknessMm: piece.thicknessMm,
        materialId: piece.materialId,
        materialName: piece.materialName,
        edgeTop: edgeKey === 'edgeTop' ? profileId : piece.edgeTop,
        edgeBottom: edgeKey === 'edgeBottom' ? profileId : piece.edgeBottom,
        edgeLeft: edgeKey === 'edgeLeft' ? profileId : piece.edgeLeft,
        edgeRight: edgeKey === 'edgeRight' ? profileId : piece.edgeRight,
        cutouts: piece.cutouts || [],
      },
      piece.quote_rooms?.name || 'Kitchen'
    );
  }, [pieces, handleInlineSavePiece]);

  // Batch edge update — applies a single edge profile to multiple pieces/sides based on scope
  const handleBatchEdgeUpdate = useCallback(async (
    profileId: string | null,
    scope: EdgeScope,
    sourcePieceId: number,
    sourceSide: string,
    sourceRoomId: number
  ) => {
    try {
      // 1. Determine which pieces and sides to update
      const updates: Array<{ pieceId: number; sides: string[] }> = [];

      switch (scope.type) {
        case 'edge':
          updates.push({ pieceId: sourcePieceId, sides: [sourceSide] });
          break;
        case 'piece-side':
          updates.push({ pieceId: sourcePieceId, sides: [scope.side] });
          break;
        case 'piece-all':
          updates.push({ pieceId: sourcePieceId, sides: ['top', 'bottom', 'left', 'right'] });
          break;
        case 'room-side':
          effectivePieces.filter(p => String(p.quote_rooms?.id) === scope.roomId).forEach(p => {
            updates.push({ pieceId: p.id, sides: [scope.side] });
          });
          break;
        case 'room-all':
          effectivePieces.filter(p => String(p.quote_rooms?.id) === scope.roomId).forEach(p => {
            updates.push({ pieceId: p.id, sides: ['top', 'bottom', 'left', 'right'] });
          });
          break;
        case 'quote-side':
          effectivePieces.forEach(p => {
            updates.push({ pieceId: p.id, sides: [scope.side] });
          });
          break;
        case 'quote-all':
          effectivePieces.forEach(p => {
            updates.push({ pieceId: p.id, sides: ['top', 'bottom', 'left', 'right'] });
          });
          break;
      }

      if (updates.length === 0) return;

      // 2. Optimistic UI — update ALL affected pieces in local state IMMEDIATELY (Rule 42)
      const totalEdges = updates.reduce((sum, u) => sum + u.sides.length, 0);
      setPieces(prevPieces => {
        const next = [...prevPieces];
        for (const { pieceId, sides } of updates) {
          const idx = next.findIndex(p => p.id === pieceId);
          if (idx === -1) continue;
          const piece = { ...next[idx] };
          for (const s of sides) {
            const key = `edge${s.charAt(0).toUpperCase()}${s.slice(1)}` as
              'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight';
            piece[key] = profileId;
          }
          next[idx] = piece;
        }
        return next;
      });

      // 3. Save to database
      if (scope.type === 'edge') {
        // Single edge — use existing individual save
        const piece = effectivePieces.find(p => p.id === sourcePieceId);
        if (!piece) return;
        const edgeKey = `edge${sourceSide.charAt(0).toUpperCase()}${sourceSide.slice(1)}` as
          'edgeTop' | 'edgeBottom' | 'edgeLeft' | 'edgeRight';
        await handleInlineSavePiece(
          piece.id,
          {
            lengthMm: piece.lengthMm,
            widthMm: piece.widthMm,
            thicknessMm: piece.thicknessMm,
            materialId: piece.materialId,
            materialName: piece.materialName,
            edgeTop: edgeKey === 'edgeTop' ? profileId : piece.edgeTop,
            edgeBottom: edgeKey === 'edgeBottom' ? profileId : piece.edgeBottom,
            edgeLeft: edgeKey === 'edgeLeft' ? profileId : piece.edgeLeft,
            edgeRight: edgeKey === 'edgeRight' ? profileId : piece.edgeRight,
            cutouts: piece.cutouts || [],
          },
          piece.quote_rooms?.name || 'Kitchen'
        );
        return;
      }

      // Batch update — use bulk-edges API
      const targetPieceIds = Array.from(new Set(updates.map(u => u.pieceId)));
      const allSides = Array.from(new Set(updates.flatMap(u => u.sides)));
      const edges: Record<string, string | null> = {};
      for (const s of allSides) {
        edges[s] = profileId;
      }

      // Option Independence: batch edge update via overrides for non-base options
      const qoRef = quoteOptionsRef.current;
      if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
        const overrideDataArray = updates.map(({ pieceId: pid, sides }) => {
          const edgeOverrides: { edgeTop?: string | null; edgeBottom?: string | null; edgeLeft?: string | null; edgeRight?: string | null } = {};
          for (const s of sides) {
            const key = `edge${s.charAt(0).toUpperCase()}${s.slice(1)}` as keyof typeof edgeOverrides;
            edgeOverrides[key] = profileId;
          }
          return { pieceId: pid, ...edgeOverrides };
        });
        await qoRef.setOverrides(qoRef.activeOptionId, overrideDataArray);
        await fetchQuote();
        triggerRecalculate();
        triggerOptimise();
        markAsChanged();
        const pieceCount = targetPieceIds.length;
        toast.success(`Updated ${totalEdges} edge${totalEdges > 1 ? 's' : ''} across ${pieceCount} piece${pieceCount > 1 ? 's' : ''}`);
        return;
      }

      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-edges`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds: targetPieceIds, edges }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to batch update edges');
      }

      const result = await response.json() as { updated: number; skipped: number; skippedReasons: string[] };

      // 4. Refresh data and trigger recalculation
      await fetchQuote();
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();

      // Toast notification
      const pieceCount = targetPieceIds.length;
      toast.success(`Updated ${totalEdges} edge${totalEdges > 1 ? 's' : ''} across ${pieceCount} piece${pieceCount > 1 ? 's' : ''}`);

      if (result.skippedReasons?.length > 0) {
        setError(result.skippedReasons.join('. '));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to batch update edges');
      // Revert optimistic update on error
      await fetchQuote();
    }
  }, [pieces, quoteIdStr, fetchQuote, triggerRecalculate, triggerOptimise, markAsChanged, handleInlineSavePiece]);

  const handleCreateRoom = useCallback(async (name: string) => {
    if (!name.trim()) return;
    const trimmedName = name.trim();
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName }),
      });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to create room');
      }
      setIsAddingRoom(false);
      setNewRoomName('');
      await fetchQuote();
      markAsChanged();
      // Auto-trigger add piece flow for the new room
      setAddingInlinePieceRoom(trimmedName);
      setAddingInlinePiece(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setSaving(false);
    }
  }, [quoteIdStr, fetchQuote, markAsChanged]);

  const handleDeletePiece = async (pieceId: number) => {
    if (!confirm('Are you sure you want to delete this piece?')) return;

    // Capture piece data for undo (re-create)
    const deletedPiece = pieces.find(p => p.id === pieceId);
    const pieceName = deletedPiece?.name || `Piece #${pieceId}`;
    const roomName = deletedPiece?.quote_rooms?.name || 'Unassigned';

    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete piece');
      await fetchQuote();
      if (selectedPieceId === pieceId) setSelectedPieceId(null);
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();
      recalculateOptionsAfterPieceChange();

      // Register undoable delete (undo = re-create piece)
      if (deletedPiece) {
        const piecePayload = {
          name: deletedPiece.name,
          description: deletedPiece.description,
          lengthMm: deletedPiece.lengthMm,
          widthMm: deletedPiece.widthMm,
          thicknessMm: deletedPiece.thicknessMm,
          materialId: deletedPiece.materialId,
          materialName: deletedPiece.materialName,
          edgeTop: deletedPiece.edgeTop,
          edgeBottom: deletedPiece.edgeBottom,
          edgeLeft: deletedPiece.edgeLeft,
          edgeRight: deletedPiece.edgeRight,
          cutouts: deletedPiece.cutouts,
          roomName,
        };

        pushAction({
          type: 'PIECE_DELETE',
          description: `Deleted ${pieceName}`,
          forward: async () => {
            // Re-delete (find piece by name — best effort)
            await fetchQuote();
          },
          backward: async () => {
            await fetch(`/api/quotes/${quoteIdStr}/pieces`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(piecePayload),
            });
            await fetchQuote();
            triggerRecalculate();
          },
          snapshot: piecePayload,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete piece');
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicatePiece = async (pieceId: number) => {
    const sourcePiece = pieces.find(p => p.id === pieceId);
    const pieceName = sourcePiece?.name || `Piece #${pieceId}`;

    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}/duplicate`, { method: 'POST' });
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to duplicate piece');
      }
      const newPiece = await response.json();
      const newPieceId = newPiece.id;
      await fetchQuote();
      setSelectedPieceId(newPieceId);
      setIsAddingPiece(false);
      triggerRecalculate();
      triggerOptimise();
      markAsChanged();

      // Register undoable action (undo = delete the duplicate)
      pushAction({
        type: 'PIECE_CREATE',
        description: `Duplicated ${pieceName}`,
        forward: async () => {
          await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}/duplicate`, { method: 'POST' });
          await fetchQuote();
          triggerRecalculate();
        },
        backward: async () => {
          await fetch(`/api/quotes/${quoteIdStr}/pieces/${newPieceId}`, { method: 'DELETE' });
          await fetchQuote();
          triggerRecalculate();
        },
      });
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

  const handleDeliveryEnabledChange = async (enabled: boolean) => {
    setDeliveryEnabled(enabled);
    markAsChanged();
    try {
      if (!enabled) {
        // Disable delivery: zero out delivery fields
        await fetch(`/api/quotes/${quoteIdStr}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryCost: 0,
            deliveryDistanceKm: 0,
            deliveryAddress: null,
            overrideDeliveryCost: null,
          }),
        });
      } else {
        // Enable delivery: clear cost so calculator auto-calculates from address
        await fetch(`/api/quotes/${quoteIdStr}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            deliveryCost: null,
            deliveryDistanceKm: null,
          }),
        });
      }
      triggerRecalculate();
    } catch (err) {
      console.error('Failed to update delivery toggle:', err);
      setDeliveryEnabled(!enabled); // Revert on failure
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

  const handleStatusChange = async (newStatus: string, options?: { declinedReason?: string }) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/status`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus, declinedReason: options?.declinedReason }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to update status');

      // If a revision was created, redirect to the new quote
      if (data.newQuoteId) {
        toast.success('Revision created');
        router.push(`/quotes/${data.newQuoteId}?mode=edit`);
        return;
      }

      toast.success(`Status changed to ${newStatus.replace('_', ' ')}`);
      await fetchQuote();
      // Force view mode if the new status is read-only
      const readOnlyStatuses = ['sent', 'accepted', 'in_production', 'completed', 'archived'];
      if (readOnlyStatuses.includes(newStatus.toLowerCase())) {
        setMode('view');
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to update status';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateQuote = async () => {
    if (!confirm('Duplicate this quote? A new draft will be created with all pieces copied.')) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Failed to duplicate quote');
      toast.success(`Quote duplicated as ${data.quote_number}`);
      router.push(data.redirectUrl || `/quotes/${data.id}?mode=edit`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to duplicate quote';
      setError(msg);
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // ── Download PDF handler ──────────────────────────────────────────────────
  const handleDownloadPdf = async () => {
    setDownloadingPdf(true);
    try {
      const response = await fetch(`/api/quotes/${quoteIdStr}/pdf`);
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Failed to generate PDF' }));
        throw new Error(data.error || `PDF generation failed (${response.status})`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${editQuote?.quote_number ?? serverData.quote_number}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to download PDF';
      alert(msg);
    } finally {
      setDownloadingPdf(false);
    }
  };

  const handleImportComplete = useCallback(async (count: number) => {
    setShowDrawingImport(false);
    await fetchQuote();
    triggerRecalculate();
    triggerOptimise();
    markAsChanged();
    setImportSuccessMessage(`Imported ${count} piece${count !== 1 ? 's' : ''} from drawing`);
    setTimeout(() => setImportSuccessMessage(null), 5000);
  }, [fetchQuote, triggerRecalculate, triggerOptimise, markAsChanged]);

  const handleTemplateApplied = useCallback(async (piecesCreated: number, templateName: string) => {
    setShowFromTemplate(false);
    await fetchQuote();
    triggerRecalculate();
    triggerOptimise();
    markAsChanged();
    recalculateOptionsAfterPieceChange();
    setImportSuccessMessage(`Added ${templateName} \u2014 ${piecesCreated} piece${piecesCreated !== 1 ? 's' : ''}`);
    setTimeout(() => setImportSuccessMessage(null), 5000);
  }, [fetchQuote, triggerRecalculate, triggerOptimise, markAsChanged, recalculateOptionsAfterPieceChange]);

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

  // ── Room management handlers ────────────────────────────────────────────

  const handleRoomNotesChange = useCallback(async (roomIdToUpdate: number, notes: string) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms/${roomIdToUpdate}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to update room notes');
        return;
      }
      // Optimistic update for room notes
      setRooms(prev => prev.map(r =>
        r.id === roomIdToUpdate ? { ...r, notes: notes || null } : r
      ));
      markAsChanged();
    } catch {
      toast.error('Failed to update room notes');
    }
  }, [quoteIdStr, markAsChanged]);

  const handleRoomRename = useCallback(async (roomIdToRename: number, newName: string) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms/${roomIdToRename}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to rename room');
        return;
      }
      toast.success('Room renamed');
      await fetchQuote();
    } catch {
      toast.error('Failed to rename room');
    }
  }, [quoteIdStr, fetchQuote]);

  const handleRoomMoveUp = useCallback(async (roomIdToMove: number) => {
    const sorted = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(r => r.id === roomIdToMove);
    if (idx <= 0) return;
    const reordered = sorted.map((r, i) => ({
      id: r.id,
      sortOrder: i === idx ? sorted[idx - 1].sortOrder : i === idx - 1 ? sorted[idx].sortOrder : r.sortOrder,
    }));
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: reordered }),
      });
      if (!res.ok) throw new Error();
      await fetchQuote();
    } catch {
      toast.error('Failed to reorder rooms');
    }
  }, [rooms, quoteIdStr, fetchQuote]);

  const handleRoomMoveDown = useCallback(async (roomIdToMove: number) => {
    const sorted = [...rooms].sort((a, b) => a.sortOrder - b.sortOrder);
    const idx = sorted.findIndex(r => r.id === roomIdToMove);
    if (idx < 0 || idx >= sorted.length - 1) return;
    const reordered = sorted.map((r, i) => ({
      id: r.id,
      sortOrder: i === idx ? sorted[idx + 1].sortOrder : i === idx + 1 ? sorted[idx].sortOrder : r.sortOrder,
    }));
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: reordered }),
      });
      if (!res.ok) throw new Error();
      await fetchQuote();
    } catch {
      toast.error('Failed to reorder rooms');
    }
  }, [rooms, quoteIdStr, fetchQuote]);

  const handleRoomMerge = useCallback(async (sourceRoomId: number, targetRoomId: number) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms/${sourceRoomId}/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetRoomId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Merged ${data.piecesMoved} pieces into ${data.targetRoomName}`);
      await fetchQuote();
      triggerRecalculate();
    } catch {
      toast.error('Failed to merge rooms');
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate]);

  const handleRoomDelete = useCallback(async (roomIdToDelete: number) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms/${roomIdToDelete}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Room deleted${data.piecesMovedToUnassigned > 0 ? `, ${data.piecesMovedToUnassigned} pieces moved to Unassigned` : ''}`);
      await fetchQuote();
      triggerRecalculate();
    } catch {
      toast.error('Failed to delete room');
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate]);

  const handleAddRoomBelow = useCallback(async (_afterRoomId: number) => {
    const name = prompt('New room name:');
    if (!name?.trim()) return;
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/rooms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to add room');
        return;
      }
      toast.success('Room added');
      await fetchQuote();
    } catch {
      toast.error('Failed to add room');
    }
  }, [quoteIdStr, fetchQuote]);

  const handleAddPieceToRoom = useCallback((roomIdForPiece: number) => {
    const room = rooms.find(r => r.id === roomIdForPiece);
    if (room) {
      setAddingInlinePieceRoom(room.name);
      setAddingInlinePiece(true);
    }
  }, [rooms]);

  const toggleRoomCollapse = useCallback((roomId: number) => {
    setCollapsedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }, []);

  const toggleSpatialView = useCallback((roomId: number) => {
    setSpatialExpandedRooms(prev => {
      const next = new Set(prev);
      if (next.has(roomId)) {
        next.delete(roomId);
      } else {
        next.add(roomId);
      }
      return next;
    });
  }, []);

  // ── Multi-select handlers ──────────────────────────────────────────────

  const handlePieceMultiSelect = useCallback((pieceId: string, event: { ctrlKey: boolean; shiftKey: boolean; metaKey: boolean }) => {
    setSelectedPieceIds(prev => {
      const next = new Set(prev);
      if (event.ctrlKey || event.metaKey) {
        // Toggle selection
        if (next.has(pieceId)) {
          next.delete(pieceId);
        } else {
          next.add(pieceId);
        }
      } else if (event.shiftKey) {
        // Range select — select from last selected to this piece
        const allPieceIds = pieces.map(p => String(p.id));
        const lastSelected = Array.from(prev).pop();
        if (lastSelected) {
          const startIdx = allPieceIds.indexOf(lastSelected);
          const endIdx = allPieceIds.indexOf(pieceId);
          if (startIdx >= 0 && endIdx >= 0) {
            const [from, to] = startIdx < endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
            for (let i = from; i <= to; i++) {
              next.add(allPieceIds[i]);
            }
          }
        } else {
          next.add(pieceId);
        }
      }
      return next;
    });
  }, [pieces]);

  const handleBatchMaterial = useCallback(async (materialId: number) => {
    const pieceIds = Array.from(selectedPieceIds).map(Number);
    if (pieceIds.length === 0) return;

    const material = materials.find(m => m.id === materialId);
    if (!material) return;

    // Option Independence: redirect to overrides for non-base options
    const qoRef = quoteOptionsRef.current;
    if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
      const overrideDataArray = pieceIds.map(pid => ({
        pieceId: pid,
        materialId,
      }));
      await qoRef.setOverrides(qoRef.activeOptionId, overrideDataArray);
      toast.success(`Updated material on ${pieceIds.length} piece${pieceIds.length !== 1 ? 's' : ''} (override)`);
      setSelectedPieceIds(new Set());
      triggerRecalculate();
      return;
    }

    // Optimistic local state update (Rule 42: visual feedback within 100ms)
    const prevPieces = pieces;
    setPieces(prev => prev.map(p => {
      if (pieceIds.includes(p.id)) {
        return { ...p, materialId, materialName: material.name };
      }
      return p;
    }));

    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds, materialId }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Updated material on ${data.updated} piece${data.updated !== 1 ? 's' : ''}`);
      setSelectedPieceIds(new Set());
      await fetchQuote();
      triggerRecalculate();
    } catch {
      // Revert optimistic update on failure
      setPieces(prevPieces);
      toast.error('Failed to update material');
    }
  }, [selectedPieceIds, quoteIdStr, fetchQuote, triggerRecalculate, materials, pieces]);

  const handleBatchThickness = useCallback(async (thicknessMm: number) => {
    const pieceIds = Array.from(selectedPieceIds).map(Number);

    // Option Independence: redirect to overrides for non-base options
    const qoRef = quoteOptionsRef.current;
    if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
      const overrideDataArray = pieceIds.map(pid => ({
        pieceId: pid,
        thicknessMm,
      }));
      await qoRef.setOverrides(qoRef.activeOptionId, overrideDataArray);
      toast.success(`Thickness updated on ${pieceIds.length} pieces (override)`);
      setSelectedPieceIds(new Set());
      triggerRecalculate();
      return;
    }

    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-update`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds, thicknessMm }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Thickness updated on ${data.updated} pieces`);
      setSelectedPieceIds(new Set());
      await fetchQuote();
      triggerRecalculate();
    } catch {
      toast.error('Failed to update thickness');
    }
  }, [selectedPieceIds, quoteIdStr, fetchQuote, triggerRecalculate]);

  const handleBatchEdges = useCallback(async (edges: { top?: string | null; bottom?: string | null; left?: string | null; right?: string | null }) => {
    const pieceIds = Array.from(selectedPieceIds).map(Number);

    // Option Independence: redirect to overrides for non-base options
    const qoRef = quoteOptionsRef.current;
    if (qoRef.activeOption && !qoRef.activeOption.isBase && qoRef.activeOptionId) {
      const overrideDataArray = pieceIds.map(pid => ({
        pieceId: pid,
        ...(edges.top !== undefined ? { edgeTop: edges.top } : {}),
        ...(edges.bottom !== undefined ? { edgeBottom: edges.bottom } : {}),
        ...(edges.left !== undefined ? { edgeLeft: edges.left } : {}),
        ...(edges.right !== undefined ? { edgeRight: edges.right } : {}),
      }));
      await qoRef.setOverrides(qoRef.activeOptionId, overrideDataArray);
      toast.success(`Edges updated on ${pieceIds.length} pieces (override)`);
      setSelectedPieceIds(new Set());
      triggerRecalculate();
      return;
    }

    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-edges`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds, edges }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Edges updated on ${data.updated} pieces${data.skipped > 0 ? ` (${data.skipped} skipped)` : ''}`);
      setSelectedPieceIds(new Set());
      await fetchQuote();
      triggerRecalculate();
    } catch {
      toast.error('Failed to update edges');
    }
  }, [selectedPieceIds, quoteIdStr, fetchQuote, triggerRecalculate]);

  const handleBatchMove = useCallback(async (targetRoomId: number | null, newRoomName?: string) => {
    const pieceIds = Array.from(selectedPieceIds).map(Number);
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieceIds,
          ...(targetRoomId ? { targetRoomId } : { newRoomName }),
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Moved ${data.moved} pieces`);
      setSelectedPieceIds(new Set());
      await fetchQuote();
    } catch {
      toast.error('Failed to move pieces');
    }
  }, [selectedPieceIds, quoteIdStr, fetchQuote]);

  const handleBatchDelete = useCallback(async () => {
    const pieceIds = Array.from(selectedPieceIds).map(Number);
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-delete`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieceIds }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      toast.success(`Deleted ${data.deleted} pieces`);
      setSelectedPieceIds(new Set());
      setSelectedPieceId(null);
      await fetchQuote();
      triggerRecalculate();
    } catch {
      toast.error('Failed to delete pieces');
    }
  }, [selectedPieceIds, quoteIdStr, fetchQuote, triggerRecalculate]);

  // Ctrl+A handler for selecting all pieces in view
  useEffect(() => {
    if (mode !== 'edit') return;
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        // Only intercept if not in an input/textarea
        const active = document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')) return;
        e.preventDefault();
        const allIds = new Set(pieces.map(p => String(p.id)));
        setSelectedPieceIds(allIds);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [mode, pieces]);

  // ── Keyboard shortcuts (Ctrl+Z / Ctrl+Shift+Z wired to undo/redo) ──────
  const selectedPieceIdStr = selectedPieceId ? String(selectedPieceId) : null;
  const roomPieceIds = useMemo(
    () => {
      if (!selectedPieceId) return [] as string[];
      const room = rooms.find(r => r.pieces.some(p => p.id === selectedPieceId));
      return room ? room.pieces.map(p => String(p.id)) : [];
    },
    [selectedPieceId, rooms]
  );

  useQuoteKeyboardShortcuts({
    selectedPieceId: selectedPieceIdStr,
    mode,
    roomPieceIds,
    onSelectPiece: (pieceId) => {
      if (pieceId) {
        setSelectedPieceId(Number(pieceId));
        setSidebarOpen(true);
      } else {
        setSelectedPieceId(null);
      }
    },
    onEditPiece: (pieceId) => {
      setSelectedPieceId(Number(pieceId));
      setSidebarOpen(true);
    },
    onDuplicatePiece: (pieceId) => handleDuplicatePiece(Number(pieceId)),
    onDeletePiece: (pieceId) => handleDeletePiece(Number(pieceId)),
    onAddNewPiece: () => handleAddPiece(),
    onEscape: () => {
      if (selectedPieceIds.size > 0) {
        setSelectedPieceIds(new Set());
      } else {
        setSelectedPieceId(null);
        setSidebarOpen(false);
      }
    },
    onUndo: undo,
    onRedo: redo,
  });

  // ── Context menu handlers ──────────────────────────────────────────────────

  const handleContextMenu = useCallback((pieceId: string, position: { x: number; y: number }) => {
    const piece = effectivePieces.find(p => p.id === Number(pieceId));
    setContextMenu({
      isOpen: true,
      pieceId,
      pieceName: piece?.name || `Piece #${pieceId}`,
      position,
    });
  }, [pieces]);

  const handleCloseContextMenu = useCallback(() => {
    setContextMenu(prev => ({ ...prev, isOpen: false }));
  }, []);

  const handleContextMenuMovePiece = useCallback(async (pieceId: string, roomId: string) => {
    try {
      if (roomId === '__new__') {
        const name = prompt('New room name:');
        if (!name) return;
        const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pieceIds: [Number(pieceId)], newRoomName: name }),
        });
        if (!res.ok) throw new Error();
        toast.success('Piece moved to new room');
      } else {
        const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/bulk-move`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pieceIds: [Number(pieceId)], targetRoomId: Number(roomId) }),
        });
        if (!res.ok) throw new Error();
        toast.success('Piece moved');
      }
      await fetchQuote();
      triggerRecalculate();
      markAsChanged();
    } catch {
      toast.error('Failed to move piece');
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate, markAsChanged]);

  const handleContextMenuQuickEdgeAll = useCallback(async (pieceId: string, profileId: string | null) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          edgeTop: profileId,
          edgeBottom: profileId,
          edgeLeft: profileId,
          edgeRight: profileId,
        }),
      });
      if (!res.ok) throw new Error();
      toast.success('All edges updated');
      await fetchQuote();
      triggerRecalculate();
      markAsChanged();
    } catch {
      toast.error('Failed to update edges');
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate, markAsChanged]);

  // Quick View: PATCH piece edges/cutouts when changed via MiniPieceEditor
  const handleQuickViewPieceUpdate = useCallback(async (
    pieceId: number,
    updates: { edgeTop?: string | null; edgeBottom?: string | null; edgeLeft?: string | null; edgeRight?: string | null; cutouts?: Array<{ name: string; quantity: number }> },
  ) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error();
      await fetchQuote();
      triggerRecalculate();
      markAsChanged();
    } catch {
      toast.error('Failed to update piece');
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate, markAsChanged]);

  const handleContextMenuChangeMaterial = useCallback(async (pieceId: string, materialId: number | null) => {
    try {
      const res = await fetch(`/api/quotes/${quoteIdStr}/pieces/${pieceId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId }),
      });
      if (!res.ok) throw new Error();
      toast.success('Material updated');
      await fetchQuote();
      triggerRecalculate();
      markAsChanged();
    } catch {
      toast.error('Failed to change material');
    }
  }, [quoteIdStr, fetchQuote, triggerRecalculate, markAsChanged]);

  // ── Derived state ─────────────────────────────────────────────────────────

  const selectedPiece = selectedPieceId
    ? effectivePieces.find(p => p.id === selectedPieceId) ?? null
    : null;

  const roomNames: string[] = Array.from(new Set(rooms.map(r => r.name)));

  // Inline edit data bundle for PieceRow inline editor
  const inlineEditData = {
    materials,
    edgeTypes,
    cutoutTypes,
    thicknessOptions,
    roomNames,
    pieceSuggestions,
    roomSuggestions,
  };

  // Pieces formatted for RelationshipEditor dropdown
  const allPiecesForRelationships = useMemo(
    () => effectivePieces.map(p => ({
      id: String(p.id),
      description: p.name || 'Unnamed Piece',
      piece_type: null as string | null,
      room_name: p.quote_rooms?.name ?? null,
    })),
    [effectivePieces]
  );

  // View-mode relationships derived from server data (no extra API call needed)
  const viewRelationships = useMemo<PieceRelationshipData[]>(() => {
    const rels: PieceRelationshipData[] = [];
    const seen = new Set<number>();
    for (const room of serverData.quote_rooms ?? []) {
      for (const piece of room.quote_pieces) {
        for (const sr of piece.sourceRelationships ?? []) {
          if (!seen.has(sr.id)) {
            seen.add(sr.id);
            rels.push({
              id: String(sr.id),
              parentPieceId: String(sr.source_piece_id),
              childPieceId: String(sr.target_piece_id),
              relationshipType: (sr.relationship_type || sr.relation_type) as RelationshipType,
              joinPosition: sr.side,
              notes: null,
            });
          }
        }
      }
    }
    return rels;
  }, [serverData]);

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

  // Calculated total for header
  const headerTotal = calculation
    ? calculation.total * 1.1  // Include GST
    : null;

  // Read-only status check — quotes in these statuses cannot be edited
  const READ_ONLY_STATUSES = ['sent', 'accepted', 'in_production', 'completed', 'archived'];
  const isStatusReadOnly = READ_ONLY_STATUSES.includes(displayStatus.toLowerCase());
  const editDisabledMessage = isStatusReadOnly
    ? 'This quote has been sent. Create a revision to make changes.'
    : undefined;

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

          {/* Contact Picker — only when customer is selected */}
          {editQuote.customer && (
            <div className="mt-4">
              <ContactPicker
                customerId={editQuote.customer.id}
                selectedContactId={editQuote.contact_id}
                onContactChange={handleContactChange}
              />
            </div>
          )}

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
            {serverData.contact && (
              <div className="mt-1">
                <p className="text-sm text-gray-600">
                  {serverData.contact.first_name} {serverData.contact.last_name}
                  {serverData.contact.role_title
                    ? ` — ${serverData.contact.role_title}`
                    : serverData.contact.role !== 'OTHER'
                      ? ` — ${serverData.contact.role.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).toLowerCase().replace(/^\w/, (c: string) => c.toUpperCase())}`
                      : ''}
                </p>
                {(serverData.contact.email || serverData.contact.phone || serverData.contact.mobile) && (
                  <p className="text-xs text-gray-400">
                    {[serverData.contact.email, serverData.contact.phone || serverData.contact.mobile].filter(Boolean).join('  |  ')}
                  </p>
                )}
              </div>
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
      <button onClick={handleDownloadPdf} disabled={downloadingPdf} className="btn-secondary flex items-center gap-2">
        {downloadingPdf ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </>
        )}
      </button>
      <Link href={`/quotes/${quoteId}/print`} target="_blank" className="btn-secondary flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print
      </Link>
      <button onClick={handleDuplicateQuote} className="btn-secondary flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
        Duplicate
      </button>
      {['locked', 'accepted', 'in_production'].includes(serverData.status.toLowerCase()) && (
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
    <>
      <QuoteActions
        quoteId={quoteIdStr}
        quoteStatus={editQuote.status}
        calculation={calculation}
        onSave={handleSaveQuote}
        onStatusChange={handleStatusChange}
        onDuplicateQuote={handleDuplicateQuote}
        saving={saving}
      />
      <button onClick={handleDownloadPdf} disabled={downloadingPdf} className="btn-secondary flex items-center gap-2">
        {downloadingPdf ? (
          <>
            <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Generating...
          </>
        ) : (
          <>
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            Download PDF
          </>
        )}
      </button>
      <Link href={`/quotes/${quoteId}/print`} target="_blank" className="btn-secondary flex items-center gap-2">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
        </svg>
        Print
      </Link>
    </>
  ) : null;

  // ── View-mode content ─────────────────────────────────────────────────────

  const analysisResults = serverData.quote_drawing_analyses?.raw_results;

  const renderViewContent = () => {
    // ── Stacked one-page layout (12.J1) — all sections visible, no tabs ──

    return (
      <div className="space-y-6">

        {/* ── MATERIAL — above pieces (12.J1: "first pick your stone") ── */}
        {viewCalculation?.breakdown?.materials && (
          <div id="material-section" className="card p-4 space-y-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
              Material
            </h3>
            <MaterialCostSection
              materials={viewCalculation.breakdown.materials}
              pieceCount={serverData.quote_rooms.reduce((sum, r) => sum + r.quote_pieces.length, 0)}
              mode="view"
            />
          </div>
        )}

        {/* ── PIECES BY ROOM — with per-room spatial view toggle ── */}
        <div className="card">
          <div className="p-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold">Pieces</h2>
          </div>
          <div className="p-4 space-y-2">
            {(() => {
              const viewBreakdownMap = new Map<number, import('@/lib/types/pricing').PiecePricingBreakdown>();
              if (viewCalculation?.breakdown?.pieces) {
                for (const pb of viewCalculation.breakdown.pieces as import('@/lib/types/pricing').PiecePricingBreakdown[]) {
                  viewBreakdownMap.set(pb.pieceId, pb);
                }
              }

              const allViewPieces = (serverData.quote_rooms ?? []).flatMap(room =>
                room.quote_pieces.map(piece => ({
                  ...piece,
                  roomName: room.name,
                  roomId: room.id,
                }))
              );

              const renderViewPieceCard = (piece: typeof allViewPieces[0], pieceNumber: number) => {
                const pb = viewBreakdownMap.get(piece.id);
                return (
                  <PieceRow
                    key={piece.id}
                    pieceNumber={pieceNumber}
                    piece={{
                      id: piece.id,
                      name: piece.name || 'Unnamed piece',
                      description: piece.description,
                      lengthMm: piece.length_mm,
                      widthMm: piece.width_mm,
                      thicknessMm: piece.thickness_mm,
                      materialName: piece.materials?.name || piece.material_name || null,
                      edgeTop: piece.edge_top ?? null,
                      edgeBottom: piece.edge_bottom ?? null,
                      edgeLeft: piece.edge_left ?? null,
                      edgeRight: piece.edge_right ?? null,
                      roomName: piece.roomName,
                    }}
                    breakdown={pb}
                    mode="view"
                    onExpand={(pieceId) => {
                      window.open(`/quotes/${quoteId}/pieces/${pieceId}`, '_blank');
                    }}
                  />
                );
              };

              if (allViewPieces.length === 0) {
                return <p className="text-center text-gray-500 py-8">No pieces in this quote</p>;
              }

              let viewGlobalIndex = 0;
              const viewRooms = serverData.quote_rooms ?? [];
              const assignedRoomIds = new Set(viewRooms.map(r => r.id));
              const unassignedViewPieces = allViewPieces.filter(p => !assignedRoomIds.has(p.roomId));
              return (
                <>
                  {viewRooms.map(room => {
                    const roomPieces = allViewPieces.filter(p => p.roomId === room.id);
                    if (roomPieces.length === 0) return null;
                    const isCollapsed = collapsedRooms.has(room.id);
                    const isSpatialOpen = spatialExpandedRooms.has(room.id);
                    const roomPieceIds = new Set(room.quote_pieces.map(p => String(p.id)));
                    return (
                      <div key={room.id} className="space-y-2">
                        <div
                          className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleRoomCollapse(room.id)}
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className={`h-4 w-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <h3 className="text-sm font-semibold text-gray-800">
                              {room.name}
                            </h3>
                            <span className="text-xs text-gray-500">
                              ({roomPieces.length} piece{roomPieces.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleSpatialView(room.id); }}
                            className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                              isSpatialOpen
                                ? 'bg-blue-100 text-blue-700'
                                : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                            }`}
                          >
                            Spatial
                          </button>
                        </div>
                        {/* Per-room spatial view (toggled, default collapsed — 12.J1 §2.7) */}
                        {isSpatialOpen && (
                          <RoomSpatialView
                            roomName={room.name || 'Unassigned'}
                            pieces={room.quote_pieces.map(p => ({
                              id: p.id,
                              description: p.description,
                              name: p.name,
                              length_mm: p.length_mm,
                              width_mm: p.width_mm,
                              thickness_mm: p.thickness_mm,
                              piece_type: null as string | null,
                              area_sqm: p.area_sqm,
                              total_cost: p.total_cost,
                              edge_top: p.edge_top,
                              edge_bottom: p.edge_bottom,
                              edge_left: p.edge_left,
                              edge_right: p.edge_right,
                              piece_features: p.piece_features,
                            }))}
                            relationships={viewRelationships.filter(r =>
                              roomPieceIds.has(r.parentPieceId) || roomPieceIds.has(r.childPieceId)
                            )}
                            mode="view"
                            selectedPieceId={null}
                            onPieceSelect={(pieceId) => {
                              const el = document.getElementById(`piece-${pieceId}`);
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            roomTotal={room.quote_pieces.reduce((sum, p) => sum + (p.total_cost || 0), 0)}
                            roomNotes={room.notes}
                          />
                        )}
                        {!isCollapsed && (
                          <div className="space-y-2">
                            {roomPieces.map(p => {
                              viewGlobalIndex++;
                              return renderViewPieceCard(p, viewGlobalIndex);
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {unassignedViewPieces.length > 0 && (
                    <div className="space-y-2">
                      <div
                        className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
                        onClick={() => toggleRoomCollapse(-1)}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={`h-4 w-4 text-amber-600 transition-transform ${collapsedRooms.has(-1) ? '' : 'rotate-90'}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <h3 className="text-sm font-semibold text-amber-800">
                            Unassigned
                          </h3>
                          <span className="text-xs text-amber-600">
                            ({unassignedViewPieces.length} piece{unassignedViewPieces.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                      </div>
                      {!collapsedRooms.has(-1) && (
                        <div className="space-y-2">
                          {unassignedViewPieces.map(p => {
                            viewGlobalIndex++;
                            return renderViewPieceCard(p, viewGlobalIndex);
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>

        {/* Open Full Job View in New Tab */}
        {serverData.quote_rooms.some(r => r.quote_pieces.length > 0) && (
          <div className="flex justify-end">
            <a
              href={`/quotes/${quoteIdStr}/job-view`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Full Job View in New Tab
            </a>
          </div>
        )}

        {/* ── DELIVERY & INSTALL ── */}
        {/* Quote-Level Cost Sections (view mode) */}
        {viewCalculation && (
          <div id="quote-level-charges" className="card p-4">
            <QuoteLevelCostSections
              calculation={viewCalculation}
              mode="view"
            />
          </div>
        )}

        {/* ── PRICING SUMMARY — always visible ── */}
        {/* Machine Operations */}
        <MachineOperationsAccordion
          quoteId={quoteIdStr}
          pieces={(serverData.quote_rooms ?? []).flatMap(room =>
            room.quote_pieces.map(p => ({ id: p.id }))
          )}
          mode="view"
        />

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

        {/* ── COLLAPSIBLE SECONDARY SECTIONS (bottom — 12.J1 §2.5) ── */}

        {/* Slab Optimiser — collapsed by default */}
        <details className="card overflow-hidden group/details">
          <summary className="p-4 cursor-pointer flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-sm text-gray-700">
            <svg className="h-4 w-4 text-gray-500 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Slab Optimiser
          </summary>
          <div className="p-4 border-t border-gray-200">
            <OptimizationDisplay
              quoteId={quoteIdStr}
              refreshKey={0}
              isOptimising={false}
              hasPieces={serverData.quote_rooms.some(r => r.quote_pieces.length > 0)}
              hasMaterial={serverData.quote_rooms.some(r => r.quote_pieces.some(p => !!p.material_name))}
            />
          </div>
        </details>

        {/* Drawings — collapsed by default, at the BOTTOM (12.J1: "move drawings to the bottom") */}
        <details className="card overflow-hidden group/details">
          <summary className="p-4 cursor-pointer flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-sm text-gray-700">
            <svg className="h-4 w-4 text-gray-500 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Drawings
          </summary>
          <div className="p-4 border-t border-gray-200 space-y-4">
            <DrawingsAccordion quoteId={quoteIdStr} refreshKey={drawingsRefreshKey} />
            {/* Drawing Analysis Section */}
            {serverData.quote_drawing_analyses && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-sm font-semibold">Drawing Analysis</h3>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-gray-500">
                      Analysed {formatDate(serverData.quote_drawing_analyses.analyzed_at)}
                    </span>
                    <SaveAsTemplateButton
                      analysisId={serverData.quote_drawing_analyses.id}
                      defaultName={serverData.project_name || undefined}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
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
                </div>
                {analysisResults?.rooms && analysisResults.rooms.length > 0 && (
                  <div className="space-y-2">
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
                                {piece.length} x {piece.width}mm
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </details>

        {/* Version History — collapsed by default */}
        <details className="card overflow-hidden group/details">
          <summary className="p-4 cursor-pointer flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-sm text-gray-700">
            <svg className="h-4 w-4 text-gray-500 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Version History
          </summary>
          <div className="p-4 border-t border-gray-200">
            <VersionHistoryTab quoteId={quoteId} />
          </div>
        </details>

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

    // ── Stacked one-page layout (12.J1) — all sections visible, no tabs ──
    // Build a breakdown map for quick lookup
    const breakdownMap = new Map<number, import('@/lib/types/pricing').PiecePricingBreakdown>();
    if (calculation?.breakdown?.pieces) {
      for (const pb of calculation.breakdown.pieces as import('@/lib/types/pricing').PiecePricingBreakdown[]) {
        breakdownMap.set(pb.pieceId, pb);
      }
    }

    const renderEditPieceCard = (p: QuotePiece, pieceNumber: number) => {
      const pb = breakdownMap.get(p.id);
      const pieceOverride = activeOverrideMap.get(p.id);
      const isNonBaseOption = quoteOptions.activeOption && !quoteOptions.activeOption.isBase;
      return (
        <div key={p.id}>
          <PieceRow
            pieceNumber={pieceNumber}
            piece={{
              id: p.id,
              name: p.name,
              description: p.description,
              lengthMm: p.lengthMm,
              widthMm: p.widthMm,
              thicknessMm: p.thicknessMm,
              materialName: p.materialName,
              edgeTop: p.edgeTop,
              edgeBottom: p.edgeBottom,
              edgeLeft: p.edgeLeft,
              edgeRight: p.edgeRight,
              roomName: p.quote_rooms?.name,
            }}
            breakdown={pb}
            machines={machines}
            machineOperationDefaults={machineOperationDefaults}
            mode="edit"
            onMachineChange={(_pieceId, operationType, machineId) => {
              handleMachineOverride(operationType, machineId);
            }}
            fullPiece={{
              id: p.id,
              name: p.name,
              lengthMm: p.lengthMm,
              widthMm: p.widthMm,
              thicknessMm: p.thicknessMm,
              materialId: p.materialId,
              materialName: p.materialName,
              edgeTop: p.edgeTop,
              edgeBottom: p.edgeBottom,
              edgeLeft: p.edgeLeft,
              edgeRight: p.edgeRight,
              cutouts: p.cutouts || [],
              quote_rooms: p.quote_rooms,
            }}
            editData={inlineEditData}
            onSavePiece={handleInlineSavePiece}
            savingPiece={saving}
            onDelete={handleDeletePiece}
            onDuplicate={handleDuplicatePiece}
            quoteId={quoteId}
            onBulkEdgeApply={handleBulkEdgeApply}
            onBatchEdgeUpdate={handleBatchEdgeUpdate}
            onExpand={(pieceId) => {
              window.open(`/quotes/${quoteId}/pieces/${pieceId}?mode=edit`, '_blank');
            }}
            relationships={relationships}
            allPiecesForRelationships={allPiecesForRelationships}
            quoteIdStr={quoteIdStr}
            onRelationshipChange={fetchRelationships}
          />
          {/* Override indicator + actions for non-base options */}
          {isNonBaseOption && (
            <div className="flex items-center gap-2 px-3 pb-1">
              {pieceOverride ? (
                <PieceOverrideIndicator
                  override={pieceOverride}
                  onResetToBase={() => {
                    quoteOptions.removeOverride(quoteOptions.activeOptionId!, pieceOverride.id);
                  }}
                  mode="edit"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setShowOverrideEditor(p.id)}
                  className="text-xs text-gray-400 hover:text-orange-500 transition-colors"
                >
                  + Override for this option
                </button>
              )}
              {pieceOverride && (
                <button
                  type="button"
                  onClick={() => setShowOverrideEditor(p.id)}
                  className="text-xs text-gray-400 hover:text-primary-500 transition-colors underline"
                >
                  Edit override
                </button>
              )}
            </div>
          )}
        </div>
      );
    };

    return (
      <div className="space-y-6">

        {/* ── MATERIAL — above pieces (12.J1: "first pick your stone") ── */}
        {calculation?.breakdown?.materials && (
          <div id="material-section" className="card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
                Material
              </h3>
              <button
                onClick={() => setShowBulkSwap(!showBulkSwap)}
                className={`px-3 py-1 text-xs font-medium border rounded-md transition-colors ${
                  showBulkSwap ? 'bg-orange-100 border-orange-300 text-orange-700' : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                }`}
              >
                Bulk Swap
              </button>
            </div>
            {showBulkSwap && (
              <BulkMaterialSwap
                pieces={effectivePieces.map(p => ({
                  id: p.id,
                  name: p.name,
                  lengthMm: p.lengthMm,
                  widthMm: p.widthMm,
                  materialId: p.materialId,
                  materialName: p.materialName,
                  materialCost: Number(breakdownMap.get(p.id)?.materials?.total ?? 0),
                  roomName: p.quote_rooms?.name ?? null,
                }))}
                materials={materials}
                selectedPieceIds={selectedPieceIds}
                onApply={handleBulkMaterialApply}
                onClose={() => setShowBulkSwap(false)}
                quoteTotal={calculation?.total ?? null}
              />
            )}
            <MaterialCostSection
              materials={calculation.breakdown.materials}
              pieceCount={effectivePieces.length}
              mode="edit"
              materialMarginAdjustPercent={
                Number(quoteOptions.activeOption?.material_margin_adjust_percent ?? 0)
              }
              onMarginAdjustChange={(percent) => {
                if (quoteOptions.activeOption) {
                  quoteOptions.updateMarginAdjustment(quoteOptions.activeOption.id, percent);
                }
              }}
            />
          </div>
        )}

        {/* Option Tabs — only shown when options exist */}
        {hasOptions && (
          <OptionTabsBar
            options={quoteOptions.options}
            activeOptionId={quoteOptions.activeOptionId}
            onSelectOption={quoteOptions.setActiveOptionId}
            onAddOption={() => setShowCreateOptionDialog(true)}
            onDeleteOption={quoteOptions.deleteOption}
            isRecalculating={quoteOptions.isRecalculating}
            mode="edit"
          />
        )}

        {/* Pieces Card — unified PieceRow cards (12.J1: rooms + detailed as default, no toggles) */}
        <div className="card">
          <div ref={actionBarRef} className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Pieces</h2>
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
              <button
                onClick={() => setShowFromTemplate(true)}
                className="btn-secondary text-sm flex items-center gap-1"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" />
                </svg>
                From Template
              </button>
              {!hasOptions && (
                <button
                  onClick={() => setShowCreateOptionDialog(true)}
                  className="btn-secondary text-sm"
                  title="Add quote option for material comparison"
                >
                  + Add Option
                </button>
              )}
              <button
                onClick={() => setIsAddingRoom(true)}
                className="btn-secondary text-sm"
              >
                + Add Room
              </button>
              <button onClick={() => handleAddPiece()} className="btn-primary text-sm">
                + Add Piece
              </button>
            </div>
          </div>

          {/* Inline Add Room Form */}
          {isAddingRoom && (
            <div className="border-b border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">Add New Room</h3>
              <div className="flex items-center gap-2 mb-2">
                <input
                  type="text"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newRoomName.trim()) handleCreateRoom(newRoomName);
                    if (e.key === 'Escape') { setIsAddingRoom(false); setNewRoomName(''); }
                  }}
                  placeholder="Enter room name"
                  className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 w-64"
                  autoFocus
                />
                <button
                  onClick={() => handleCreateRoom(newRoomName)}
                  disabled={!newRoomName.trim() || saving}
                  className="px-3 py-1.5 text-sm font-medium bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  Add
                </button>
                <button
                  onClick={() => { setIsAddingRoom(false); setNewRoomName(''); }}
                  className="px-3 py-1.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {['Kitchen', 'Bathroom', 'Ensuite', 'Laundry', 'Study', 'Walk-in Pantry', 'Butler\'s Pantry', 'Powder Room'].map(suggestion => {
                  const alreadyExists = roomNames.includes(suggestion);
                  return (
                    <button
                      key={suggestion}
                      onClick={() => {
                        if (!alreadyExists) {
                          setNewRoomName(suggestion);
                        }
                      }}
                      disabled={alreadyExists}
                      className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                        alreadyExists
                          ? 'border-gray-200 text-gray-400 cursor-not-allowed bg-gray-50'
                          : newRoomName === suggestion
                          ? 'border-primary-500 bg-primary-50 text-primary-700'
                          : 'border-gray-300 text-gray-600 hover:border-primary-400 hover:bg-primary-50 cursor-pointer'
                      }`}
                    >
                      {suggestion}{alreadyExists ? ' (exists)' : ''}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Inline Add Piece Editor */}
          {addingInlinePiece && (
            <div ref={addPieceRef} className="border-b border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Add New Piece{addingInlinePieceRoom ? ` to ${addingInlinePieceRoom}` : ''}
              </h3>
              <InlinePieceEditor
                piece={{
                  id: 0,
                  name: '',
                  lengthMm: 1000,
                  widthMm: 600,
                  thicknessMm: 20,
                  materialId: null,
                  materialName: null,
                  edgeTop: null,
                  edgeBottom: null,
                  edgeLeft: null,
                  edgeRight: null,
                  cutouts: [],
                  quote_rooms: { id: 0, name: addingInlinePieceRoom || roomNames[0] || 'Kitchen' },
                } as InlinePieceData}
                materials={materials}
                edgeTypes={edgeTypes}
                cutoutTypes={cutoutTypes}
                thicknessOptions={thicknessOptions}
                roomNames={roomNames}
                onSave={handleInlineSavePiece}
                saving={saving}
                isNew
                onCancel={() => { setAddingInlinePiece(false); setAddingInlinePieceRoom(null); }}
                pieceSuggestions={pieceSuggestions}
                roomSuggestions={roomSuggestions}
              />
            </div>
          )}

          {/* Unified piece cards — rooms + detailed view (12.J1: default, no toggles) */}
          <div className="p-4 space-y-2">
            {(() => {
              if (effectivePieces.length === 0 && rooms.length === 0) {
                return (
                  <div className="py-8 text-center text-gray-500">
                    <p className="mb-2">No pieces added yet</p>
                    <p className="text-sm">Click &quot;Add Piece&quot; to start building your quote</p>
                  </div>
                );
              }
              let globalIndex = 0;
              const unassignedPieces = effectivePieces.filter(p => !p.quote_rooms?.id || !rooms.some(r => r.id === p.quote_rooms?.id));
              return (
                <>
                  {rooms.map(room => {
                    const roomPieces = effectivePieces.filter(p => p.quote_rooms?.id === room.id);
                    const isCollapsed = collapsedRooms.has(room.id);
                    const isSpatialOpen = spatialExpandedRooms.has(room.id);
                    const spatialRoomPieces = roomPieces.map(p => ({
                      id: p.id,
                      description: p.description,
                      name: p.name,
                      length_mm: p.lengthMm,
                      width_mm: p.widthMm,
                      thickness_mm: p.thicknessMm,
                      piece_type: null as string | null,
                      area_sqm: (p.lengthMm * p.widthMm) / 1_000_000,
                      total_cost: p.totalCost,
                      edge_top: p.edgeTop,
                      edge_bottom: p.edgeBottom,
                      edge_left: p.edgeLeft,
                      edge_right: p.edgeRight,
                      piece_features: p.cutouts?.map(c => ({
                        id: 0,
                        name: c.cutoutTypeId,
                        quantity: c.quantity,
                      })),
                    }));
                    const roomPieceIds = new Set(spatialRoomPieces.map(p => String(p.id)));
                    return (
                      <div key={room.id} className="space-y-2">
                        {/* Room header — collapsible */}
                        <div
                          className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg border border-gray-200 cursor-pointer hover:bg-gray-100 transition-colors"
                          onClick={() => toggleRoomCollapse(room.id)}
                        >
                          <div className="flex items-center gap-2">
                            <svg
                              className={`h-4 w-4 text-gray-500 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
                              fill="none" viewBox="0 0 24 24" stroke="currentColor"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                            </svg>
                            <h3 className="text-sm font-semibold text-gray-800">
                              {room.name}
                            </h3>
                            <span className="text-xs text-gray-500">
                              ({roomPieces.length} piece{roomPieces.length !== 1 ? 's' : ''})
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            {/* Spatial view toggle (12.J1 §2.7) */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleSpatialView(room.id); }}
                              className={`text-xs font-medium px-2 py-1 rounded transition-colors ${
                                isSpatialOpen
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'text-gray-500 hover:text-blue-600 hover:bg-blue-50'
                              }`}
                            >
                              Spatial
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAddPiece(room.name); }}
                              className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded transition-colors"
                            >
                              + Add Piece
                            </button>
                          </div>
                        </div>
                        {/* Per-room spatial view (toggled, default collapsed — 12.J1 §2.7) */}
                        {isSpatialOpen && (
                          <RoomSpatialView
                            roomName={room.name || 'Unassigned'}
                            pieces={spatialRoomPieces}
                            relationships={relationships.filter(r =>
                              roomPieceIds.has(r.parentPieceId) || roomPieceIds.has(r.childPieceId)
                            )}
                            mode="edit"
                            selectedPieceId={selectedPieceId != null ? String(selectedPieceId) : null}
                            onPieceSelect={(pieceId) => {
                              setSelectedPieceId(Number(pieceId));
                              setSelectedPieceIds(new Set());
                              const el = document.getElementById(`piece-${pieceId}`);
                              if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                            roomTotal={spatialRoomPieces.reduce((sum, p) => sum + (p.total_cost || 0), 0)}
                            quoteId={quoteIdStr}
                            onRelationshipChange={fetchRelationships}
                            roomId={room.id}
                            allRooms={rooms.map(r => ({ id: r.id, name: r.name, sortOrder: r.sortOrder }))}
                            onRoomRename={handleRoomRename}
                            onRoomMoveUp={handleRoomMoveUp}
                            onRoomMoveDown={handleRoomMoveDown}
                            onRoomMerge={handleRoomMerge}
                            onRoomDelete={handleRoomDelete}
                            onAddRoomBelow={handleAddRoomBelow}
                            onAddPiece={handleAddPieceToRoom}
                            roomNotes={room.notes}
                            onRoomNotesChange={handleRoomNotesChange}
                            selectedPieceIds={selectedPieceIds}
                            onPieceMultiSelect={handlePieceMultiSelect}
                            onContextMenu={handleContextMenu}
                            edgeProfiles={edgeTypes.map(e => ({ id: e.id, name: e.name }))}
                            onPieceEdgeChange={handlePieceEdgeChange}
                            cutoutTypes={cutoutTypes}
                            onBatchEdgeUpdate={handleBatchEdgeUpdate}
                          />
                        )}
                        {/* Room pieces (hidden when collapsed) */}
                        {!isCollapsed && (
                          roomPieces.length > 0 ? (
                            <div className="space-y-2">
                              {roomPieces.map(p => {
                                globalIndex++;
                                return renderEditPieceCard(p, globalIndex);
                              })}
                            </div>
                          ) : (
                            <div className="py-4 text-center text-gray-400 text-sm border border-dashed border-gray-200 rounded-lg">
                              No pieces yet. Click &quot;+ Add Piece&quot; above to add one.
                            </div>
                          )
                        )}
                      </div>
                    );
                  })}
                  {/* Unassigned pieces */}
                  {unassignedPieces.length > 0 && (
                    <div className="space-y-2">
                      <div
                        className="flex items-center justify-between px-3 py-2 bg-amber-50 rounded-lg border border-amber-200 cursor-pointer hover:bg-amber-100 transition-colors"
                        onClick={() => toggleRoomCollapse(-1)}
                      >
                        <div className="flex items-center gap-2">
                          <svg
                            className={`h-4 w-4 text-amber-600 transition-transform ${collapsedRooms.has(-1) ? '' : 'rotate-90'}`}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                          </svg>
                          <h3 className="text-sm font-semibold text-amber-800">
                            Unassigned
                          </h3>
                          <span className="text-xs text-amber-600">
                            ({unassignedPieces.length} piece{unassignedPieces.length !== 1 ? 's' : ''})
                          </span>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); handleAddPiece(); }}
                          className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:bg-primary-50 px-2 py-1 rounded transition-colors"
                        >
                          + Add Piece
                        </button>
                      </div>
                      {!collapsedRooms.has(-1) && (
                        <div className="space-y-2">
                          {unassignedPieces.map(p => {
                            globalIndex++;
                            return renderEditPieceCard(p, globalIndex);
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </>
              );
            })()}
          </div>

        </div>

        {/* Open Full Job View in New Tab */}
        {effectivePieces.length > 0 && (
          <div className="flex justify-end">
            <a
              href={`/quotes/${quoteId}/job-view`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              Open Full Job View in New Tab
            </a>
          </div>
        )}

        {/* ── DELIVERY & INSTALL ── */}
        {calculation && (
          <div id="quote-level-charges" className="card p-4">
            <QuoteLevelCostSections
              calculation={calculation}
              mode="edit"
              deliveryEnabled={deliveryEnabled}
              onDeliveryEnabledChange={handleDeliveryEnabledChange}
            />
          </div>
        )}

        {/* Machine Operations */}
        <MachineOperationsAccordion
          quoteId={quoteIdStr}
          pieces={effectivePieces.map(p => ({ id: p.id }))}
          mode="edit"
        />

        {/* Option Comparison Summary — shown when 2+ options exist */}
        {quoteOptions.options.length >= 2 && (
          <OptionComparisonSummary options={quoteOptions.options} />
        )}

        {/* ── COLLAPSIBLE SECONDARY SECTIONS (bottom — 12.J1 §2.5) ── */}

        {/* Slab Optimiser — collapsed by default */}
        <details className="card overflow-hidden group/details">
          <summary className="p-4 cursor-pointer flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-sm text-gray-700">
            <svg className="h-4 w-4 text-gray-500 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Slab Optimiser
          </summary>
          <div className="p-4 border-t border-gray-200">
            <OptimizationDisplay
              quoteId={quoteIdStr}
              refreshKey={optimisationRefreshKey}
              isOptimising={isOptimising}
              hasPieces={effectivePieces.length > 0}
              hasMaterial={effectivePieces.some(p => !!p.materialId || !!p.materialName)}
              optimiserError={optimiserError}
              onEdgeAllowanceApplied={triggerOptimise}
            />
          </div>
        </details>

        {/* Drawings — collapsed by default, at the BOTTOM (12.J1: "move drawings to the bottom") */}
        <details className="card overflow-hidden group/details">
          <summary className="p-4 cursor-pointer flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-sm text-gray-700">
            <svg className="h-4 w-4 text-gray-500 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Drawings
          </summary>
          <div className="p-4 border-t border-gray-200">
            <DrawingsAccordion quoteId={quoteIdStr} refreshKey={drawingsRefreshKey} />
          </div>
        </details>

        {/* Version History — collapsed by default */}
        <details className="card overflow-hidden group/details">
          <summary className="p-4 cursor-pointer flex items-center gap-2 bg-gray-50 hover:bg-gray-100 transition-colors font-medium text-sm text-gray-700">
            <svg className="h-4 w-4 text-gray-500 transition-transform group-open/details:rotate-90" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Version History
          </summary>
          <div className="p-4 border-t border-gray-200">
            <VersionHistoryTab quoteId={quoteId} />
          </div>
        </details>

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
        {selectedPiece ? (
          <div className="card">
            <div className="p-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold">Edit Piece</h2>
            </div>
            <PieceForm
              piece={selectedPiece}
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
              <span className="font-medium">{effectivePieces.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Total Area:</span>
              <span className="font-medium">
                {formatAreaFromSqm(effectivePieces.reduce((sum, p) => sum + (p.lengthMm * p.widthMm) / 1_000_000, 0), unitSystem)}
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
        quoteId={quoteIdStr}
        projectName={displayProjectName}
        status={displayStatus}
        customerName={displayCustomerName}
        mode={mode}
        onModeChange={handleModeChange}
        calculatedTotal={mode === 'edit' ? headerTotal : null}
        showModeToggle={true}
        saving={mode === 'edit' ? saving : false}
        hasUnsavedChanges={mode === 'edit' ? hasUnsavedChanges : false}
        interactiveStatus={true}
        onStatusChange={handleStatusChange}
        editDisabled={isStatusReadOnly}
        editDisabledMessage={editDisabledMessage}
        canUndo={canUndo}
        canRedo={canRedo}
        undoDescription={undoDescription}
        redoDescription={redoDescription}
        onUndo={undo}
        onRedo={redo}
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

      {/* Quote Cost Summary Bar — scrolls with page */}
      {(mode === 'edit' ? calculation : viewCalculation) && (
        <QuoteCostSummaryBar
          calculation={(mode === 'edit' ? calculation : viewCalculation)!}
        />
      )}

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

      {/* Create Option Dialog */}
      {showCreateOptionDialog && (
        <CreateOptionDialog
          existingOptions={quoteOptions.options}
          onCreateOption={quoteOptions.createOption}
          onClose={() => setShowCreateOptionDialog(false)}
        />
      )}

      {/* Piece Override Editor */}
      {showOverrideEditor !== null && (() => {
        const piece = pieces.find(p => p.id === showOverrideEditor);
        if (!piece || !quoteOptions.activeOptionId) return null;
        const existingOverride = activeOverrideMap.get(piece.id);
        return (
          <PieceOverrideEditor
            piece={{
              id: piece.id,
              name: piece.name,
              materialId: piece.materialId,
              materialName: piece.materialName,
              thicknessMm: piece.thicknessMm,
              edgeTop: piece.edgeTop,
              edgeBottom: piece.edgeBottom,
              edgeLeft: piece.edgeLeft,
              edgeRight: piece.edgeRight,
              lengthMm: piece.lengthMm,
              widthMm: piece.widthMm,
            }}
            existingOverride={existingOverride ? {
              materialId: existingOverride.materialId,
              thicknessMm: existingOverride.thicknessMm,
              edgeTop: existingOverride.edgeTop,
              edgeBottom: existingOverride.edgeBottom,
              edgeLeft: existingOverride.edgeLeft,
              edgeRight: existingOverride.edgeRight,
              lengthMm: existingOverride.lengthMm,
              widthMm: existingOverride.widthMm,
            } : undefined}
            materials={materials}
            edgeTypes={edgeTypes}
            onSave={(overrides) => {
              quoteOptions.setOverrides(quoteOptions.activeOptionId!, [overrides]);
              setShowOverrideEditor(null);
            }}
            onClose={() => setShowOverrideEditor(null)}
          />
        );
      })()}

      {/* From Template Sheet */}
      <FromTemplateSheet
        quoteId={quoteIdStr}
        open={showFromTemplate}
        onClose={() => setShowFromTemplate(false)}
        onApplied={handleTemplateApplied}
      />

      {/* Multi-select floating toolbar — visible when 2+ pieces selected */}
      {mode === 'edit' && selectedPieceIds.size >= 2 && (
        <MultiSelectToolbar
          selectedCount={selectedPieceIds.size}
          rooms={rooms.map(r => ({ id: r.id, name: r.name }))}
          materials={materials.map(m => ({ id: m.id, name: m.name, collection: m.collection }))}
          edgeProfiles={edgeTypes.map(e => ({ id: e.id, name: e.name }))}
          thicknessOptions={thicknessOptions.map(t => ({ id: t.id, name: t.name, value: t.value }))}
          onBatchMaterial={handleBatchMaterial}
          onBatchThickness={handleBatchThickness}
          onBatchEdges={handleBatchEdges}
          onBatchMove={handleBatchMove}
          onBatchDelete={handleBatchDelete}
          onClearSelection={() => setSelectedPieceIds(new Set())}
        />
      )}

      {/* Piece context menu — right-click on pieces in edit mode */}
      <PieceContextMenu
        isOpen={contextMenu.isOpen}
        pieceId={contextMenu.pieceId}
        pieceName={contextMenu.pieceName}
        position={contextMenu.position}
        onClose={handleCloseContextMenu}
        onEdit={(pieceId) => {
          setSelectedPieceId(Number(pieceId));
          setSidebarOpen(true);
          const el = document.getElementById(`piece-${pieceId}`);
          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }}
        onDuplicate={(pieceId) => handleDuplicatePiece(Number(pieceId))}
        onMoveToRoom={handleContextMenuMovePiece}
        onQuickEdgeAll={handleContextMenuQuickEdgeAll}
        onChangeMaterial={handleContextMenuChangeMaterial}
        onAddRelationship={(pieceId) => {
          setSelectedPieceId(Number(pieceId));
          setSidebarOpen(true);
        }}
        onDelete={(pieceId) => handleDeletePiece(Number(pieceId))}
        rooms={rooms.map(r => ({ id: String(r.id), name: r.name }))}
        edgeProfiles={edgeTypes.map(e => ({ id: e.id, name: e.name }))}
        materials={materials.map(m => ({ id: m.id, name: m.name, collection: m.collection }))}
      />

      {/* Floating Action Button — visible when action bar scrolls off-screen */}
      {mode === 'edit' && (
        <FloatingActionButton
          actionBarRef={actionBarRef}
          onImportDrawing={() => setShowDrawingImport(true)}
          onFromTemplate={() => setShowFromTemplate(true)}
          onAddPiece={() => handleAddPiece()}
          onSave={handleSaveQuote}
        />
      )}
    </>
  );
}
