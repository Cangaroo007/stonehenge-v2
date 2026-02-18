'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import type { PresetPieceConfig } from '@/lib/services/room-preset-service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PresetSuggestion {
  id: string;
  name: string;
  description: string | null;
  piece_config: PresetPieceConfig[];
  usage_count: number;
}

interface RoomNameAutocompleteProps {
  value: string;
  onChange: (name: string) => void;
  /** Called when a preset suggestion is selected — provides pieces to prefill */
  onPresetSelect?: (pieces: PresetPieceConfig[]) => void;
  /** Fallback plain suggestions (from /api/suggestions) */
  fallbackSuggestions?: string[];
  placeholder?: string;
  className?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RoomNameAutocomplete({
  value,
  onChange,
  onPresetSelect,
  fallbackSuggestions = [],
  placeholder,
  className,
}: RoomNameAutocompleteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [presetResults, setPresetResults] = useState<PresetSuggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Search presets on keystroke (debounced 300ms)
  const searchPresets = useCallback(async (query: string) => {
    if (query.trim().length < 2) {
      setPresetResults([]);
      return;
    }

    setIsSearching(true);
    try {
      const res = await fetch(
        `/api/room-presets?q=${encodeURIComponent(query)}&limit=6`,
      );
      if (res.ok) {
        const data = (await res.json()) as { presets: PresetSuggestion[] };
        setPresetResults(data.presets || []);
      }
    } catch {
      // Silent — autocomplete is a nice-to-have
    } finally {
      setIsSearching(false);
    }
  }, []);

  // Debounced search on value change
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchPresets(value);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [value, searchPresets]);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  // Build combined suggestion list: presets first, then fallback strings
  const filteredFallback = value.trim()
    ? fallbackSuggestions.filter(
        (s) =>
          s.toLowerCase().includes(value.toLowerCase()) &&
          !presetResults.some((p) => p.name.toLowerCase() === s.toLowerCase()),
      )
    : fallbackSuggestions.filter(
        (s) => !presetResults.some((p) => p.name.toLowerCase() === s.toLowerCase()),
      );

  const totalItems = presetResults.length + filteredFallback.length;
  const maxVisible = 8;

  const handleSelectPreset = useCallback(
    (preset: PresetSuggestion) => {
      onChange(preset.name);
      if (onPresetSelect) {
        onPresetSelect(preset.piece_config);
      }
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [onChange, onPresetSelect],
  );

  const handleSelectFallback = useCallback(
    (name: string) => {
      onChange(name);
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        setActiveIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < presetResults.length) {
          handleSelectPreset(presetResults[activeIndex]);
        } else if (activeIndex >= presetResults.length) {
          handleSelectFallback(
            filteredFallback[activeIndex - presetResults.length],
          );
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setIsOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => {
          if (presetResults.length > 0 || fallbackSuggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={
          className ||
          'w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent'
        }
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
        autoComplete="off"
      />

      {isOpen && totalItems > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-auto"
          style={{ maxHeight: `${maxVisible * 48}px` }}
          role="listbox"
        >
          {/* Preset results */}
          {presetResults.map((preset, idx) => (
            <li
              key={preset.id}
              role="option"
              aria-selected={idx === activeIndex}
              className={`px-3 py-2 cursor-pointer transition-colors ${
                idx === activeIndex
                  ? 'bg-amber-50 text-amber-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelectPreset(preset);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{preset.name}</span>
                <span className="text-xs text-gray-400 ml-2 whitespace-nowrap">
                  Used {preset.usage_count}{' '}
                  {preset.usage_count === 1 ? 'time' : 'times'}
                </span>
              </div>
              <div className="text-xs text-gray-500">
                {preset.piece_config.length}{' '}
                {preset.piece_config.length === 1 ? 'piece' : 'pieces'}
                {preset.description ? ` — ${preset.description}` : ''}
              </div>
            </li>
          ))}

          {/* Divider between preset and fallback results */}
          {presetResults.length > 0 && filteredFallback.length > 0 && (
            <li className="border-t border-gray-100" role="separator" />
          )}

          {/* Fallback plain suggestions */}
          {filteredFallback.map((name, idx) => {
            const globalIdx = presetResults.length + idx;
            return (
              <li
                key={`fb-${name}`}
                role="option"
                aria-selected={globalIdx === activeIndex}
                className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                  globalIdx === activeIndex
                    ? 'bg-amber-50 text-amber-900'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleSelectFallback(name);
                }}
                onMouseEnter={() => setActiveIndex(globalIdx)}
              >
                {name}
              </li>
            );
          })}

          {/* Loading indicator */}
          {isSearching && (
            <li className="px-3 py-2 text-xs text-gray-400 text-center">
              Searching presets...
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
