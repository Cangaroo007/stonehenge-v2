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
  onSelect: (template: TemplateSummary) => void;
}

const CATEGORY_TABS = [
  { key: 'all', label: 'All' },
  { key: 'kitchen', label: 'Kitchen' },
  { key: 'bathroom', label: 'Bathroom' },
  { key: 'full-unit', label: 'Full Unit' },
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
};

function getCategoryIcon(category: string): string {
  return CATEGORY_ICONS[category.toLowerCase()] || '\uD83D\uDCCB';
}

export default function TemplateSelector({ onBack, onSelect }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');

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
    : templates.filter(t => t.category.toLowerCase() === activeCategory);

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
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

      {/* Category filter tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
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
            <div key={template.id} className="card p-5 flex flex-col">
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

              <button
                onClick={() => onSelect(template)}
                className="btn-primary w-full text-sm"
              >
                Use Template
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
