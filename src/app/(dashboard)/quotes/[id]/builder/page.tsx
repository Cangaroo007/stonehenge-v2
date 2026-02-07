'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useUnits } from '@/lib/contexts/UnitContext';
import { formatAreaFromSqm } from '@/lib/utils/units';
import QuoteHeader from './components/QuoteHeader';
import PieceList from './components/PieceList';
import RoomGrouping from './components/RoomGrouping';
import PieceForm from './components/PieceForm';
import PricingSummary from './components/PricingSummary';
import QuoteActions from './components/QuoteActions';
import DrawingImport from './components/DrawingImport';
import { DrawingReferencePanel } from './components/DrawingReferencePanel';
import DeliveryTemplatingCard from './components/DeliveryTemplatingCard';
import { OptimizationDisplay } from './components/OptimizationDisplay';
import { CutoutType, PieceCutout } from './components/CutoutSelector';
import VersionHistoryTab from '@/components/quotes/VersionHistoryTab';
import type { CalculationResult } from '@/lib/types/pricing';

interface MachineOption {
  id: string;
  name: string;
  kerfWidthMm: number;
  isDefault: boolean;
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

interface Quote {
  id: number;
  quoteNumber: string;
  projectName: string | null;
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
  priceBook?: { id: string; name: string } | null;
  rooms: QuoteRoom[];
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

export default function QuoteBuilderPage() {
  const params = useParams();
  const router = useRouter();
  const { unitSystem } = useUnits();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<Quote | null>(null);
  const [pieces, setPieces] = useState<QuotePiece[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [edgeTypes, setEdgeTypes] = useState<EdgeType[]>([]);
  const [cutoutTypes, setCutoutTypes] = useState<CutoutType[]>([]);
  const [thicknessOptions, setThicknessOptions] = useState<ThicknessOption[]>([]);
  const [rooms, setRooms] = useState<QuoteRoom[]>([]);
  const [selectedPieceId, setSelectedPieceId] = useState<number | null>(null);
  const [isAddingPiece, setIsAddingPiece] = useState(false);
  const [loading, setLoading] = useState(true);
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
  const [activeTab, setActiveTab] = useState<'pieces' | 'history'>('pieces');
  const [discountDisplayMode, setDiscountDisplayMode] = useState<'ITEMIZED' | 'TOTAL_ONLY'>('ITEMIZED');
  const { hasUnsavedChanges, markAsChanged, markAsSaved } = useUnsavedChanges();

  // Machine Profile state
  const [machines, setMachines] = useState<MachineOption[]>([]);
  const [defaultMachineId, setDefaultMachineId] = useState<string | null>(null);

  // Trigger recalculation after piece changes
  const triggerRecalculate = useCallback(() => {
    setRefreshTrigger(n => n + 1);
  }, []);

  // Store calculation result for QuoteActions
  const handleCalculationUpdate = useCallback((result: CalculationResult | null) => {
    setCalculation(result);
    calculationRef.current = result;
  }, []);

  // Flatten pieces from all rooms
  const flattenPieces = useCallback((quoteRooms: QuoteRoom[]): QuotePiece[] => {
    return quoteRooms.flatMap(room =>
      quote_rooms.pieces.map(piece => ({
        ...piece,
        quote_rooms: { id: quote_rooms.id, name: quote_rooms.name }
      }))
    ).sort((a, b) => a.sortOrder - b.sortOrder);
  }, []);

  // Fetch quote data
  const fetchQuote = useCallback(async () => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}`);
      if (!response.ok) throw new Error('Failed to fetch quote');
      const data = await response.json();
      setQuote(data);
      setRooms(data.rooms || []);
      setPieces(flattenPieces(data.rooms || []));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quote');
    }
  }, [quoteId, flattenPieces]);

  // Fetch materials
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

  // Fetch edge types
  const fetchEdgeTypes = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/edge-types');
      if (!response.ok) throw new Error('Failed to fetch edge types');
      const data = await response.json();
      // Filter to only active edge types (treat null/undefined as active)
      setEdgeTypes(data.filter((e: EdgeType) => e.isActive !== false));
    } catch (err) {
      console.error('Error fetching edge types:', err);
    }
  }, []);

  // Fetch cutout types
  const fetchCutoutTypes = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/cutout-types');
      if (!response.ok) throw new Error('Failed to fetch cutout types');
      const data = await response.json();
      // Filter to only active cutout types (treat null/undefined as active)
      setCutoutTypes(data.filter((c: CutoutType) => c.isActive !== false));
    } catch (err) {
      console.error('Error fetching cutout types:', err);
    }
  }, []);

  // Fetch thickness options
  const fetchThicknessOptions = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/thickness-options');
      if (!response.ok) throw new Error('Failed to fetch thickness options');
      const data = await response.json();
      // Filter to only active thickness options (treat null/undefined as active)
      setThicknessOptions(data.filter((t: ThicknessOption) => t.isActive !== false));
    } catch (err) {
      console.error('Error fetching thickness options:', err);
    }
  }, []);

  // Fetch machine profiles
  const fetchMachines = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/pricing/machines');
      if (!response.ok) throw new Error('Failed to fetch machines');
      const data = await response.json();
      const activeMachines = data.filter((m: any) => m.isActive !== false);
      setMachines(activeMachines);

      // Identify default machine (used for new pieces)
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

  // Initial load
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchQuote(), fetchMaterials(), fetchEdgeTypes(), fetchCutoutTypes(), fetchThicknessOptions(), fetchMachines()]);
      setLoading(false);
    };
    loadData();
  }, [fetchQuote, fetchMaterials, fetchEdgeTypes, fetchCutoutTypes, fetchThicknessOptions, fetchMachines]);

  // Handle piece selection
  const handleSelectPiece = (pieceId: number) => {
    setIsAddingPiece(false);
    setSelectedPieceId(pieceId === selectedPieceId ? null : pieceId);
  };

  // Handle add piece
  const handleAddPiece = () => {
    setSelectedPieceId(null);
    setIsAddingPiece(true);
  };

  // Handle cancel form
  const handleCancelForm = () => {
    setSelectedPieceId(null);
    setIsAddingPiece(false);
  };

  // Handle piece update (for inline editing)
  const handlePieceUpdate = useCallback(async (pieceId: number, updates: Partial<QuotePiece>) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pieces/${pieceId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to update piece');
      }

      // Update local state optimistically
      setPieces(prev => prev.map(p => 
        p.id === pieceId ? { ...p, ...updates } : p
      ));
      
      // Trigger pricing recalculation
      triggerRecalculate();
      markAsChanged();
    } catch (err) {
      console.error('Failed to update piece:', err);
      // Refresh to get correct state
      await fetchQuote();
    }
  }, [quoteId, triggerRecalculate, markAsChanged, fetchQuote]);

  // Handle save piece
  const handleSavePiece = async (pieceData: Partial<QuotePiece>, roomName: string) => {
    setSaving(true);
    try {
      const isNew = !selectedPieceId;
      const url = isNew
        ? `/api/quotes/${quoteId}/pieces`
        : `/api/quotes/${quoteId}/pieces/${selectedPieceId}`;
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

      // Refresh quote data
      await fetchQuote();
      setSelectedPieceId(null);
      setIsAddingPiece(false);
      // Trigger pricing recalculation
      triggerRecalculate();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save piece');
    } finally {
      setSaving(false);
    }
  };

  // Handle delete piece
  const handleDeletePiece = async (pieceId: number) => {
    if (!confirm('Are you sure you want to delete this piece?')) return;

    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pieces/${pieceId}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete piece');

      // Refresh quote data
      await fetchQuote();
      if (selectedPieceId === pieceId) {
        setSelectedPieceId(null);
      }
      // Trigger pricing recalculation
      triggerRecalculate();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete piece');
    } finally {
      setSaving(false);
    }
  };

  // Handle duplicate piece
  const handleDuplicatePiece = async (pieceId: number) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pieces/${pieceId}/duplicate`, {
        method: 'POST',
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to duplicate piece');
      }

      const newPiece = await response.json();

      // Refresh quote data and select the new piece
      await fetchQuote();
      setSelectedPieceId(newPiece.id);
      setIsAddingPiece(false);
      // Trigger pricing recalculation
      triggerRecalculate();
      markAsChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to duplicate piece');
    } finally {
      setSaving(false);
    }
  };

