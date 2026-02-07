'use client';

import React, { useState, useEffect } from 'react';
import { optimizeSlabs } from '@/lib/services/slab-optimizer';
import { OptimizationResult, OptimizationInput } from '@/types/slab-optimization';
import { SlabResults } from '@/components/slab-optimizer';
import { generateCutListCSV, downloadCSV } from '@/lib/services/cut-list-generator';

interface PieceInput {
  id: string;
  width: string;
  height: string;
  label: string;
  thickness: string; // NEW: "20", "30", "40", "60"
  finishedEdges: {   // NEW: Which edges need lamination
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
}

interface Quote {
  id: number;
  quoteNumber: string;
  projectName: string | null;
  customer: {
    name: string;
    company: string | null;
  } | null;
}

interface QuotePiece {
  id: number;
  name: string;
  lengthMm: number;
  widthMm: number;
  room?: { name: string };
}

export default function OptimizePage() {
  // Slab settings
  const [slabWidth, setSlabWidth] = useState('3000');
  const [slabHeight, setSlabHeight] = useState('1400');
  const [kerfWidth, setKerfWidth] = useState('3');
  const [allowRotation, setAllowRotation] = useState(true);

  // Pieces
  const [pieces, setPieces] = useState<PieceInput[]>([
    { 
      id: '1', 
      width: '2000', 
      height: '600', 
      label: 'Piece 1',
      thickness: '20',
      finishedEdges: { top: false, bottom: false, left: false, right: false }
    },
  ]);

  // Results
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quote selection
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [selectedQuoteId, setSelectedQuoteId] = useState<string>('');
  const [isLoadingQuotes, setIsLoadingQuotes] = useState(false);
  const [isLoadingPieces, setIsLoadingPieces] = useState(false);

  // Fetch quotes on mount
  useEffect(() => {
    const fetchQuotes = async () => {
      setIsLoadingQuotes(true);
      try {
        const response = await fetch('/api/quotes');
        if (response.ok) {
          const data = await response.json();
          setQuotes(data);
        }
      } catch (err) {
        console.error('Failed to fetch quotes:', err);
      } finally {
        setIsLoadingQuotes(false);
      }
    };
    fetchQuotes();
  }, []);

  // Load pieces from selected quote
  const loadPiecesFromQuote = async (quoteId: string) => {
    if (!quoteId) return;

    setIsLoadingPieces(true);
    setError(null);

    try {
      const response = await fetch(`/api/quotes/${quoteId}`);
      if (!response.ok) throw new Error('Failed to fetch quote');

      const quote = await response.json();

      // Extract pieces from rooms
      const quotePieces: PieceInput[] = [];
      if (quote.rooms) {
        quote.rooms.forEach((quote_rooms: { name: string; pieces: QuotePiece[] }) => {
          quote_rooms.pieces.forEach((piece: QuotePiece) => {
            quotePieces.push({
              id: String(piece.id),
              width: String(piece.lengthMm),
              height: String(piece.widthMm),
              label: `${quote_rooms.name}: ${piece.name || 'Piece'}`,
              thickness: String((piece as any).thicknessMm || 20),
              finishedEdges: { top: false, bottom: false, left: false, right: false },
            });
          });
        });
      }

      if (quotePieces.length === 0) {
        setError('Selected quote has no pieces');
        return;
      }

      setPieces(quotePieces);
      setResult(null); // Clear previous results
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load quote pieces');
    } finally {
      setIsLoadingPieces(false);
    }
  };

  // Handle quote selection change
  const handleQuoteChange = (quoteId: string) => {
    setSelectedQuoteId(quoteId);
    if (quoteId) {
      loadPiecesFromQuote(quoteId);
    }
  };

  // Add new piece
  const addPiece = () => {
    const newId = String(Date.now());
    setPieces([...pieces, {
      id: newId,
      width: '1000',
      height: '500',
      label: `Piece ${pieces.length + 1}`,
      thickness: '20',
      finishedEdges: { top: false, bottom: false, left: false, right: false }
    }]);
  };

  // Remove piece
  const removePiece = (id: string) => {
    setPieces(pieces.filter(p => p.id !== id));
  };

  // Update piece
  const updatePiece = (id: string, field: keyof PieceInput, value: string) => {
    setPieces(pieces.map(p =>
      p.id === id ? { ...p, [field]: value } : p
    ));
  };
  
  // Update piece finished edge
  const updatePieceEdge = (id: string, edge: keyof PieceInput['finishedEdges'], value: boolean) => {
    setPieces(pieces.map(p =>
      p.id === id ? {
        ...p,
        finishedEdges: { ...p.finishedEdges, [edge]: value }
      } : p
    ));
  };

  // Run optimization
  const runOptimization = () => {
    setError(null);
    setIsOptimizing(true);

    try {
      // Validate inputs
      const slabW = parseInt(slabWidth);
      const slabH = parseInt(slabHeight);
      const kerf = parseInt(kerfWidth);

      if (isNaN(slabW) || slabW <= 0) throw new Error('Invalid slab width');
      if (isNaN(slabH) || slabH <= 0) throw new Error('Invalid slab height');
      if (isNaN(kerf) || kerf < 0) throw new Error('Invalid kerf width');

      const validPieces = pieces
        .filter(p => p.width && p.height)
        .map(p => ({
          id: p.id,
          width: parseInt(p.width) || 0,
          height: parseInt(p.height) || 0,
          label: p.label || `Piece ${p.id}`,
          thickness: parseInt(p.thickness) || 20,
          finishedEdges: p.finishedEdges,
        }))
        .filter(p => p.width > 0 && p.height > 0);

      if (validPieces.length === 0) {
        throw new Error('Add at least one valid piece');
      }

      const input: OptimizationInput = {
        pieces: validPieces,
        slabWidth: slabW,
        slabHeight: slabH,
        kerfWidth: kerf,
        allowRotation,
      };

      const optimizationResult = optimizeSlabs(input);
      setResult(optimizationResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Clear results
  const clearResults = () => {
    setResult(null);
    setError(null);
  };

  // Save optimization to quote
  const saveToQuote = async () => {
    if (!selectedQuoteId || !result) return;

    setError(null);
    try {
      const response = await fetch(`/api/quotes/${selectedQuoteId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slabWidth: parseInt(slabWidth) || 3000,
          slabHeight: parseInt(slabHeight) || 1400,
          kerfWidth: parseInt(kerfWidth) || 3,
          allowRotation,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save optimization');
      }

      alert('Optimization saved to quote successfully!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save to quote');
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!result) return;

    const csv = generateCutListCSV(result, parseInt(slabWidth) || 3000, parseInt(slabHeight) || 1400);
    const selectedQuote = quotes.find(q => String(q.id) === selectedQuoteId);
    const quoteLabel = selectedQuote ? selectedQuote.quote_number : 'standalone';
    const filename = `cut-list-${quoteLabel}-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  };

  // Print
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Slab Optimizer
      </h1>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Left column: Settings and Pieces */}
        <div className="space-y-6">
          {/* Load from Quote */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Load from Quote</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Select a quote to load pieces
                </label>
                <select
                  value={selectedQuoteId}
                  onChange={(e) => handleQuoteChange(e.target.value)}
                  disabled={isLoadingQuotes || isLoadingPieces}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                >
                  <option value="">-- Select a Quote --</option>
                  {quotes.map((quote) => (
                    <option key={quote.id} value={quote.id}>
                      {quote.quote_number} - {quote.customer?.company || quote.customer?.name || 'No customer'}
                      {quote.project_name ? ` (${quote.project_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              {isLoadingPieces && (
                <div className="flex items-center gap-2 text-sm text-blue-600">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Loading pieces...
                </div>
              )}
              <p className="text-xs text-gray-500">
                Or manually enter pieces below
              </p>
            </div>
          </div>

          {/* Slab Settings */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="font-semibold text-gray-900 mb-4">Slab Settings</h2>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Width (mm)
                </label>
                <input
                  type="number"
                  value={slabWidth}
                  onChange={(e) => setSlabWidth(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Height (mm)
                </label>
                <input
                  type="number"
                  value={slabHeight}
                  onChange={(e) => setSlabHeight(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">
                  Kerf (mm)
                </label>
                <input
                  type="number"
                  value={kerfWidth}
                  onChange={(e) => setKerfWidth(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <label className="flex items-center gap-2 mt-4">
              <input
                type="checkbox"
                checked={allowRotation}
                onChange={(e) => setAllowRotation(e.target.checked)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">Allow piece rotation</span>
            </label>
          </div>

          {/* Pieces */}
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="font-semibold text-gray-900">Pieces</h2>
              <button
                onClick={addPiece}
                className="text-sm text-blue-600 hover:text-blue-700 font-medium"
              >
                + Add Piece
              </button>
            </div>

            <div className="space-y-3">
              {pieces.map((piece, index) => {
                const is40mmPlus = parseInt(piece.thickness) >= 40;
                const hasFinishedEdges = (
                  piece.finishedEdges.top || 
                  piece.finishedEdges.bottom || 
                  piece.finishedEdges.left || 
                  piece.finishedEdges.right
                );
                const edgeCount = [
                  piece.finishedEdges.top, 
                  piece.finishedEdges.bottom, 
                  piece.finishedEdges.left, 
                  piece.finishedEdges.right
                ].filter(Boolean).length;
                
                return (
                  <div key={piece.id} className="p-3 bg-gray-50 rounded-lg space-y-3">
                    {/* Main piece info */}
                    <div className="flex gap-2 items-center">
                      <span className="text-xs text-gray-500 w-5">{index + 1}.</span>
                      <input
                        type="text"
                        value={piece.label}
                        onChange={(e) => updatePiece(piece.id, 'label', e.target.value)}
                        placeholder="Label"
                        className="flex-1 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <input
                        type="number"
                        value={piece.width}
                        onChange={(e) => updatePiece(piece.id, 'width', e.target.value)}
                        placeholder="Width"
                        className="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <span className="text-gray-400">×</span>
                      <input
                        type="number"
                        value={piece.height}
                        onChange={(e) => updatePiece(piece.id, 'height', e.target.value)}
                        placeholder="Height"
                        className="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <select
                        value={piece.thickness}
                        onChange={(e) => updatePiece(piece.id, 'thickness', e.target.value)}
                        className="w-20 px-2 py-1 border rounded text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="20">20mm</option>
                        <option value="30">30mm</option>
                        <option value="40">40mm</option>
                        <option value="60">60mm</option>
                      </select>
                      <button
                        onClick={() => removePiece(piece.id)}
                        className="text-red-500 hover:text-red-700 p-1"
                        disabled={pieces.length === 1}
                      >
                        ×
                      </button>
                    </div>
                    
                    {/* Finished edges - Show for ALL thicknesses */}
                    <div className="ml-7 pl-3 border-l-2 border-blue-200">
                      <div className="text-xs font-medium text-gray-700 mb-2">
                        Finished Edges
                        {hasFinishedEdges && is40mmPlus && (
                          <span className="ml-2 text-blue-600">
                            → Will generate {edgeCount} lamination strip{edgeCount !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={piece.finishedEdges.top}
                            onChange={(e) => updatePieceEdge(piece.id, 'top', e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span>Top</span>
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={piece.finishedEdges.bottom}
                            onChange={(e) => updatePieceEdge(piece.id, 'bottom', e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span>Bottom</span>
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={piece.finishedEdges.left}
                            onChange={(e) => updatePieceEdge(piece.id, 'left', e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span>Left</span>
                        </label>
                        <label className="flex items-center gap-1 text-xs">
                          <input
                            type="checkbox"
                            checked={piece.finishedEdges.right}
                            onChange={(e) => updatePieceEdge(piece.id, 'right', e.target.checked)}
                            className="rounded text-blue-600"
                          />
                          <span>Right</span>
                        </label>
                      </div>
                      {is40mmPlus ? (
                        <p className="text-xs text-blue-600 mt-1 font-medium">
                          ✓ 40mm+ thickness: Each edge generates a lamination strip
                        </p>
                      ) : (
                        <p className="text-xs text-gray-500 mt-1">
                          Finished edges for this piece (no lamination strips for {piece.thickness}mm)
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Run button */}
            <div className="mt-4 flex gap-3">
              <button
                onClick={runOptimization}
                disabled={isOptimizing || pieces.length === 0}
                className="flex-1 bg-blue-600 text-white py-2 px-4 rounded-lg
                         hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
                         font-medium transition-colors"
              >
                {isOptimizing ? 'Optimizing...' : 'Run Optimization'}
              </button>
              {result && (
                <button
                  onClick={clearResults}
                  className="px-4 py-2 border border-gray-300 rounded-lg
                           hover:bg-gray-50 text-gray-700 transition-colors"
                >
                  Clear
                </button>
              )}
            </div>

            {error && (
              <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}
          </div>
        </div>

        {/* Right column: Results */}
        <div className="bg-white rounded-lg shadow p-4">
          <h2 className="font-semibold text-gray-900 mb-4">Results</h2>

          {result ? (
            <>
              <SlabResults
                result={result}
                slabWidth={parseInt(slabWidth) || 3000}
                slabHeight={parseInt(slabHeight) || 1400}
              />

              {/* Export Buttons */}
              <div className="mt-4 flex gap-2 justify-end print:hidden flex-wrap">
                {selectedQuoteId && (
                  <button
                    onClick={saveToQuote}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700
                             flex items-center gap-2 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                            d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save to Quote
                  </button>
                )}
                <button
                  onClick={handleExportCSV}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50
                           text-gray-700 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  Export CSV
                </button>
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50
                           text-gray-700 flex items-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  Print
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-gray-400">
              <svg
                className="w-16 h-16 mx-auto mb-4 opacity-50"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z"
                />
              </svg>
              <p>Add pieces and run optimization to see results</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
