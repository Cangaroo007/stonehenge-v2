'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { useUnits } from '@/lib/contexts/UnitContext';
import { getDimensionUnitLabel, mmToDisplayUnit, displayUnitToMm } from '@/lib/utils/units';
import { formatCurrency } from '@/lib/utils';
import type { CalculationResult } from '@/lib/types/pricing';

interface MachineOption {
  id: string;
  name: string;
  kerfWidthMm: number;
  isDefault: boolean;
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
  machineProfileId: string | null;
  cutouts: any[];
  sortOrder: number;
  totalCost: number;
  quote_rooms: {
    id: number;
    name: string;
  };
}

interface PieceListProps {
  pieces: QuotePiece[];
  selectedPieceId: number | null;
  onSelectPiece: (pieceId: number) => void;
  onDeletePiece: (pieceId: number) => void;
  onDuplicatePiece: (pieceId: number) => void;
  onReorder: (pieces: { id: number; sortOrder: number }[]) => void;
  onPieceUpdate?: (pieceId: number, updates: Partial<QuotePiece>) => void;
  getKerfForPiece?: (piece: QuotePiece) => number;
  machines?: MachineOption[];
  defaultMachineId?: string | null;
  calculation?: CalculationResult | null;
  discountDisplayMode?: 'ITEMIZED' | 'TOTAL_ONLY';
  edgeTypes?: EdgeType[];
}

