'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  getDefaultRoomNames,
  getRoomPieceSuggestions,
  getPieceDefaults,
} from '@/lib/services/quote-setup-defaults';
import { validateWizardData, type ValidationError } from '@/lib/services/quote-validation';
import MiniPieceEditor from './MiniPieceEditor';

/* ─── Types ─── */

interface WizardPiece {
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  edges: { top: string; bottom: string; left: string; right: string };
  cutouts: Array<{ type: string; quantity: number }>;
}

interface WizardRoom {
  name: string;
  pieceCount: number;
  pieces: WizardPiece[];
}

interface EdgeTypeOption {
  id: string;
  name: string;
  description?: string | null;
  category?: string;
  baseRate?: number;
  isActive?: boolean;
  sortOrder?: number;
}

interface CutoutTypeOption {
  id: string;
  name: string;
  description?: string | null;
  baseRate?: number;
  isActive?: boolean;
  sortOrder?: number;
}

interface ManualQuoteWizardProps {
  onComplete: (data: {
    projectName: string;
    rooms: WizardRoom[];
  }) => void;
  onBack?: () => void;
  customerId?: number;
}

/* ─── Quick-suggestion chips for room names ─── */
const ROOM_CHIPS = ['Kitchen', 'Bathroom', 'Ensuite', 'Laundry', 'Powder Room', 'Bar', 'Outdoor'];

const THICKNESS_OPTIONS = [20, 40];

/* ─── Component ─── */

