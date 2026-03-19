'use client';

import { useState, useMemo, useRef, useEffect } from 'react';

export interface MaterialPickerMaterial {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
  supplier?: { id: string; name: string } | null;
}

interface MaterialPickerV2Props {
  materials: MaterialPickerMaterial[];
  value: number | null;
  onChange: (
    materialId: number | null,
    material: MaterialPickerMaterial | null,
    collectionInfo?: { collectionOnly: true; collectionName: string } | null
  ) => void;
  placeholder?: string;
  collectionOnly?: boolean;
  collectionName?: string | null;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
}

export default function MaterialPickerV2({
  materials,
  value,
  onChange,
  placeholder = 'Select material',
  collectionOnly = false,
  collectionName = null,
}: MaterialPickerV2Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState<string | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  // Focus search on open
  useEffect(() => {
    if (open) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearch('');
      setSelectedSupplier(null);
      setSelectedCollection(null);
    }
  }, [open]);

  // Selected material for display
  const selectedMaterial = useMemo(
    () => (value != null ? materials.find(m => m.id === value) : null) ?? null,
    [materials, value]
  );

  // Suppliers derived from materials
  const suppliers = useMemo(() => {
    const map = new Map<string, string>();
    materials.forEach(m => {
      if (m.supplier) map.set(m.supplier.id, m.supplier.name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [materials]);

  // Collections filtered by supplier
  const collections = useMemo(() => {
    const filtered = selectedSupplier
      ? materials.filter(m => m.supplier?.id === selectedSupplier)
      : materials;
    return Array.from(new Set(filtered.map(m => m.collection).filter(Boolean))) as string[];
  }, [materials, selectedSupplier]);

  // Colours filtered by supplier + collection
  const colours = useMemo(() => {
    return materials.filter(m => {
      if (selectedSupplier && m.supplier?.id !== selectedSupplier) return false;
      if (selectedCollection && m.collection !== selectedCollection) return false;
      return true;
    });
  }, [materials, selectedSupplier, selectedCollection]);

  // Search filter — across all levels
  const searchFiltered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.toLowerCase();
    return materials.filter(m =>
      m.name.toLowerCase().includes(q) ||
      (m.collection ?? '').toLowerCase().includes(q) ||
      (m.supplier?.name ?? '').toLowerCase().includes(q)
    );
  }, [materials, search]);

  // Collection average price (per sqm)
  const collectionAvgPrice = useMemo(() => {
    if (!selectedCollection) return null;
    const inCollection = materials.filter(m => m.collection === selectedCollection);
    if (!inCollection.length) return null;
    const avg = inCollection.reduce((sum, m) => sum + (m.pricePerSqm ?? 0), 0) / inCollection.length;
    return Math.round(avg);
  }, [materials, selectedCollection]);

  const handleSelectMaterial = (mat: MaterialPickerMaterial) => {
    onChange(mat.id, mat);
    setOpen(false);
  };

  const handleUseCollectionAvg = () => {
    if (!selectedCollection) return;
    const inCollection = materials.filter(m => m.collection === selectedCollection);
    if (!inCollection.length) return;
    const first = inCollection[0];
    onChange(first.id, first, { collectionOnly: true, collectionName: selectedCollection });
    setOpen(false);
    setSearch('');
    setSelectedSupplier(null);
    setSelectedCollection(null);
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 px-2 py-0.5 text-xs border border-gray-200 rounded bg-white hover:border-gray-300 max-w-[200px] truncate"
      >
        <span className="truncate">
          {collectionOnly && collectionName
            ? <span className="italic text-amber-600">{collectionName} (collection)</span>
            : selectedMaterial
              ? `${selectedMaterial.name}${selectedMaterial.collection ? ` — ${selectedMaterial.collection}` : ''}`
              : placeholder}
        </span>
        <svg className="w-3 h-3 flex-shrink-0 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg w-[580px]">
          {/* Search bar */}
          <div className="p-2 border-b border-gray-100">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search colours, collections or suppliers..."
              className="w-full px-2 py-1.5 text-xs border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Search results mode */}
          {searchFiltered ? (
            <div className="max-h-[320px] overflow-y-auto py-1">
              {searchFiltered.map(mat => (
                <button
                  key={mat.id}
                  onClick={() => handleSelectMaterial(mat)}
                  className="w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition-colors flex items-center gap-2"
                >
                  <span className="text-gray-400 flex-shrink-0 w-[100px] truncate">{mat.supplier?.name ?? ''}</span>
                  <span className="text-gray-400 flex-shrink-0 w-[120px] truncate">{mat.collection ?? ''}</span>
                  <span className="flex-1 truncate font-medium">{mat.name}</span>
                  <span className="text-gray-400 flex-shrink-0">{formatCurrency(mat.pricePerSqm)}/m&sup2;</span>
                </button>
              ))}
              {searchFiltered.length === 0 && (
                <div className="px-3 py-4 text-xs text-gray-400 text-center">No materials found</div>
              )}
            </div>
          ) : (
            /* Three-panel mode */
            <div className="flex" style={{ height: 320 }}>
              {/* Panel 1: Suppliers */}
              <div className="w-1/3 border-r border-gray-100 overflow-y-auto">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Supplier
                </div>
                <button
                  onClick={() => { setSelectedSupplier(null); setSelectedCollection(null); }}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    selectedSupplier === null ? 'bg-amber-50 text-amber-800 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  All suppliers
                </button>
                {suppliers.map(s => (
                  <button
                    key={s.id}
                    onClick={() => { setSelectedSupplier(s.id); setSelectedCollection(null); }}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      selectedSupplier === s.id ? 'bg-amber-50 text-amber-800 font-medium' : 'hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                ))}
              </div>

              {/* Panel 2: Collections */}
              <div className="w-1/3 border-r border-gray-100 overflow-y-auto">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Collection
                </div>
                <button
                  onClick={() => setSelectedCollection(null)}
                  className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                    selectedCollection === null ? 'bg-amber-50 text-amber-800 font-medium' : 'hover:bg-gray-50'
                  }`}
                >
                  All collections
                </button>
                {collections.map(c => (
                  <button
                    key={c}
                    onClick={() => setSelectedCollection(c)}
                    className={`w-full text-left px-3 py-1.5 text-xs transition-colors ${
                      selectedCollection === c ? 'bg-amber-50 text-amber-800 font-medium' : 'hover:bg-gray-50'
                    }`}
                  >
                    {c}
                  </button>
                ))}
              </div>

              {/* Panel 3: Colours */}
              <div className="w-1/3 overflow-y-auto">
                <div className="px-2 py-1.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                  Colour
                </div>
                {colours.length > 0 ? (
                  <>
                    {colours.map(mat => (
                      <button
                        key={mat.id}
                        onClick={() => handleSelectMaterial(mat)}
                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-amber-50 transition-colors flex justify-between ${
                          value === mat.id ? 'bg-amber-50 text-amber-800 font-medium' : ''
                        }`}
                      >
                        <span className="truncate">{mat.name}</span>
                        <span className="text-gray-400 ml-1 flex-shrink-0">{formatCurrency(mat.pricePerSqm)}</span>
                      </button>
                    ))}
                    {selectedCollection && collectionAvgPrice != null && (
                      <div className="border-t border-gray-100 mt-1 pt-1">
                        <button
                          onClick={handleUseCollectionAvg}
                          className="w-full text-left px-3 py-1.5 text-xs text-amber-600 italic hover:bg-amber-50 transition-colors"
                        >
                          Use collection avg ~{formatCurrency(collectionAvgPrice)}/m&sup2;
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="px-3 py-4 text-xs text-gray-400 text-center">
                    {selectedCollection ? 'No colours in this collection' : 'Choose a collection'}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