// Format edge type ID to readable name
const formatEdgeName = (edgeId: string | null): string => {
  if (!edgeId) return '';
  // Convert kebab-case or snake_case to Title Case
  return edgeId
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

// Get edge summary string for a piece
const getEdgeSummary = (piece: QuotePiece): string => {
  const edges = [
    piece.edgeTop && `T`,
    piece.edgeBottom && `B`,
    piece.edgeLeft && `L`,
    piece.edgeRight && `R`,
  ].filter(Boolean);

  return edges.length > 0 ? edges.join(', ') : '';
};

// Check if piece has any edges
const hasEdges = (piece: QuotePiece): boolean => {
  return !!(piece.edgeTop || piece.edgeBottom || piece.edgeLeft || piece.edgeRight);
};

// Check if piece has 40mm edges that need lamination
const has40mmEdges = (piece: QuotePiece): boolean => {
  return piece.thicknessMm >= 40 && hasEdges(piece);
};

// Count how many edges have 40mm profiles
const count40mmEdges = (piece: QuotePiece): number => {
  if (piece.thicknessMm < 40) return 0;
  
  let count = 0;
  if (piece.edgeTop) count++;
  if (piece.edgeBottom) count++;
  if (piece.edgeLeft) count++;
  if (piece.edgeRight) count++;
  return count;
};

// Check if any edge is a mitre type
const hasMitreEdge = (piece: QuotePiece, edgeTypes: EdgeType[]): boolean => {
  const edgeIds = [piece.edgeTop, piece.edgeBottom, piece.edgeLeft, piece.edgeRight].filter(Boolean);
  return edgeIds.some(id => {
    const et = edgeTypes.find(e => e.id === id);
    return et && et.name.toLowerCase().includes('mitre');
  });
};

export default function PieceList({
  pieces,
  selectedPieceId,
  onSelectPiece,
  onDeletePiece,
  onDuplicatePiece,
  onReorder,
  onPieceUpdate,
  getKerfForPiece,
  machines = [],
  defaultMachineId,
  calculation = null,
  discountDisplayMode = 'ITEMIZED',
  edgeTypes = [],
}: PieceListProps) {
  const { unitSystem } = useUnits();
  const unitLabel = getDimensionUnitLabel(unitSystem);

  // Build a map of piece ID -> oversize status from calculation results
  const pieceOversizeMap = useMemo(() => {
    const map = new Map<number, boolean>();
    if (calculation?.breakdown?.pieces) {
      for (const pb of calculation.breakdown.pieces as Array<{ pieceId: number; oversize?: { isOversize: boolean } }>) {
        if (pb.oversize?.isOversize) {
          map.set(pb.pieceId, true);
        }
      }
    }
    return map;
  }, [calculation]);

  // Local state for inline editing
  const [editingCell, setEditingCell] = useState<{ pieceId: number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  // Simple debounced save - using a timeout ref
  const saveTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);
  
  const debouncedSave = useCallback((pieceId: number, updates: Partial<QuotePiece>) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      if (onPieceUpdate) {
        onPieceUpdate(pieceId, updates);
      }
    }, 500);
  }, [onPieceUpdate]);

  // Resolve machine name and kerf for a piece
  const getMachineInfo = (piece: QuotePiece): { name: string; kerf: number } => {
    // Use provided getKerfForPiece if available
    if (getKerfForPiece) {
      return {
        name: machines.find(m => m.id === piece.machineProfileId)?.name || 'Default Machine',
        kerf: getKerfForPiece(piece)
      };
    }
    
    // Fallback logic
    if (piece.machineProfileId) {
      const machine = machines.find(m => m.id === piece.machineProfileId);
      if (machine) return { name: machine.name, kerf: machine.kerfWidthMm };
    }
    const defaultMachine = machines.find(m => m.id === defaultMachineId);
    if (defaultMachine) return { name: defaultMachine.name, kerf: defaultMachine.kerfWidthMm };
    return { name: 'GMM Bridge Saw', kerf: 8 };
  };

  // Resolve edge type name from ID
  const getEdgeTypeName = (edgeTypeId: string | null): string | null => {
    if (!edgeTypeId) return null;
    const et = edgeTypes.find(e => e.id === edgeTypeId);
    return et?.name ?? null;
  };

  // Get mitre strip info for a piece (for 40mm+ with mitre edges)
  const getMitreStripInfo = (piece: QuotePiece): { count: number; formula: string } | null => {
    if (piece.thicknessMm < 40) return null;
    const machineInfo = getMachineInfo(piece);
    const edgeIds = [
      { id: piece.edgeTop, side: 'T' },
      { id: piece.edgeBottom, side: 'B' },
      { id: piece.edgeLeft, side: 'L' },
      { id: piece.edgeRight, side: 'R' },
    ];
    let mitreCount = 0;
    for (const edge of edgeIds) {
      if (!edge.id) continue;
      const name = getEdgeTypeName(edge.id);
      if (name && name.toLowerCase().includes('mitre')) {
        mitreCount++;
      }
    }
    if (mitreCount === 0) return null;
    const stripWidth = piece.thicknessMm + machineInfo.kerf + 5;
    return {
      count: mitreCount,
      formula: `${piece.thicknessMm}+${machineInfo.kerf}+5=${stripWidth}mm`,
    };
  };

  const handleMoveUp = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === 0) return;

    const newPieces = [...pieces];
    const currentPiece = newPieces[index];
    const prevPiece = newPieces[index - 1];

    // Swap sort orders
    const reorderedPieces = [
      { id: currentPiece.id, sortOrder: prevPiece.sortOrder },
      { id: prevPiece.id, sortOrder: currentPiece.sortOrder },
    ];

    onReorder(reorderedPieces);
  };

  const handleMoveDown = (index: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (index === pieces.length - 1) return;

    const newPieces = [...pieces];
    const currentPiece = newPieces[index];
    const nextPiece = newPieces[index + 1];

    // Swap sort orders
    const reorderedPieces = [
      { id: currentPiece.id, sortOrder: nextPiece.sortOrder },
      { id: nextPiece.id, sortOrder: currentPiece.sortOrder },
    ];

    onReorder(reorderedPieces);
  };

  const handleDelete = (pieceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onDeletePiece(pieceId);
  };

  const handleDuplicate = (pieceId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    onDuplicatePiece(pieceId);
  };

  // Handle inline editing
  const handleCellClick = (pieceId: number, field: string, currentValue: string | number, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCell({ pieceId, field });
    setEditValue(currentValue.toString());
  };

  const handleEditBlur = (pieceId: number, field: string) => {
    if (!onPieceUpdate) {
      setEditingCell(null);
      return;
    }

    const piece = pieces.find(p => p.id === pieceId);
    if (!piece) {
      setEditingCell(null);
      return;
    }

    // Validate and update
    let updates: Partial<QuotePiece> = {};
    
    if (field === 'name') {
      if (editValue.trim()) {
        updates.name = editValue.trim();
      }
    } else if (field === 'lengthMm' || field === 'widthMm') {
      const numValue = parseFloat(editValue);
      if (!isNaN(numValue) && numValue > 0) {
        // Convert from display units to mm if needed
        updates[field] = displayUnitToMm(numValue, unitSystem);
      }
    }

    if (Object.keys(updates).length > 0) {
      debouncedSave(pieceId, updates);
    }

    setEditingCell(null);
    setEditValue('');
  };

  const handleEditKeyDown = (pieceId: number, field: string, e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleEditBlur(pieceId, field);
    } else if (e.key === 'Escape') {
      setEditingCell(null);
      setEditValue('');
    }
  };

  if (pieces.length === 0) {
    return (
      <div className="p-8 text-center text-gray-500">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4"
          />
        </svg>
        <p className="mb-2">No pieces added yet</p>
        <p className="text-sm">Click &quot;Add Piece&quot; to start building your quote</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">
              #
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Name
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Dimensions
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Thickness
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Room
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Edges
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-24">
              Actions
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {pieces.map((piece, index) => (
            <tr
              key={piece.id}
              onClick={() => onSelectPiece(piece.id)}
              className={`cursor-pointer transition-colors ${
                selectedPieceId === piece.id
                  ? 'bg-primary-50 ring-2 ring-inset ring-primary-500'
                  : 'hover:bg-gray-50'
              }`}
            >
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gray-900 text-white font-bold text-lg">
                  {index + 1}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                {editingCell?.pieceId === piece.id && editingCell?.field === 'name' ? (
                  <input
                    type="text"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditBlur(piece.id, 'name')}
                    onKeyDown={(e) => handleEditKeyDown(piece.id, 'name', e)}
                    autoFocus
                    className="w-full px-2 py-1 text-sm font-medium text-gray-900 border border-blue-500 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <div
                    className="cursor-text hover:bg-blue-50 px-2 py-1 rounded"
                    onClick={(e) => handleCellClick(piece.id, 'name', piece.name, e)}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-gray-900">{piece.name}</span>
                      {pieceOversizeMap.get(piece.id) && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800 border border-amber-300">
                          OVERSIZE
                        </span>
                      )}
                    </div>
                    {piece.materialName && (
                      <div className="text-xs text-gray-500">{piece.materialName}</div>
                    )}
                  </div>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {editingCell?.pieceId === piece.id && editingCell?.field === 'lengthMm' ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditBlur(piece.id, 'lengthMm')}
                    onKeyDown={(e) => handleEditKeyDown(piece.id, 'lengthMm', e)}
                    autoFocus
                    className="w-16 px-2 py-1 text-sm border border-blue-500 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span 
                    className="cursor-text hover:bg-blue-50 px-2 py-1 rounded inline-block"
                    onClick={(e) => handleCellClick(piece.id, 'lengthMm', Math.round(mmToDisplayUnit(piece.lengthMm, unitSystem)), e)}
                  >
                    {Math.round(mmToDisplayUnit(piece.lengthMm, unitSystem))}
                  </span>
                )}
                {' × '}
                {editingCell?.pieceId === piece.id && editingCell?.field === 'widthMm' ? (
                  <input
                    type="number"
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={() => handleEditBlur(piece.id, 'widthMm')}
                    onKeyDown={(e) => handleEditKeyDown(piece.id, 'widthMm', e)}
                    autoFocus
                    className="w-16 px-2 py-1 text-sm border border-blue-500 rounded focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    onClick={(e) => e.stopPropagation()}
                  />
                ) : (
                  <span 
                    className="cursor-text hover:bg-blue-50 px-2 py-1 rounded inline-block"
                    onClick={(e) => handleCellClick(piece.id, 'widthMm', Math.round(mmToDisplayUnit(piece.widthMm, unitSystem)), e)}
                  >
                    {Math.round(mmToDisplayUnit(piece.widthMm, unitSystem))}
                  </span>
                )}
                {unitLabel}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-600">
                {Math.round(mmToDisplayUnit(piece.thicknessMm, unitSystem))}{unitLabel}
              </td>
              <td className="px-4 py-3 whitespace-nowrap">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                  {piece.quote_rooms.name}
                </span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                {hasEdges(piece) ? (
                  <div className="space-y-1">
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                      {getEdgeSummary(piece)}
                    </span>
                    {has40mmEdges(piece) && (
                      <div className="flex items-center gap-1 text-xs text-amber-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="font-medium">
                          {count40mmEdges(piece)} Lamination Strip{count40mmEdges(piece) !== 1 ? 's' : ''} (Kerf: {getMachineInfo(piece).kerf}mm)
                        </span>
                      </div>
                    )}
                    {getMitreStripInfo(piece) && (
                      <div className="flex items-center gap-1 text-xs text-purple-600">
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                        <span className="font-medium">
                          {getMitreStripInfo(piece)!.count} Mitre Strip{getMitreStripInfo(piece)!.count !== 1 ? 's' : ''} ({getMitreStripInfo(piece)!.formula})
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <span className="text-gray-400 text-xs">None</span>
                )}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-sm">
                <div className="flex items-center gap-1">
                  {/* Move Up */}
                  <button
                    onClick={(e) => handleMoveUp(index, e)}
                    disabled={index === 0}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move up"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                  </button>
                  {/* Move Down */}
                  <button
                    onClick={(e) => handleMoveDown(index, e)}
                    disabled={index === pieces.length - 1}
                    className="p-1 text-gray-400 hover:text-gray-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    title="Move down"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>
                  {/* Duplicate */}
                  <button
                    onClick={(e) => handleDuplicate(piece.id, e)}
                    className="p-1 text-gray-400 hover:text-gray-600"
                    title="Duplicate piece"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                  </button>
                  {/* Delete */}
                  <button
                    onClick={(e) => handleDelete(piece.id, e)}
                    className="p-1 text-red-400 hover:text-red-600"
                    title="Delete piece"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