export function ManualQuoteWizard({ onComplete, onBack, customerId }: ManualQuoteWizardProps) {
  const router = useRouter();
  const projectNameRef = useRef<HTMLInputElement>(null);
  const [projectName, setProjectName] = useState('');
  const [rooms, setRooms] = useState<WizardRoom[]>([]);
  const [roomCount, setRoomCount] = useState<number>(1);

  /* ─── Edge/cutout types (loaded on mount — Rule 45: hooks before returns) ─── */
  const [edgeTypes, setEdgeTypes] = useState<EdgeTypeOption[]>([]);
  const [cutoutTypes, setCutoutTypes] = useState<CutoutTypeOption[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<ValidationError[]>([]);

  /* ─── Track whether rooms have been expanded with pieces ─── */
  const [piecesGenerated, setPiecesGenerated] = useState(false);

  /* ─── Load edge & cutout types on mount (moved from step-4 gate per Rule 45) ─── */
  useEffect(() => {
    let cancelled = false;

    const loadTypes = async () => {
      try {
        const [edgeRes, cutoutRes] = await Promise.all([
          fetch('/api/admin/pricing/edge-types'),
          fetch('/api/admin/pricing/cutout-types'),
        ]);

        if (cancelled) return;

        if (edgeRes.ok) {
          const data = await edgeRes.json();
          setEdgeTypes(
            (data as EdgeTypeOption[]).filter((e) => e.isActive !== false),
          );
        }

        if (cutoutRes.ok) {
          const data = await cutoutRes.json();
          setCutoutTypes(
            (data as CutoutTypeOption[]).filter((c) => c.isActive !== false),
          );
        }
      } catch {
        // Non-blocking — types will show loading state
      }
    };

    loadTypes();
    return () => { cancelled = true; };
  }, []);

  /* ─── Auto-focus project name on mount ─── */
  useEffect(() => {
    projectNameRef.current?.focus();
  }, []);

  /* ─── Initialise rooms when count changes ─── */
  const handleRoomCountSelect = useCallback((count: number) => {
    setRoomCount(count);
    setPiecesGenerated(false);
    const defaults = getDefaultRoomNames(count);
    const newRooms: WizardRoom[] = [];
    for (let i = 0; i < count; i++) {
      newRooms.push({
        name: defaults[i] || `Room ${i + 1}`,
        pieceCount: 1,
        pieces: [],
      });
    }
    setRooms(newRooms);
  }, []);

  /* ─── Initialise rooms on first render ─── */
  useEffect(() => {
    if (rooms.length === 0) {
      handleRoomCountSelect(1);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /* ─── Room handlers ─── */

  const updateRoomName = useCallback((index: number, name: string) => {
    setRooms((prev) => {
      if (!prev.length) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], name };
      return updated;
    });
  }, []);

  const updateRoomPieceCount = useCallback((index: number, count: number) => {
    const clamped = Math.max(1, Math.min(20, count));
    setRooms((prev) => {
      if (!prev.length) return prev;
      const updated = [...prev];
      updated[index] = { ...updated[index], pieceCount: clamped, pieces: [] };
      return updated;
    });
    setPiecesGenerated(false);
  }, []);

  const handleChipClick = useCallback((chipName: string) => {
    setRooms((prev) => {
      if (!prev.length) return prev;

      // If this name already exists, skip (no duplicates)
      if (prev.some((r) => r.name === chipName)) return prev;

      const updated = [...prev];

      // First: fill an empty or "Room N" slot
      const emptyIndex = updated.findIndex((r) => !r.name.trim() || /^Room \d+$/.test(r.name));
      if (emptyIndex >= 0) {
        updated[emptyIndex] = { ...updated[emptyIndex], name: chipName };
        return updated;
      }

      // Second: add a new room if under max (20)
      if (updated.length < 20) {
        return [...updated, { name: chipName, pieceCount: 1, pieces: [] }];
      }

      return prev;
    });
  }, []);

  const addRoom = useCallback(() => {
    setRooms((prev) => {
      if (prev.length >= 20) return prev;
      return [...prev, { name: `Room ${prev.length + 1}`, pieceCount: 1, pieces: [] }];
    });
    setRoomCount((prev) => prev + 1);
  }, []);

  const removeRoom = useCallback((index: number) => {
    setRooms((prev) => {
      if (prev.length <= 1) return prev;
      const updated = [...prev];
      updated.splice(index, 1);
      return updated;
    });
    setRoomCount((prev) => Math.max(1, prev - 1));
    setPiecesGenerated(false);
  }, []);

  /* ─── Generate pieces for rooms (auto-fills names + defaults) ─── */
  const generatePiecesForRooms = useCallback(() => {
    setRooms((prev) => {
      return prev.map((room) => {
        // Only generate pieces if room doesn't already have them
        if (room.pieces.length === room.pieceCount) return room;

        const suggestions = getRoomPieceSuggestions(room.name);
        const pieces: WizardPiece[] = [];

        for (let i = 0; i < room.pieceCount; i++) {
          // Preserve existing pieces if any
          if (room.pieces[i]) {
            pieces.push(room.pieces[i]);
            continue;
          }
          const pieceName = suggestions[i] || `Piece ${i + 1}`;
          const defaults = getPieceDefaults(pieceName);
          pieces.push({
            name: pieceName,
            length_mm: 0, // User must enter
            width_mm: defaults.width_mm,
            thickness_mm: 20,
            edges: { ...defaults.edges },
            cutouts: [],
          });
        }

        return { ...room, pieces };
      });
    });
    setPiecesGenerated(true);
  }, []);

  /* ─── Auto-generate pieces when rooms change and haven't been generated ─── */
  useEffect(() => {
    if (!piecesGenerated && rooms.length > 0 && rooms.every((r) => r.name.trim())) {
      generatePiecesForRooms();
    }
  }, [rooms, piecesGenerated, generatePiecesForRooms]);

  /* ─── Piece handlers ─── */

  const updatePiece = useCallback(
    (roomIndex: number, pieceIndex: number, field: keyof WizardPiece, value: string | number) => {
      setRooms((prev) => {
        if (!prev.length) return prev;
        if (!prev[roomIndex]) return prev;
        const updated = [...prev];
        const room = { ...updated[roomIndex] };
        const pieces = [...room.pieces];
        if (!pieces[pieceIndex]) return prev;
        const piece = { ...pieces[pieceIndex] };

        if (field === 'name') {
          piece.name = value as string;
          // Re-apply smart defaults when name changes
          const defaults = getPieceDefaults(value as string);
          piece.width_mm = defaults.width_mm;
          piece.edges = { ...defaults.edges };
        } else if (field === 'length_mm' || field === 'width_mm' || field === 'thickness_mm') {
          (piece as Record<string, unknown>)[field] = value as number;
        }

        pieces[pieceIndex] = piece;
        room.pieces = pieces;
        updated[roomIndex] = room;
        return updated;
      });
    },
    [],
  );

  const updateWizardPiece = useCallback(
    (roomIndex: number, pieceIndex: number, updatedPiece: WizardPiece) => {
      setRooms((prev) => {
        if (!prev.length) return prev;
        if (!prev[roomIndex]) return prev;
        const updated = [...prev];
        const room = { ...updated[roomIndex] };
        const pieces = [...room.pieces];
        if (!pieces[pieceIndex]) return prev;
        pieces[pieceIndex] = updatedPiece;
        room.pieces = pieces;
        updated[roomIndex] = room;
        return updated;
      });
    },
    [],
  );

  const allLengthsFilled = rooms.every((room) =>
    room.pieces.every((piece) => piece.length_mm > 0),
  );

  const canSubmit = projectName.trim().length > 0 && roomCount > 0 && rooms.length > 0 &&
    rooms.every((r) => r.pieces.length > 0) && allLengthsFilled;

  /* ─── Create quote (same API payload as before) ─── */

  const handleCreateQuote = useCallback(async () => {
    if (!rooms.length) return;
    if (isCreating) return;

    // Clear previous validation state
    setValidationErrors([]);
    setValidationWarnings([]);

    // GATE 1: Client-side validation
    const validation = validateWizardData({
      projectName,
      customerId,
      rooms: rooms.map((r) => ({
        name: r.name,
        pieces: r.pieces.map((p) => ({
          name: p.name,
          length_mm: Number(p.length_mm),
          width_mm: Number(p.width_mm),
          thickness_mm: Number(p.thickness_mm),
          edges: p.edges,
          cutouts: p.cutouts,
        })),
      })),
    });

    // Show warnings (non-blocking)
    if (validation.warnings.length > 0) {
      setValidationWarnings(validation.warnings);
    }

    // Show errors and BLOCK submission
    if (!validation.valid) {
      setValidationErrors(validation.errors);
      return;
    }

    setIsCreating(true);

    try {
      const batchBody = {
        projectName: projectName.trim() || null,
        customerId: customerId ?? null,
        rooms: rooms.map((room) => ({
          name: room.name,
          pieces: room.pieces.map((piece) => ({
            name: piece.name,
            lengthMm: Number(piece.length_mm),
            widthMm: Number(piece.width_mm),
            thicknessMm: Number(piece.thickness_mm),
            edgeTop: piece.edges.top || null,
            edgeBottom: piece.edges.bottom || null,
            edgeLeft: piece.edges.left || null,
            edgeRight: piece.edges.right || null,
            cutouts: piece.cutouts.map((c) => ({
              name: c.type,
              quantity: Number(c.quantity),
            })),
          })),
        })),
      };

      const res = await fetch('/api/quotes/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batchBody),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const parsed = errData as { error?: string; errors?: ValidationError[] };

        // Show structured API validation errors if available
        if (parsed.errors && Array.isArray(parsed.errors)) {
          setValidationErrors(parsed.errors);
        } else {
          setValidationErrors([{
            field: 'api',
            message: parsed.error || 'Failed to create quote. Please try again.',
            severity: 'error' as const,
          }]);
        }
        setIsCreating(false);
        return;
      }

      const data = await res.json() as {
        quoteId?: number;
        redirectUrl?: string;
        pricingWarnings?: string[];
      };
      if (!data.quoteId) throw new Error('No quote ID returned from server');

      // Show pricing warnings as a brief toast if present
      if (data.pricingWarnings && data.pricingWarnings.length > 0) {
        toast(data.pricingWarnings[0], { icon: '\u26A0\uFE0F' });
      }

      router.push(`/quotes/${data.quoteId}?mode=edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quote');
      setIsCreating(false);
    }
  }, [rooms, isCreating, projectName, customerId, router]);

  /* ─── Handle Enter key on last field to submit ─── */
  const handleFormKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && canSubmit && !isCreating) {
      // Only submit if we're on an input/select that isn't part of a multi-line flow
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
        e.preventDefault();
        handleCreateQuote();
      }
    }
  }, [canSubmit, isCreating, handleCreateQuote]);

  /* ─── Render: ONE scrollable page ─── */

  return (
    <div className="max-w-4xl mx-auto" onKeyDown={handleFormKeyDown}>
      {onBack && (
        <button
          onClick={onBack}
          className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          &larr; Back to options
        </button>
      )}

      <h2 className="text-xl font-bold text-gray-900 mb-1">New Quote</h2>
      <p className="text-sm text-gray-500 mb-6">Fill in the project details, rooms, and pieces below. One screen, one submit.</p>

      <div className="space-y-6">

        {/* ── Section A: Project Info ─────────────────────────────────── */}
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr] gap-4">
            {/* Project name */}
            <div>
              <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1">
                Project Name <span className="text-red-500">*</span>
              </label>
              <input
                ref={projectNameRef}
                id="projectName"
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. Smith Kitchen Reno"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>

            {/* Room count */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Rooms
              </label>
              <div className="flex gap-2 flex-wrap items-center">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => handleRoomCountSelect(n)}
                    className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${
                      roomCount === n
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-gray-300 bg-white text-gray-700 hover:border-amber-300'
                    }`}
                  >
                    {n}
                  </button>
                ))}
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={roomCount > 5 ? roomCount : ''}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val > 0) {
                      handleRoomCountSelect(val);
                    }
                  }}
                  placeholder="5+"
                  className="w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>

          {/* Quick-suggestion chips */}
          <div>
            <p className="text-xs text-gray-500 mb-1">Quick fill rooms:</p>
            <div className="flex flex-wrap gap-1.5">
              {ROOM_CHIPS.map((chip) => {
                const alreadyUsed = rooms.some((r) => r.name === chip);
                return (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => handleChipClick(chip)}
                    disabled={alreadyUsed}
                    className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                      alreadyUsed
                        ? 'border-gray-100 bg-gray-50 text-gray-300 cursor-not-allowed'
                        : 'border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700'
                    }`}
                  >
                    {alreadyUsed ? `\u2713 ${chip}` : chip}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* ── Section B + C + D: Rooms with inline pieces ─────────── */}
        {rooms.map((room, roomIndex) => (
          <div key={roomIndex} className="border border-gray-200 rounded-lg overflow-hidden">
            {/* Room header */}
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-b border-gray-200">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="text-xs font-semibold text-gray-400 uppercase">Room {roomIndex + 1}</span>
                <input
                  type="text"
                  value={room.name}
                  onChange={(e) => updateRoomName(roomIndex, e.target.value)}
                  placeholder={`Room ${roomIndex + 1}`}
                  className="flex-1 min-w-0 rounded border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-gray-500">Pieces:</span>
                  {[1, 2, 3, 4].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => updateRoomPieceCount(roomIndex, n)}
                      className={`w-7 h-7 rounded text-xs font-medium transition-colors ${
                        room.pieceCount === n
                          ? 'bg-amber-100 text-amber-700 border border-amber-300'
                          : 'bg-white text-gray-600 border border-gray-200 hover:border-amber-300'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={room.pieceCount > 4 ? room.pieceCount : ''}
                    onChange={(e) => updateRoomPieceCount(roomIndex, parseInt(e.target.value, 10) || 1)}
                    placeholder="4+"
                    className="w-12 rounded border border-gray-300 px-1 py-1 text-xs text-center focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                  />
                </div>
              </div>
              {rooms.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeRoom(roomIndex)}
                  className="ml-2 text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove room"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Pieces within this room — Section C (dimensions) */}
            {room.pieces.length > 0 && (
              <div className="p-4 space-y-3">
                {/* Column headers */}
                <div className="grid grid-cols-[1fr_100px_100px_100px] gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
                  <span>Piece Name</span>
                  <span>Length (mm)</span>
                  <span>Width (mm)</span>
                  <span>Thickness</span>
                </div>

                {room.pieces.map((piece, pieceIndex) => {
                  const lengthMissing = piece.length_mm <= 0;
                  return (
                    <div key={pieceIndex} className="space-y-1">
                      {/* Dimension row */}
                      <div className="grid grid-cols-[1fr_100px_100px_100px] gap-2 items-center">
                        <input
                          type="text"
                          value={piece.name}
                          onChange={(e) =>
                            updatePiece(roomIndex, pieceIndex, 'name', e.target.value)
                          }
                          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          tabIndex={0}
                        />
                        <input
                          type="number"
                          min={1}
                          value={piece.length_mm || ''}
                          onChange={(e) =>
                            updatePiece(
                              roomIndex,
                              pieceIndex,
                              'length_mm',
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                          placeholder="Required"
                          className={`rounded border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ${
                            lengthMissing
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300'
                          }`}
                          tabIndex={0}
                        />
                        <input
                          type="number"
                          min={1}
                          value={piece.width_mm}
                          onChange={(e) =>
                            updatePiece(
                              roomIndex,
                              pieceIndex,
                              'width_mm',
                              parseInt(e.target.value, 10) || 0,
                            )
                          }
                          className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          tabIndex={0}
                        />
                        <ThicknessSelector
                          value={piece.thickness_mm}
                          onChange={(val) =>
                            updatePiece(roomIndex, pieceIndex, 'thickness_mm', val)
                          }
                        />
                      </div>

                      {/* Section D: Edges & Cutouts inline (MiniPieceEditor) */}
                      <div className="ml-1">
                        <MiniPieceEditor
                          piece={piece}
                          onChange={(updated) =>
                            updateWizardPiece(roomIndex, pieceIndex, updated)
                          }
                          edgeTypes={edgeTypes}
                          cutoutTypes={cutoutTypes}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}

        {/* Add room button */}
        {rooms.length < 20 && (
          <button
            type="button"
            onClick={addRoom}
            className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-amber-300 hover:text-amber-700 transition-colors"
          >
            + Add Room
          </button>
        )}

        {/* Validation errors */}
        {validationErrors.length > 0 && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <h4 className="font-medium text-red-800 mb-2">Please fix the following:</h4>
            <ul className="list-disc pl-5 space-y-1">
              {validationErrors.map((err, i) => (
                <li key={i} className="text-sm text-red-700">{err.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Validation warnings */}
        {validationWarnings.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <ul className="space-y-1">
              {validationWarnings.map((warn, i) => (
                <li key={i} className="text-sm text-amber-700">{warn.message}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Length validation message */}
        {rooms.some((r) => r.pieces.length > 0) && !allLengthsFilled && (
          <p className="text-sm text-red-600">
            All pieces require a length before creating the quote.
          </p>
        )}

        {/* Single submit button */}
        <div className="flex justify-end pt-2 pb-4">
          <button
            type="button"
            onClick={handleCreateQuote}
            disabled={!canSubmit || isCreating}
            className="px-8 py-3 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <svg className="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Creating...
              </>
            ) : (
              'Create Quote \u2192'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Thickness Selector ─── */

function ThicknessSelector({
  value,
  onChange,
}: {
  value: number;
  onChange: (val: number) => void;
}) {
  const [isCustom, setIsCustom] = useState(
    !THICKNESS_OPTIONS.includes(value) && value !== 0,
  );

  if (isCustom) {
    return (
      <div className="flex items-center gap-1">
        <input
          type="number"
          min={20}
          step={1}
          value={value}
          onChange={(e) => onChange(parseInt(e.target.value, 10) || 20)}
          className="w-16 rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          tabIndex={0}
        />
        <span className="text-xs text-gray-500">mm</span>
        <button
          type="button"
          onClick={() => {
            setIsCustom(false);
            onChange(20);
          }}
          className="text-xs text-gray-400 hover:text-gray-600 ml-1"
          title="Back to presets"
        >
          &times;
        </button>
      </div>
    );
  }

  return (
    <select
      value={value}
      onChange={(e) => {
        const val = e.target.value;
        if (val === 'custom') {
          setIsCustom(true);
        } else {
          onChange(parseInt(val, 10));
        }
      }}
      className="rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
      tabIndex={0}
    >
      {THICKNESS_OPTIONS.map((t) => (
        <option key={t} value={t}>
          {t}mm
        </option>
      ))}
      <option value="custom">Custom</option>
    </select>
  );
}
