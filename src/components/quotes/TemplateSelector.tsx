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
  { key: 'all',            label: 'All' },
  { key: 'kitchen',        label: 'Kitchen' },
  { key: 'bathroom',       label: 'Bathroom' },
  { key: 'ensuite',        label: 'Ensuite' },
  { key: 'laundry',        label: 'Laundry' },
  { key: 'butlers_pantry', label: "Butler's Pantry" },
  { key: 'outdoor',        label: 'Outdoor' },
];

const CATEGORY_LABELS: Record<string, string> = {
  kitchen:        'Kitchen',
  bathroom:       'Bathroom',
  ensuite:        'Ensuite',
  laundry:        'Laundry',
  butlers_pantry: "Butler's Pantry",
  outdoor:        'Outdoor',
};

function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category.toLowerCase()] ?? category;
}

export default function TemplateSelector({ onBack, onSelect, onApply }: TemplateSelectorProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [manageMode, setManageMode] = useState(false);

  useEffect(() => {
    fetch('/api/starter-templates?isActive=true')
      .then(r => r.ok ? r.json() : Promise.reject('Failed to load'))
      .then(setTemplates)
      .catch(err => setError(typeof err === 'string' ? err : 'Failed to load templates'))
      .finally(() => setIsLoading(false));
  }, []);

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category.toLowerCase() === activeCategory.toLowerCase());

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
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap');

        .tpl-sel {
          font-family: 'DM Sans', sans-serif;
          min-height: 100vh;
          background: #f9fafb;
          color: #111827;
          padding: 40px 24px 120px;
        }
        .tpl-sel-title {
          font-family: 'DM Serif Display', serif;
          font-size: 28px;
          color: #111827;
          letter-spacing: -0.02em;
        }
        @keyframes tplFadeUp {
          from { transform: translateY(16px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .tpl-fade-up { animation: tplFadeUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        .tpl-sel-card {
          background: #ffffff;
          border: 1.5px solid #e5e7eb;
          border-radius: 14px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.12s, background 0.15s;
          position: relative;
          overflow: hidden;
          padding: 18px;
          display: flex;
          flex-direction: column;
          gap: 10px;
        }
        .tpl-sel-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(217,119,6,0.07) 0%, transparent 60%);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .tpl-sel-card:hover::before { opacity: 1; }
        .tpl-sel-card:hover { border-color: #d1d5db; transform: translateY(-2px); }
        .tpl-sel-card.selected {
          border-color: #d97706;
          background: #fffbf5;
        }
        .tpl-sel-card.selected::before { opacity: 1; }

        .tpl-sel-check {
          width: 22px; height: 22px;
          border-radius: 7px;
          border: 1.5px solid #d1d5db;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .tpl-sel-check.checked {
          background: #d97706;
          border-color: #d97706;
        }

        .tpl-sel-tab {
          padding: 6px 16px;
          border-radius: 20px;
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.15s;
          border: 1px solid transparent;
          white-space: nowrap;
          color: #6b7280;
          background: transparent;
          font-family: 'DM Sans', sans-serif;
        }
        .tpl-sel-tab:hover { color: #111827; background: #f3f4f6; }
        .tpl-sel-tab.active {
          color: #d97706;
          background: rgba(217,119,6,0.12);
          border-color: rgba(217,119,6,0.25);
        }

        .tpl-sel-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 9px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }

        .tpl-sel-btn-primary {
          background: #d97706;
          color: #fff;
          border: none;
          border-radius: 10px;
          padding: 10px 24px;
          font-size: 14px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          letter-spacing: 0.01em;
        }
        .tpl-sel-btn-primary:hover { background: #b45309; transform: translateY(-1px); }

        .tpl-sel-btn-ghost {
          background: transparent;
          color: #6b7280;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 8px 16px;
          font-size: 13px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tpl-sel-btn-ghost:hover { color: #111827; border-color: #d1d5db; background: #f3f4f6; }

        .tpl-sel-footer {
          position: fixed;
          bottom: 0; left: 0; right: 0;
          background: #ffffff;
          border-top: 1px solid #e5e7eb;
          padding: 16px 32px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          z-index: 50;
        }
      `}</style>

      <div className="tpl-sel">
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '32px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <button
                onClick={onBack}
                style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', display: 'flex' }}
              >
                <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div>
                <h1 className="tpl-sel-title">Choose a Template</h1>
                <p style={{ fontSize: '13px', color: '#9ca3af', marginTop: '3px' }}>
                  Select one or more room templates to start your quote
                </p>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              <button
                onClick={() => setManageMode(!manageMode)}
                className="tpl-sel-btn-ghost"
              >
                {manageMode ? 'Done' : 'Manage'}
              </button>
              <a
                href="/templates/new"
                style={{
                  background: '#f3f4f6', color: '#111827', border: '1px solid #e5e7eb',
                  borderRadius: '10px', padding: '8px 16px', fontSize: '13px',
                  fontWeight: 500, textDecoration: 'none', fontFamily: 'DM Sans, sans-serif',
                  transition: 'all 0.15s', display: 'inline-block',
                }}
              >
                + New Template
              </a>
            </div>
          </div>

          {/* Category tabs */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '28px', flexWrap: 'wrap', alignItems: 'center' }}>
            {CATEGORY_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveCategory(tab.key)}
                className={`tpl-sel-tab${activeCategory === tab.key ? ' active' : ''}`}
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
                style={{ marginLeft: 'auto', fontSize: '12px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'DM Sans, sans-serif' }}
              >
                Select all
              </button>
            )}
          </div>

          {/* Loading */}
          {isLoading && (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af', fontSize: '14px' }}>
              Loading templates…
            </div>
          )}

          {/* Error */}
          {error && (
            <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '10px', padding: '12px 16px', color: '#dc2626', fontSize: '13px', marginBottom: '20px' }}>
              {error}
            </div>
          )}

          {/* Empty */}
          {!isLoading && !error && filtered.length === 0 && (
            <div style={{ textAlign: 'center', padding: '64px 0', color: '#9ca3af', fontSize: '14px' }}>
              No templates in this category yet.
            </div>
          )}

          {/* Card grid */}
          {!isLoading && filtered.length > 0 && (
            <div className="tpl-fade-up" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
              {filtered.map((template, i) => {
                const isSelected = selected.has(template.id);
                return (
                  <div
                    key={template.id}
                    className={`tpl-sel-card${isSelected ? ' selected' : ''}`}
                    style={{ animationDelay: `${i * 25}ms` }}
                    onClick={() => !manageMode && toggleSelect(template.id)}
                  >
                    {/* Top row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span
                        className="tpl-sel-badge"
                        style={{
                          background: isSelected ? 'rgba(217,119,6,0.12)' : '#f3f4f6',
                          color: isSelected ? '#d97706' : '#6b7280',
                        }}
                      >
                        {getCategoryLabel(template.category)}
                      </span>

                      {manageMode ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          {!template.isBuiltIn ? (
                            <>
                              <a
                                href={`/templates/${template.id}/edit`}
                                onClick={e => e.stopPropagation()}
                                style={{ padding: '4px 8px', borderRadius: '6px', background: '#f3f4f6', color: '#6b7280', fontSize: '11px', textDecoration: 'none' }}
                              >
                                Edit
                              </a>
                              <button
                                onClick={e => { e.stopPropagation(); handleDelete(template.id, template.name); }}
                                style={{ padding: '4px 8px', borderRadius: '6px', background: '#fef2f2', color: '#f87171', fontSize: '11px', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
                              >
                                Delete
                              </button>
                            </>
                          ) : (
                            <span style={{ fontSize: '10px', color: '#9ca3af', padding: '4px 8px', background: '#f3f4f6', borderRadius: '6px' }}>
                              Built-in
                            </span>
                          )}
                        </div>
                      ) : (
                        <div className={`tpl-sel-check${isSelected ? ' checked' : ''}`}>
                          {isSelected && (
                            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3}>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Name + description */}
                    <div>
                      <p style={{ fontSize: '14px', fontWeight: 600, color: '#111827', marginBottom: '4px', lineHeight: 1.3 }}>
                        {template.name}
                      </p>
                      {template.description && (
                        <p style={{ fontSize: '12px', color: '#9ca3af', lineHeight: 1.5 }}>
                          {template.description}
                        </p>
                      )}
                    </div>

                    {/* Stats */}
                    <div style={{ display: 'flex', gap: '14px', marginTop: '2px' }}>
                      <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                        {template.pieceCount} piece{template.pieceCount !== 1 ? 's' : ''}
                      </span>
                      {template.estimatedAreaSqm > 0 && (
                        <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                          ~{template.estimatedAreaSqm.toFixed(1)} m²
                        </span>
                      )}
                    </div>

                    {/* Select button — only shown when not in manage mode */}
                    {!manageMode && (
                      <button
                        onClick={e => { e.stopPropagation(); toggleSelect(template.id); }}
                        style={{
                          marginTop: '4px',
                          width: '100%',
                          padding: '8px',
                          borderRadius: '8px',
                          fontSize: '12px',
                          fontWeight: 600,
                          fontFamily: 'DM Sans, sans-serif',
                          border: isSelected ? '1px solid rgba(217,119,6,0.4)' : 'none',
                          background: isSelected ? 'rgba(217,119,6,0.15)' : '#d97706',
                          color: isSelected ? '#d97706' : '#fff',
                          cursor: 'pointer',
                          transition: 'all 0.15s',
                        }}
                      >
                        {isSelected ? '✓ Selected' : 'Select'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sticky footer */}
      {selected.size > 0 && !manageMode && (
        <div className="tpl-sel-footer">
          <div style={{ fontSize: '13px', color: '#6b7280', display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span>
              <span style={{ fontWeight: 600, color: '#d97706' }}>{selected.size}</span>
              {' '}template{selected.size !== 1 ? 's' : ''} selected
            </span>
            <button
              onClick={() => setSelected(new Set())}
              style={{ fontSize: '11px', color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'inherit' }}
            >
              Clear
            </button>
          </div>
          <button className="tpl-sel-btn-primary" onClick={handleApply}>
            Create Quote →
          </button>
        </div>
      )}
    </>
  );
}
