'use client';

import { useState, useCallback } from 'react';
import {
  getDefaultRoomNames,
  getRoomPieceSuggestions,
  getPieceDefaults,
} from '@/lib/services/quote-setup-defaults';

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

interface ManualQuoteWizardProps {
  onComplete: (data: {
    projectName: string;
    rooms: WizardRoom[];
  }) => void;
  onBack?: () => void;
}

/* ─── Quick-suggestion chips for room names ─── */
const ROOM_CHIPS = ['Kitchen', 'Bathroom', 'Ensuite', 'Laundry', 'Powder Room', 'Bar', 'Outdoor'];

const THICKNESS_OPTIONS = [20, 40];

/* ─── Component ─── */

export function ManualQuoteWizard({ onComplete, onBack }: ManualQuoteWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [projectName, setProjectName] = useState('');
  const [rooms, setRooms] = useState<WizardRoom[]>([]);
  const [roomCount, setRoomCount] = useState<number>(1);

  /* ─── Step 1 handlers ─── */

  const handleRoomCountSelect = useCallback((count: number) => {
    setRoomCount(count);
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

  const canAdvanceStep1 = projectName.trim().length > 0 && roomCount > 0;

  const handleStep1Next = useCallback(() => {
    if (!canAdvanceStep1) return;
    // Ensure rooms are initialised if user hasn't clicked a quick-select
    if (!rooms.length) {
      handleRoomCountSelect(roomCount);
    }
    setStep(2);
  }, [canAdvanceStep1, rooms.length, roomCount, handleRoomCountSelect]);

  /* ─── Step 2 handlers ─── */

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
      updated[index] = { ...updated[index], pieceCount: clamped };
      return updated;
    });
  }, []);

  const handleChipClick = useCallback((chipName: string) => {
    setRooms((prev) => {
      if (!prev.length) return prev;
      const updated = [...prev];
      const emptyIndex = updated.findIndex((r) => !r.name.trim() || r.name.startsWith('Room '));
      if (emptyIndex === -1) return prev;
      updated[emptyIndex] = { ...updated[emptyIndex], name: chipName };
      return updated;
    });
  }, []);

  const handleStep2Next = useCallback(() => {
    if (!rooms.length) return;
    // Generate pieces for each room using smart defaults
    const updatedRooms = rooms.map((room) => {
      const suggestions = getRoomPieceSuggestions(room.name);
      const pieces: WizardPiece[] = [];

      for (let i = 0; i < room.pieceCount; i++) {
        const pieceName = suggestions[i] || `Piece ${i + 1}`;
        const defaults = getPieceDefaults(pieceName);
        pieces.push({
          name: pieceName,
          length_mm: 0, // User must enter — cannot guess
          width_mm: defaults.width_mm,
          thickness_mm: 20,
          edges: { ...defaults.edges },
          cutouts: defaults.suggestedCutouts.map((type) => ({ type, quantity: 1 })),
        });
      }

      return { ...room, pieces };
    });
    setRooms(updatedRooms);
    setStep(3);
  }, [rooms]);

  /* ─── Step 3 handlers ─── */

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

  const allLengthsFilled = rooms.every((room) =>
    room.pieces.every((piece) => piece.length_mm > 0),
  );

  const handleStep3Next = useCallback(() => {
    if (!allLengthsFilled) return;
    if (!rooms.length) return;
    onComplete({ projectName, rooms });
  }, [allLengthsFilled, rooms, projectName, onComplete]);

  /* ─── Render helpers ─── */

  const renderStepIndicator = () => (
    <div className="flex items-centre gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              s === step
                ? 'bg-amber-500 text-white'
                : s < step
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-gray-100 text-gray-400'
            }`}
          >
            {s < step ? '\u2713' : s}
          </div>
          {s < 3 && (
            <div
              className={`w-8 h-0.5 ${s < step ? 'bg-amber-300' : 'bg-gray-200'}`}
            />
          )}
        </div>
      ))}
    </div>
  );

  /* ─── Step 1: Project Name + Room Count ─── */

  if (step === 1) {
    return (
      <div className="max-w-2xl mx-auto">
        {onBack && (
          <button
            onClick={onBack}
            className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            &larr; Back to options
          </button>
        )}
        {renderStepIndicator()}

        <h2 className="text-xl font-bold text-gray-900 mb-1">Project Details</h2>
        <p className="text-sm text-gray-500 mb-6">Name your project and choose how many rooms.</p>

        <div className="space-y-6">
          {/* Project name */}
          <div>
            <label htmlFor="projectName" className="block text-sm font-medium text-gray-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <input
              id="projectName"
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g. Smith Kitchen Reno"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Room count */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Number of Rooms
            </label>
            <div className="flex gap-2 flex-wrap">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  onClick={() => handleRoomCountSelect(n)}
                  className={`w-12 h-12 rounded-lg border text-sm font-medium transition-colors ${
                    roomCount === n
                      ? 'border-amber-500 bg-amber-50 text-amber-700'
                      : 'border-gray-300 bg-white text-gray-700 hover:border-amber-300'
                  }`}
                >
                  {n}
                </button>
              ))}
              <div className="flex items-center gap-2 ml-2">
                <span className="text-sm text-gray-500">or</span>
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
                  placeholder="Custom"
                  className="w-20 rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8 flex justify-end">
          <button
            onClick={handleStep1Next}
            disabled={!canAdvanceStep1}
            className="px-6 py-2 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    );
  }

  /* ─── Step 2: Room Names + Piece Counts ─── */

  if (step === 2) {
    return (
      <div className="max-w-2xl mx-auto">
        {renderStepIndicator()}

        <h2 className="text-xl font-bold text-gray-900 mb-1">Room Setup</h2>
        <p className="text-sm text-gray-500 mb-6">Name each room and set how many pieces it needs.</p>

        {/* Room table */}
        <div className="space-y-3">
          <div className="grid grid-cols-[1fr_120px] gap-3 text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
            <span>Room Name</span>
            <span>Pieces</span>
          </div>
          {rooms.map((room, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px] gap-3 items-center">
              <input
                type="text"
                value={room.name}
                onChange={(e) => updateRoomName(i, e.target.value)}
                placeholder={`Room ${i + 1}`}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
              <input
                type="number"
                min={1}
                max={20}
                value={room.pieceCount}
                onChange={(e) => updateRoomPieceCount(i, parseInt(e.target.value, 10) || 1)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
              />
            </div>
          ))}
        </div>

        {/* Quick-suggestion chips */}
        <div className="mt-4">
          <p className="text-xs text-gray-500 mb-2">Quick fill:</p>
          <div className="flex flex-wrap gap-2">
            {ROOM_CHIPS.map((chip) => (
              <button
                key={chip}
                onClick={() => handleChipClick(chip)}
                className="px-3 py-1 rounded-full text-xs font-medium border border-gray-200 bg-white text-gray-600 hover:border-amber-300 hover:text-amber-700 transition-colors"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => setStep(1)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors"
          >
            &larr; Back
          </button>
          <button
            onClick={handleStep2Next}
            className="px-6 py-2 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 transition-colors"
          >
            Next &rarr;
          </button>
        </div>
      </div>
    );
  }

  /* ─── Step 3: Piece Names + Dimensions (spreadsheet-style) ─── */

  if (step === 3) {
    return (
      <div className="max-w-4xl mx-auto">
        {renderStepIndicator()}

        <h2 className="text-xl font-bold text-gray-900 mb-1">Piece Dimensions</h2>
        <p className="text-sm text-gray-500 mb-6">
          Review names and widths (auto-filled from smart defaults). Enter length for each piece.
        </p>

        <div className="space-y-8">
          {rooms.map((room, roomIndex) => {
            if (!room.pieces.length) return null;

            return (
              <div key={roomIndex}>
                <h3 className="text-sm font-semibold text-gray-800 uppercase tracking-wider mb-3">
                  {room.name}
                  <span className="ml-2 text-xs font-normal text-gray-400">
                    ({room.pieces.length} {room.pieces.length === 1 ? 'piece' : 'pieces'})
                  </span>
                </h3>

                {/* Column headers */}
                <div className="grid grid-cols-[1fr_120px_120px_130px] gap-2 text-xs font-medium text-gray-500 uppercase tracking-wider px-1 mb-2">
                  <span>Name</span>
                  <span>Length (mm)</span>
                  <span>Width (mm)</span>
                  <span>Thickness</span>
                </div>

                <div className="space-y-2">
                  {room.pieces.map((piece, pieceIndex) => {
                    const lengthMissing = piece.length_mm <= 0;
                    return (
                      <div
                        key={pieceIndex}
                        className="grid grid-cols-[1fr_120px_120px_130px] gap-2 items-center"
                      >
                        {/* Piece name */}
                        <input
                          type="text"
                          value={piece.name}
                          onChange={(e) =>
                            updatePiece(roomIndex, pieceIndex, 'name', e.target.value)
                          }
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          tabIndex={0}
                        />

                        {/* Length — required, blank by default */}
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
                          className={`rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent ${
                            lengthMissing
                              ? 'border-red-300 bg-red-50'
                              : 'border-gray-300'
                          }`}
                          tabIndex={0}
                        />

                        {/* Width — pre-filled from smart defaults */}
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
                          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
                          tabIndex={0}
                        />

                        {/* Thickness */}
                        <ThicknessSelector
                          value={piece.thickness_mm}
                          onChange={(val) =>
                            updatePiece(roomIndex, pieceIndex, 'thickness_mm', val)
                          }
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Validation message */}
        {!allLengthsFilled && (
          <p className="mt-4 text-sm text-red-600">
            All pieces require a length before continuing.
          </p>
        )}

        <div className="mt-8 flex justify-between">
          <button
            onClick={() => setStep(2)}
            className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 text-sm hover:bg-gray-50 transition-colors"
          >
            &larr; Back
          </button>
          <button
            onClick={handleStep3Next}
            disabled={!allLengthsFilled}
            className="px-6 py-2 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            Next &rarr; Edges &amp; Cutouts
          </button>
        </div>
      </div>
    );
  }

  return null;
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
          className="w-16 rounded-lg border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          tabIndex={0}
        />
        <span className="text-xs text-gray-500">mm</span>
        <button
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
      className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent bg-white"
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
