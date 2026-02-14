'use client';

import React, { useState, useEffect } from 'react';
import { OptimizationResult } from '@/types/slab-optimization';
import { SlabResults } from '@/components/slab-optimizer';
import { generateCutListCSV, downloadCSV } from '@/lib/services/cut-list-generator';
import { logger } from '@/lib/logger';

interface PieceInput {
  id: string;
  width: string;
  height: string;
  label: string;
  thickness: string;
  finishedEdges: {
    top: boolean;
    bottom: boolean;
    left: boolean;
    right: boolean;
  };
}

interface OptimizeModalProps {
  quoteId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
  defaultKerfWidth?: number;
}

export function OptimizeModal({ quoteId, onClose, onSaved, defaultKerfWidth = 8 }: OptimizeModalProps) {
  // Slab settings
  const [slabWidth, setSlabWidth] = useState('3000');
  const [slabHeight, setSlabHeight] = useState('1400');
  const [kerfWidth, setKerfWidth] = useState(String(defaultKerfWidth));
  const [allowRotation, setAllowRotation] = useState(true);

  // Pieces
  const [pieces, setPieces] = useState<PieceInput[]>([]);
  const [isLoadingPieces, setIsLoadingPieces] = useState(true);

  // Results
  const [result, setResult] = useState<OptimizationResult | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load pieces from quote AND saved optimization on mount
  useEffect(() => {
    const loadData = async () => {
      setIsLoadingPieces(true);
      setError(null);

      try {
        // Fetch quote with pieces
        const quoteResponse = await fetch(`/api/quotes/${quoteId}`);
        if (!quoteResponse.ok) throw new Error('Failed to fetch quote');

        const quote = await quoteResponse.json();

        // Extract pieces from rooms
        const quotePieces: PieceInput[] = [];
        if (quote.rooms) {
          quote.rooms.forEach((quote_rooms: any) => {
            quote_rooms.pieces.forEach((piece: any) => {
              quotePieces.push({
                id: String(piece.id),
                width: String(piece.lengthMm),
                height: String(piece.widthMm),
                label: piece.name || 'Piece',
                thickness: String(piece.thicknessMm || 20),
                finishedEdges: {
                  top: !!piece.edgeTop,
                  bottom: !!piece.edgeBottom,
                  left: !!piece.edgeLeft,
                  right: !!piece.edgeRight,
                },
              });
            });
          });
        }

        if (quotePieces.length === 0) {
          setError('Quote has no pieces to optimize');
          return;
        }

        setPieces(quotePieces);

        // Try to load saved optimization
        try {
          const optimizationResponse = await fetch(`/api/quotes/${quoteId}/optimize`);
          if (optimizationResponse.ok) {
            const savedOptimization = await optimizationResponse.json();
            
            if (savedOptimization && savedOptimization.placements) {
              // Restore slab settings
              setSlabWidth(String(savedOptimization.slabWidth || 3000));
              setSlabHeight(String(savedOptimization.slabHeight || 1400));
              setKerfWidth(String(savedOptimization.kerfWidth || 3));
              
              // Reconstruct result from saved data
              const reconstructedResult: OptimizationResult = {
                placements: savedOptimization.placements,
                slabs: [], // Will be reconstructed from placements
                totalSlabs: savedOptimization.totalSlabs,
                totalUsedArea: 0, // Calculated from placements
                totalWasteArea: savedOptimization.totalWaste,
                wastePercent: Number(savedOptimization.wastePercent),
                unplacedPieces: [],
                laminationSummary: savedOptimization.laminationSummary,
              };
              
              setResult(reconstructedResult);
            }
          }
        } catch (err) {
          // No saved optimization found - that's okay
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load quote pieces');
      } finally {
        setIsLoadingPieces(false);
      }
    };

    loadData();
  }, [quoteId]);

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

  // Run optimization - now calls API route to save to database
  const runOptimization = async () => {
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

      if (pieces.length === 0) {
        throw new Error('Add at least one valid piece');
      }

      // Call API route to run optimization AND save to database
      const response = await fetch(`/api/quotes/${quoteId}/optimize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slabWidth: slabW,
          slabHeight: slabH,
          kerfWidth: kerf,
          allowRotation,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Optimization failed');
      }

      const data = await response.json();

      setResult(data.result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Optimization failed');
    } finally {
      setIsOptimizing(false);
    }
  };

  // Save optimization to quote
  const handleSaveAndClose = async () => {
    if (!result) return;

    setIsSaving(true);
    setError(null);

    try {
      // Convert optimization placements to pieces for import
      const piecesToImport = result.slabs.flatMap((slab, slabIndex) => {
        const slabNumber = slabIndex + 1;

        return slab.placements
          .filter(p => !p.isLaminationStrip)
          .map((placement) => {
            // Find original piece to get thickness
            const originalPiece = pieces.find(p => p.label === placement.label || p.id === placement.pieceId);
            const thickness = originalPiece ? parseInt(originalPiece.thickness) : 20;

            return {
              name: placement.label,
              length: placement.width,
              width: placement.height,
              thickness: thickness,
              quote_rooms: `Slab ${slabNumber}`,
              notes: placement.rotated ? 'Rotated 90°' : undefined,
              edgeTop: null,
              edgeBottom: null,
              edgeLeft: null,
              edgeRight: null,
            };
          });
      });

      // Import pieces to quote, replacing existing to avoid duplication
      const response = await fetch(`/api/quotes/${quoteId}/import-pieces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieces: piecesToImport,
          replaceExisting: true,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to save optimization to quote');
      }

      const importResult = await response.json();

      // Call onSaved to refresh parent
      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save optimization');
    } finally {
      setIsSaving(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!result) return;

    const csv = generateCutListCSV(result, parseInt(slabWidth) || 3000, parseInt(slabHeight) || 1400);
    const filename = `cut-list-quote-${quoteId}-${new Date().toISOString().split('T')[0]}.csv`;
    downloadCSV(csv, filename);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-200 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900">Slab Optimiser</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoadingPieces ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-gray-600">
                <svg className="animate-spin h-6 w-6" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>Loading quote pieces...</span>
              </div>
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-6">
              {/* Left column: Settings and Pieces */}
              <div className="space-y-6">
                {/* Slab Settings */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-semibold text-gray-900 mb-4">Slab Settings</h3>

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

                  <div className="mt-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={allowRotation}
                        onChange={(e) => setAllowRotation(e.target.checked)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700">Allow piece rotation</span>
                    </label>
                  </div>
                </div>

                {/* Pieces */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-gray-900">
                      Pieces ({pieces.length})
                    </h3>
                    <button
                      onClick={addPiece}
                      className="btn-secondary text-sm"
                    >
                      + Add Piece
                    </button>
                  </div>

                  <div className="space-y-3 max-h-96 overflow-y-auto">
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
                        <div key={piece.id} className="bg-white rounded-lg p-3 border border-gray-200">
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <input
                              type="text"
                              value={piece.label}
                              onChange={(e) => updatePiece(piece.id, 'label', e.target.value)}
                              className="flex-1 px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                              placeholder="Piece name"
                            />
                            <button
                              onClick={() => removePiece(piece.id)}
                              className="text-red-500 hover:text-red-700 p-1"
                              title="Remove piece"
                            >
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>

                          <div className="grid grid-cols-3 gap-2">
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Width</label>
                              <input
                                type="number"
                                value={piece.width}
                                onChange={(e) => updatePiece(piece.id, 'width', e.target.value)}
                                className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="mm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Height</label>
                              <input
                                type="number"
                                value={piece.height}
                                onChange={(e) => updatePiece(piece.id, 'height', e.target.value)}
                                className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                                placeholder="mm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs text-gray-600 mb-1">Thickness</label>
                              <select
                                value={piece.thickness}
                                onChange={(e) => updatePiece(piece.id, 'thickness', e.target.value)}
                                className="w-full px-2 py-1 text-sm border rounded focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="20">20mm</option>
                                <option value="30">30mm</option>
                                <option value="40">40mm</option>
                                <option value="60">60mm</option>
                              </select>
                            </div>
                          </div>

                          {/* Finished Edges - Show for ALL thicknesses */}
                          <div className="mt-2 pt-2 border-t border-gray-100">
                            <div className="flex items-center justify-between mb-1">
                              <label className="block text-xs font-medium text-gray-700">
                                Finished Edges
                              </label>
                              {hasFinishedEdges && is40mmPlus && (
                                <span className="text-xs text-blue-600 font-medium">
                                  → {edgeCount} lamination strip{edgeCount !== 1 ? 's' : ''}
                                </span>
                              )}
                            </div>
                            <div className="grid grid-cols-4 gap-2">
                              {(['top', 'bottom', 'left', 'right'] as const).map((edge) => (
                                <label key={edge} className="flex items-center gap-1 text-xs">
                                  <input
                                    type="checkbox"
                                    checked={piece.finishedEdges[edge]}
                                    onChange={(e) => updatePieceEdge(piece.id, edge, e.target.checked)}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                  <span className="capitalize">{edge}</span>
                                </label>
                              ))}
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
                </div>

                {/* Optimize Button */}
                <button
                  onClick={runOptimization}
                  disabled={isOptimizing || pieces.length === 0}
                  className="btn-primary w-full"
                >
                  {isOptimizing ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Optimizing...
                    </span>
                  ) : (
                    'Run Optimization'
                  )}
                </button>
              </div>

              {/* Right column: Results */}
              <div>
                {error && (
                  <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                    <p className="text-sm text-red-800">{error}</p>
                  </div>
                )}

                {result && (
                  <div className="space-y-4">
                    <SlabResults 
                      result={result}
                      slabWidth={parseInt(slabWidth) || 3000}
                      slabHeight={parseInt(slabHeight) || 1400}
                    />

                    <div className="flex gap-2">
                      <button
                        onClick={handleExportCSV}
                        className="btn-secondary flex-1"
                      >
                        Export CSV
                      </button>
                    </div>
                  </div>
                )}

                {!result && !error && (
                  <div className="flex items-center justify-center h-64 bg-gray-50 rounded-lg">
                    <p className="text-gray-500">Run optimization to see results</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-200 bg-gray-50 flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="btn-secondary"
          >
            Cancel
          </button>

          <button
            onClick={handleSaveAndClose}
            disabled={!result || isSaving}
            className="btn-primary"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Saving...
              </span>
            ) : (
              'Save to Quote'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
