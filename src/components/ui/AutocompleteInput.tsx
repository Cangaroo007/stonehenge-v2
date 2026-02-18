'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface AutocompleteInputProps {
  value: string;
  onChange: (value: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  /** Stop click propagation (useful inside expandable rows) */
  stopPropagation?: boolean;
}

export default function AutocompleteInput({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  stopPropagation = false,
}: AutocompleteInputProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filter suggestions by input value (case-insensitive contains)
  const filtered = value.trim()
    ? suggestions.filter((s) =>
        s.toLowerCase().includes(value.toLowerCase())
      )
    : suggestions;

  // Limit to max visible items
  const maxVisible = 6;
  const displayItems = filtered.slice(0, 50); // Cap at 50 for performance

  // Close dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const handleSelect = useCallback(
    (suggestion: string) => {
      onChange(suggestion);
      setIsOpen(false);
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [onChange]
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
        setActiveIndex((prev) =>
          prev < displayItems.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : displayItems.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < displayItems.length) {
          handleSelect(displayItems[activeIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  // Highlight matching text in suggestion
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;
    const lower = text.toLowerCase();
    const idx = lower.indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <strong className="font-semibold">{text.slice(idx, idx + query.length)}</strong>
        {text.slice(idx + query.length)}
      </>
    );
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
          if (suggestions.length > 0) {
            setIsOpen(true);
          }
        }}
        onKeyDown={handleKeyDown}
        onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
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
      {isOpen && displayItems.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg overflow-auto"
          style={{ maxHeight: `${maxVisible * 36}px` }}
          role="listbox"
        >
          {displayItems.map((item, idx) => (
            <li
              key={item}
              role="option"
              aria-selected={idx === activeIndex}
              className={`px-3 py-2 text-sm cursor-pointer transition-colors ${
                idx === activeIndex
                  ? 'bg-amber-50 text-amber-900'
                  : 'text-gray-700 hover:bg-gray-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click fires
                handleSelect(item);
              }}
              onMouseEnter={() => setActiveIndex(idx)}
            >
              {highlightMatch(item, value)}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