  // Handle reorder
  const handleReorder = async (reorderedPieces: { id: number; sortOrder: number }[]) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/pieces/reorder`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pieces: reorderedPieces }),
      });

      if (!response.ok) throw new Error('Failed to reorder pieces');

      // Update local state optimistically
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
      // Refresh to get correct order
      await fetchQuote();
    }
  };

  // Save quote with calculation
  const handleSaveQuote = async () => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          saveCalculation: true,
          calculation: calculationRef.current,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save quote');
      }

      await fetchQuote();
      markAsSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save quote');
    } finally {
      setSaving(false);
    }
  };

  // Handle status change
  const handleStatusChange = async (newStatus: string) => {
    setSaving(true);
    try {
      const response = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update status');
      }

      await fetchQuote();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update status');
    } finally {
      setSaving(false);
    }
  };

  // Handle drawing import complete
  const handleImportComplete = useCallback(async (count: number) => {
    setShowDrawingImport(false);
    await fetchQuote();
    triggerRecalculate();
    markAsChanged();
    setImportSuccessMessage(`Imported ${count} piece${count !== 1 ? 's' : ''} from drawing`);
    // Auto-clear success message after 5 seconds
    setTimeout(() => setImportSuccessMessage(null), 5000);
  }, [fetchQuote, triggerRecalculate, markAsChanged]);

  // Handle drawings saved (refresh DrawingReferencePanel)
  const handleDrawingsSaved = useCallback(() => {
    setDrawingsRefreshKey(n => n + 1);
  }, []);

  // Get kerf width for a given piece (based on its assigned machine)
  const getKerfForPiece = useCallback((piece: QuotePiece): number => {
    if (piece.machineProfileId) {
      const machine = machines.find(m => m.id === piece.machineProfileId);
      if (machine) return machine.kerfWidthMm;
    }
    // Fallback to default machine kerf
    const defaultMachine = machines.find(m => m.id === defaultMachineId);
    return defaultMachine?.kerfWidthMm ?? 8;
  }, [machines, defaultMachineId]);

  // Get selected piece
  const selectedPiece = selectedPieceId
    ? pieces.find(p => p.id === selectedPieceId)
    : null;

  // Get unique room names
const roomNames: string[] = Array.from(new Set(rooms.map(r => r.name)));
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (error && !quote) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <Link href="/quotes" className="btn-secondary">
          Back to Quotes
        </Link>
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-600 mb-4">Quote not found</p>
        <Link href="/quotes" className="btn-secondary">
          Back to Quotes
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
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
        <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
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

      {/* Quote Header */}
      <QuoteHeader
        quote={quote}
        onBack={() => router.push(`/quotes/${quoteId}`)}
        saving={saving}
        hasUnsavedChanges={hasUnsavedChanges}
      />

      {/* Quote Actions */}
      <QuoteActions
        quoteId={quoteId}
        quoteStatus={quote.status}
        calculation={calculation}
        onSave={handleSaveQuote}
        onStatusChange={handleStatusChange}
        onOptimizationSaved={() => setOptimizationRefreshKey(n => n + 1)}
        saving={saving}
        kerfWidth={machines.find(m => m.id === defaultMachineId)?.kerfWidthMm ?? 8}
      />

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('pieces')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'pieces'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Pieces & Pricing
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'history'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            <div className="flex items-center gap-2">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              History
            </div>
          </button>
        </nav>
      </div>

      {/* Main Content */}
      {activeTab === 'pieces' ? (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Pieces List - 2 columns on large screens */}
        <div className="lg:col-span-2 space-y-6">
          {/* Optimization Display */}
          <OptimizationDisplay quoteId={quoteId} refreshKey={optimizationRefreshKey} />
          
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
        </div>

        {/* Piece Form / Summary - 1 column on large screens */}
        <div className="lg:col-span-1 space-y-6">
          {/* Drawing Reference Panel */}
          <DrawingReferencePanel quoteId={quoteId} refreshKey={drawingsRefreshKey} />

          {/* Delivery & Templating Card */}
          <DeliveryTemplatingCard
            quoteId={quoteId}
            initialProjectAddress={quote.project_name}
            onUpdate={triggerRecalculate}
          />

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
            quoteId={quoteId}
            refreshTrigger={refreshTrigger}
            customerName={quote.customer?.company || quote.customer?.name}
            customerTier={quote.customer?.client_tiers?.name}
            customerType={quote.customer?.client_types?.name}
            priceBookName={quote.price_books?.name}
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
        </div>
      </div>
      ) : (
        /* History Tab */
        <div className="card">
          <VersionHistoryTab quoteId={parseInt(quoteId)} />
        </div>
      )}

      {/* Drawing Import Modal */}
      {showDrawingImport && quote.customer && (
        <DrawingImport
          quoteId={quoteId}
          customerId={quote.customer.id}
          edgeTypes={edgeTypes}
          onImportComplete={handleImportComplete}
          onDrawingsSaved={handleDrawingsSaved}
          onClose={() => setShowDrawingImport(false)}
        />
      )}
    </div>
  );
}
