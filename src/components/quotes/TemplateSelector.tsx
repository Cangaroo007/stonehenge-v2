'use client';

import { useState, useEffect } from 'react';

interface TemplateSummary {
  id: string;
  name: string;
  description: string | null;
  category: string;
  isBuiltIn: boolean;
  pieceCount: number;
  roomCount: number;
  estimatedAreaSqm: number;
}

interface TemplateSelectorProps {
  onBack: () => void;
  onSelect?: (template: TemplateSummary) => void;
  onApply?: (templates: TemplateSummary[]) => void;
}

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'other', label: 'Other' },
  { key: 'laundry', label: 'Laundry' },
];

const CATEGORY_ICONS: Record<string, string> = {
  kitchen: '\uD83C\uDF73',
  bathroom: '\uD83D\uDEBF',
  laundry: '\uD83E\uDDF2',
  ensuite: '\uD83D\uDEBF',
  study: '\uD83D\uDCDA',
  'full-unit': '\uD83C\uDFE0',
  'multi-room': '\uD83C\uDFE0',
  other: '\uD83D\uDCCB',
};

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category.toLowerCase()] || '\uD83D\uDCCB';
}

export default function TemplateSelector({ onBack, onSelect, onApply }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);

  useEffect(() => {
    async function fetchTemplates() {
      try {
        const res = await fetch('/api/starter-templates?isActive=true');
        if (!res.ok) throw new Error('Failed to load templates');
        const data = await res.json();
        setTemplates(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load templates');
      } finally {
        setIsLoading(false);
      }
    }
    fetchTemplates();
  }, []);

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => {
        const cat = t.category.toLowerCase();
        if (activeCategory === 'other') {
          return !['kitchen', 'bathroom', 'laundry'].includes(cat);
        }
        return cat === activeCategory;
      });

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Delete template "${name}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/starter-templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      setTemplates(prev => prev.filter(t => t.id !== id));
      setSelected(prev => { const next = new Set(prev); next.delete(id); return next; });
    } catch {
      alert('Failed to delete template. Please try again.');
    }
  };

  const handleApply = () => {
    const selectedTemplates = templates.filter(t => selected.has(t.id));
    if (selectedTemplates.length === 0) return;
    if (onApply) {
      onApply(selectedTemplates);
    } else if (onSelect) {
      onSelect(selectedTemplates[0]);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  return (
    <div className="max-w-4xl mx-auto pb-24">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            className="text-gray-500 hover:text-gray-700"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Choose a Template</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setManageMode(!manageMode)}
            className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${
              manageMode
                ? 'bg-gray-900 text-white border-gray-900'
                : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
            }`}
          >
            {manageMode ? 'Done' : 'Manage'}
          </button>
          <a href="/templates/new" className="btn-primary text-sm px-3 py-1.5">
            + New Template
          </a>
        </div>
      </div>

      {/* Category filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap items-center">
        {CATEGORY_TABS.map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveCategory(tab.key)}
            className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
              activeCategory === tab.key
                ? 'bg-amber-100 text-amber-800 border border-amber-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
        {!manageMode && filtered.length > 0 && (
          <button
            onClick={() => setSelected(prev => {
              const next = new Set(prev);
              filtered.forEach(t => next.add(t.id));
              return next;
            })}
            className="text-xs text-amber-600 hover:text-amber-700 ml-auto"
          >
            Select all{activeCategory !== 'all' ? ` ${activeCategory}` : ''}
          </button>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-12 text-gray-500">Loading templates...</div>
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-6">
          {error}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && filtered.length === 0 && (
        <div className="text-center py-12 card">
          <p className="text-gray-500 mb-2">No templates available{activeCategory !== 'all' ? ` in ${activeCategory}` : ''}.</p>
          <a
            href="/admin/pricing"
            className="text-amber-600 hover:text-amber-700 text-sm font-medium"
          >
            Manage templates in Pricing Admin
          </a>
        </div>
      )}

      {/* Template grid */}
      {!isLoading && filtered.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(template => (
            <div
              key={template.id}
              className={`card p-5 flex flex-col relative transition-colors ${
                selected.has(template.id) ? 'border-2 border-amber-400' : ''
              }`}
            >
              {/* Top-right controls: checkbox or manage icons */}
              {manageMode ? (
                <div className="absolute top-3 right-3 flex gap-1">
                  {!template.isBuiltIn ? (
                    <>
                      <a
                        href={`/templates/${template.id}/edit`}
                        className="p-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-600"
                        title="Edit"
                      >
                        ✏️
                      </a>
                      <button
                        onClick={() => handleDelete(template.id, template.name)}
                        className="p-1.5 rounded bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600"
                        title="Delete"
                      >
                        🗑️
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400 px-2 py-1 bg-gray-50 rounded">
                      🔒 Built-in
                    </span>
                  )}
                </div>
              ) : (
                <div className="absolute top-3 right-3">
                  <input
                    type="checkbox"
                    checked={selected.has(template.id)}
                    onChange={() => toggleSelect(template.id)}
                    className="h-4 w-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
                  />
                </div>
              )}

              <div className="flex items-start gap-3 mb-3">
                <span className="text-2xl">{getCategoryIcon(template.category)}</span>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-gray-900 truncate">{template.name}</h3>
                  {template.description && (
                    <p className="text-sm text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                  )}
                </div>
              </div>

              <div className="text-sm text-gray-600 space-y-1 mb-4 flex-1">
                <p>{template.pieceCount} piece{template.pieceCount !== 1 ? 's' : ''}</p>
                <p>~{template.estimatedAreaSqm}m&sup2;</p>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                  template.isBuiltIn
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-gray-100 text-gray-600'
                }`}>
                  {template.category}
                </span>
              </div>

              {!manageMode && (
                <button
                  onClick={() => toggleSelect(template.id)}
                  className={`w-full text-sm py-2 rounded-lg font-medium transition-colors ${
                    selected.has(template.id)
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : 'btn-primary'
                  }`}
                >
                  {selected.has(template.id) ? '✓ Selected' : 'Select'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Sticky footer when templates selected */}
      {selected.size > 0 && !manageMode && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between shadow-lg z-50">
          <div className="text-sm text-gray-700">
            <span className="font-semibold">{selected.size}</span> template{selected.size !== 1 ? 's' : ''} selected
            <button
              onClick={() => setSelected(new Set())}
              className="ml-3 text-gray-400 hover:text-gray-600 text-xs underline"
            >
              Clear all
            </button>
          </div>
          <button
            onClick={handleApply}
            className="btn-primary px-6 py-2"
          >
            Create Quote →
          </button>
        </div>
      )}
    </div>
  );
}
