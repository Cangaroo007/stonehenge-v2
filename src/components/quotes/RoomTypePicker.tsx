'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import {
  ChefHat,
  Bath,
  Droplets,
  WashingMachine,
  Wine,
  Check,
  X,
  Star,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ROOM_PRESETS,
  countPresetPieces,
  presetToApiPayload,
  type RoomPreset,
} from '@/lib/constants/room-presets';
import type { PresetPieceConfig } from '@/lib/services/room-preset-service';

// ---------------------------------------------------------------------------
// Icon map — maps preset icon string to Lucide component
// ---------------------------------------------------------------------------

const ICON_MAP: Record<string, LucideIcon> = {
  ChefHat,
  Bath,
  Droplets,
  WashingMachine,
  Wine,
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CustomPreset {
  id: string;
  name: string;
  icon: string | null;
  description: string | null;
  piece_config: PresetPieceConfig[];
  usage_count: number;
}

interface RoomTypePickerProps {
  onStartFromScratch: () => void;
  onBack: () => void;
  customerId?: number;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoomTypePicker({
  onStartFromScratch,
  onBack,
  customerId,
}: RoomTypePickerProps) {
  const router = useRouter();
  const [selectedSystemIndices, setSelectedSystemIndices] = useState<Set<number>>(new Set());
  const [selectedCustomIds, setSelectedCustomIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);

  // Custom presets state
  const [customPresets, setCustomPresets] = useState<CustomPreset[]>([]);
  const [showAllCustom, setShowAllCustom] = useState(false);
  const [totalCustomCount, setTotalCustomCount] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Load custom presets on mount
  useEffect(() => {
    let cancelled = false;
    const loadPresets = async () => {
      try {
        const res = await fetch('/api/room-presets?limit=50');
        if (res.ok && !cancelled) {
          const data = (await res.json()) as { presets: CustomPreset[] };
          setCustomPresets(data.presets || []);
          setTotalCustomCount(data.presets?.length || 0);
        }
      } catch {
        // Silent — custom presets are additive
      }
    };
    loadPresets();
    return () => { cancelled = true; };
  }, []);

  const visibleCustomPresets = showAllCustom
    ? customPresets
    : customPresets.slice(0, 6);

  // Count totals across both selections
  const selectedSystemPresets = Array.from(selectedSystemIndices).map((i) => ROOM_PRESETS[i]);
  const selectedCustomPresets = customPresets.filter((p) => selectedCustomIds.has(p.id));
  const totalSelectedRooms = selectedSystemIndices.size + selectedCustomIds.size;
  const totalPieces =
    countPresetPieces(selectedSystemPresets) +
    selectedCustomPresets.reduce((sum, p) => sum + p.piece_config.length, 0);

  // Toggle system preset
  const handleSystemCardClick = useCallback((index: number) => {
    setSelectedSystemIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }, []);

  // Toggle custom preset
  const handleCustomCardClick = useCallback((id: string) => {
    setSelectedCustomIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Delete a custom preset
  const handleDeletePreset = useCallback(
    async (e: React.MouseEvent, presetId: string) => {
      e.stopPropagation();
      if (!confirm('Remove this preset? This cannot be undone.')) return;

      setDeletingId(presetId);
      try {
        const res = await fetch(`/api/room-presets/${presetId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setCustomPresets((prev) => prev.filter((p) => p.id !== presetId));
          setSelectedCustomIds((prev) => {
            const next = new Set(prev);
            next.delete(presetId);
            return next;
          });
          setTotalCustomCount((prev) => prev - 1);
        } else {
          toast.error('Failed to delete preset');
        }
      } catch {
        toast.error('Failed to delete preset');
      } finally {
        setDeletingId(null);
      }
    },
    [],
  );

  // Create quote from all selected presets (system + custom)
  const handleCreate = useCallback(async () => {
    if (totalSelectedRooms === 0 || isCreating) return;
    setIsCreating(true);

    try {
      // Build rooms array: system presets + custom presets
      const rooms: Array<{
        name: string;
        pieces: Array<{
          name: string;
          lengthMm: number;
          widthMm: number;
          thicknessMm: number;
          edgeTop: string;
          edgeBottom: string;
          edgeLeft: string;
          edgeRight: string;
          cutouts: Array<{ name: string; quantity: number }>;
        }>;
      }> = [];

      // Add system presets
      const systemPayload = presetToApiPayload(selectedSystemPresets, undefined, customerId);
      rooms.push(...systemPayload.rooms);

      // Add custom presets
      for (const preset of selectedCustomPresets) {
        rooms.push({
          name: preset.name,
          pieces: preset.piece_config.map((p) => ({
            name: p.name,
            lengthMm: p.length_mm,
            widthMm: p.width_mm,
            thicknessMm: p.thickness_mm,
            edgeTop: p.edges.top,
            edgeBottom: p.edges.bottom,
            edgeLeft: p.edges.left,
            edgeRight: p.edges.right,
            cutouts: p.cutouts.map((c) => ({
              name: c.type,
              quantity: c.quantity,
            })),
          })),
        });
      }

      const res = await fetch('/api/quotes/batch-create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: null,
          customerId: customerId ?? null,
          rooms,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const parsed = errData as { error?: string };
        throw new Error(parsed.error || 'Failed to create quote');
      }

      const data = (await res.json()) as {
        quoteId?: number;
        pricingWarnings?: string[];
      };
      if (!data.quoteId) throw new Error('No quote ID returned');

      if (data.pricingWarnings && data.pricingWarnings.length > 0) {
        toast(data.pricingWarnings[0], { icon: '\u26A0\uFE0F' });
      }

      router.push(`/quotes/${data.quoteId}?mode=edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create quote');
      setIsCreating(false);
    }
  }, [totalSelectedRooms, isCreating, selectedSystemPresets, selectedCustomPresets, customerId, router]);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Back button */}
      <button
        onClick={onBack}
        className="mb-4 text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        &larr; Back to options
      </button>

      {/* Header */}
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900">Choose Room Types</h2>
        <p className="mt-1 text-sm text-gray-500">
          Select one or more rooms with pre-populated pieces, or start from scratch.
        </p>
      </div>

      {/* ── Your Presets section (only if custom presets exist) ── */}
      {customPresets.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-3">
            <Star className="h-4 w-4 text-amber-500" />
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
              Your Presets
            </h3>
            <span className="text-xs text-gray-400">Most used</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {visibleCustomPresets.map((preset) => {
              const isSelected = selectedCustomIds.has(preset.id);
              const isDeleting = deletingId === preset.id;
              const IconComponent = preset.icon ? ICON_MAP[preset.icon] : null;

              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => handleCustomCardClick(preset.id)}
                  disabled={isCreating || isDeleting}
                  className={`relative card p-5 text-left transition-all group ${
                    isSelected
                      ? 'border-amber-500 bg-amber-50 shadow-md ring-2 ring-amber-200'
                      : 'hover:border-amber-300 hover:shadow-md'
                  } ${isCreating || isDeleting ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  {/* Checkbox */}
                  <div
                    className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                      isSelected
                        ? 'border-amber-500 bg-amber-500'
                        : 'border-gray-300 bg-white'
                    }`}
                  >
                    {isSelected && <Check className="h-3 w-3 text-white" />}
                  </div>

                  {/* Delete button */}
                  <div
                    className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => handleDeletePreset(e, preset.id)}
                    role="button"
                    tabIndex={-1}
                    title="Remove preset"
                  >
                    <X className="h-4 w-4 text-gray-400 hover:text-red-500" />
                  </div>

                  {/* Icon */}
                  <div className="mb-3">
                    {IconComponent ? (
                      <IconComponent
                        className={`h-8 w-8 transition-colors ${
                          isSelected
                            ? 'text-amber-600'
                            : 'text-gray-400 group-hover:text-amber-500'
                        }`}
                      />
                    ) : (
                      <Star
                        className={`h-8 w-8 transition-colors ${
                          isSelected
                            ? 'text-amber-600'
                            : 'text-gray-300 group-hover:text-amber-400'
                        }`}
                      />
                    )}
                  </div>

                  {/* Label + meta */}
                  <h3 className="text-sm font-semibold text-gray-900 mb-1">
                    {preset.name}
                  </h3>
                  <p className="text-xs text-gray-500 mb-2">
                    {preset.piece_config.length}{' '}
                    {preset.piece_config.length === 1 ? 'piece' : 'pieces'}
                  </p>

                  {/* Usage badge */}
                  <span className="inline-block text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                    Used {preset.usage_count}{' '}
                    {preset.usage_count === 1 ? 'time' : 'times'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* See all link */}
          {totalCustomCount > 6 && !showAllCustom && (
            <button
              type="button"
              onClick={() => setShowAllCustom(true)}
              className="mt-3 text-sm text-amber-600 hover:text-amber-700 underline underline-offset-2"
            >
              See all {totalCustomCount} presets
            </button>
          )}
        </div>
      )}

      {/* ── Standard Presets section ── */}
      <div className="mb-6">
        {customPresets.length > 0 && (
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-3">
            Standard
          </h3>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {ROOM_PRESETS.map((preset, index) => {
            const IconComponent = ICON_MAP[preset.icon];
            const isSelected = selectedSystemIndices.has(index);

            return (
              <button
                key={`${preset.label}-${index}`}
                type="button"
                onClick={() => handleSystemCardClick(index)}
                disabled={isCreating}
                className={`relative card p-5 text-left transition-all group ${
                  isSelected
                    ? 'border-amber-500 bg-amber-50 shadow-md ring-2 ring-amber-200'
                    : 'hover:border-amber-300 hover:shadow-md'
                } ${isCreating ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                {/* Checkbox indicator (always visible) */}
                <div
                  className={`absolute top-3 right-3 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                    isSelected
                      ? 'border-amber-500 bg-amber-500'
                      : 'border-gray-300 bg-white'
                  }`}
                >
                  {isSelected && <Check className="h-3 w-3 text-white" />}
                </div>

                {/* Icon */}
                <div className="mb-3">
                  {IconComponent ? (
                    <IconComponent
                      className={`h-8 w-8 transition-colors ${
                        isSelected
                          ? 'text-amber-600'
                          : 'text-gray-400 group-hover:text-amber-500'
                      }`}
                    />
                  ) : (
                    <div className="h-8 w-8 rounded bg-gray-100" />
                  )}
                </div>

                {/* Label + meta */}
                <h3 className="text-sm font-semibold text-gray-900 mb-1">
                  {preset.label}
                </h3>
                <p className="text-xs text-gray-500 mb-2">{preset.description}</p>

                {/* Piece count badge */}
                <span className="inline-block text-xs font-medium text-gray-400">
                  {preset.pieces.length} {preset.pieces.length === 1 ? 'piece' : 'pieces'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom bar — always visible */}
      <div className="border-t border-gray-200 pt-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">
            {totalSelectedRooms > 0 ? (
              <>
                {totalSelectedRooms} {totalSelectedRooms === 1 ? 'room' : 'rooms'} selected
                {' \u2014 '}
                {totalPieces} {totalPieces === 1 ? 'piece' : 'pieces'}
              </>
            ) : (
              'Select one or more rooms to get started'
            )}
          </span>
          <button
            type="button"
            onClick={handleCreate}
            disabled={totalSelectedRooms === 0 || isCreating}
            className="px-6 py-2.5 rounded-lg bg-amber-500 text-white font-medium text-sm hover:bg-amber-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {isCreating ? (
              <>
                <svg
                  className="animate-spin h-4 w-4 text-white"
                  viewBox="0 0 24 24"
                  fill="none"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Creating...
              </>
            ) : (
              'Create Quote \u2192'
            )}
          </button>
        </div>

        {/* Start from scratch link — below the bottom bar */}
        <div>
          <button
            type="button"
            onClick={onStartFromScratch}
            disabled={isCreating}
            className="text-sm text-gray-500 hover:text-gray-700 underline underline-offset-2 disabled:opacity-50"
          >
            Start from scratch
          </button>
        </div>
      </div>
    </div>
  );
}
