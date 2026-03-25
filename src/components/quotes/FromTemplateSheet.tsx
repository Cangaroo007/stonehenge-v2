'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

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

interface TemplateRole {
  role: string;
  label: string;
  pieceCount: number;
  roomNames: string[];
}

interface Material {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: number;
  isActive: boolean;
}

interface FromTemplateSheetProps {
  quoteId: string;
  open: boolean;
  onClose: () => void;
  onApplied: (piecesCreated: number, templateName: string) => void;
}

const CATEGORY_TABS = [
  { key: 'all',           label: 'All',             icon: '◈' },
  { key: 'kitchen',       label: 'Kitchen',          icon: '⬡' },
  { key: 'bathroom',      label: 'Bathroom',         icon: '◇' },
  { key: 'ensuite',       label: 'Ensuite',          icon: '◇' },
  { key: 'laundry',       label: 'Laundry',          icon: '○' },
  { key: 'butlers_pantry',label: "Butler's Pantry",  icon: '⬡' },
  { key: 'outdoor',       label: 'Outdoor',          icon: '◈' },
];

// Category display names for card labels
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

// Collect unique material roles across multiple templates' roles arrays
function mergeRoles(allRoles: Record<string, TemplateRole[]>): TemplateRole[] {
  const merged = new Map<string, TemplateRole>();
  for (const roles of Object.values(allRoles)) {
    for (const role of roles) {
      if (!merged.has(role.role)) {
        merged.set(role.role, { ...role, pieceCount: 0, roomNames: [] });
      }
      const existing = merged.get(role.role)!;
      existing.pieceCount += role.pieceCount;
      existing.roomNames = Array.from(new Set([...existing.roomNames, ...role.roomNames]));
    }
  }
  return Array.from(merged.values());
}

export default function FromTemplateSheet({
  quoteId,
  open,
  onClose,
  onApplied,
}: FromTemplateSheetProps) {
  const [templates, setTemplates] = useState<TemplateSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState('all');

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Material assignment phase
  const [assigning, setAssigning] = useState(false);
  const [rolesPerTemplate, setRolesPerTemplate] = useState<Record<string, TemplateRole[]>>({});
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [rolesLoading, setRolesLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  // Fetch templates on open
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setError(null);
    setSelectedIds(new Set());
    setAssigning(false);
    setAssignments({});

    fetch('/api/starter-templates?isActive=true')
      .then(r => r.ok ? r.json() : Promise.reject('Failed to load templates'))
      .then(data => setTemplates(data))
      .catch(err => setError(typeof err === 'string' ? err : 'Failed to load templates'))
      .finally(() => setIsLoading(false));
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) { next.delete(id); } else { next.add(id); }
      return next;
    });
  }, []);

  const handleContinue = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setAssigning(true);
    setRolesLoading(true);
    setApplyError(null);

    try {
      const [rolesResults, materialsRes] = await Promise.all([
        Promise.all(
          Array.from(selectedIds).map(id =>
            fetch(`/api/starter-templates/${id}/roles`)
              .then(r => r.ok ? r.json() : Promise.reject('Failed to load roles'))
              .then(data => ({ id, roles: data.roles ?? [] as TemplateRole[] }))
          )
        ),
        fetch('/api/materials?isActive=true').then(r => r.json()),
      ]);

      const rolesMap: Record<string, TemplateRole[]> = {};
      for (const { id, roles } of rolesResults) rolesMap[id] = roles;
      setRolesPerTemplate(rolesMap);

      const activeMaterials = (materialsRes as Material[]).filter(m => m.isActive);
      setMaterials(activeMaterials);

      // Auto-assign if only one material
      if (activeMaterials.length === 1) {
        const merged = mergeRoles(rolesMap);
        const auto: Record<string, number> = {};
        for (const role of merged) auto[role.role] = activeMaterials[0].id;
        setAssignments(auto);
      }
    } catch (err) {
      setApplyError(typeof err === 'string' ? err : 'Failed to load data');
      setAssigning(false);
    } finally {
      setRolesLoading(false);
    }
  }, [selectedIds]);

  const handleAssign = useCallback((role: string, materialId: number) => {
    setAssignments(prev => ({ ...prev, [role]: materialId }));
  }, []);

  const handleApply = async () => {
    const merged = mergeRoles(rolesPerTemplate);
    const primaryRole = merged.find(r => r.role === 'PRIMARY_BENCHTOP' || r.role === 'VANITY');
    if (!primaryRole || !assignments[primaryRole.role]) return;

    setIsApplying(true);
    setApplyError(null);

    try {
      let totalPieces = 0;
      const templateNames: string[] = [];

      for (const id of Array.from(selectedIds)) {
        const template = templates.find(t => t.id === id);
        if (!template) continue;

        const res = await fetch(`/api/starter-templates/${id}/apply`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            materialAssignments: assignments,
            quoteId: Number(quoteId),
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || `Failed to apply ${template.name}`);
        }

        const result = await res.json();
        totalPieces += result.piecesCreated ?? 0;
        templateNames.push(template.name);
      }

      onApplied(totalPieces, templateNames.join(', '));
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to apply templates');
    } finally {
      setIsApplying(false);
    }
  };

  const selectedTemplates = templates.filter(t => selectedIds.has(t.id));
  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category.toLowerCase() === activeCategory.toLowerCase());

  const materialsByCollection = materials.reduce<Record<string, Material[]>>((acc, m) => {
    const c = m.collection || 'Other';
    if (!acc[c]) acc[c] = [];
    acc[c].push(m);
    return acc;
  }, {});
  const collectionNames = Object.keys(materialsByCollection).sort();
  const mergedRoles = mergeRoles(rolesPerTemplate);
  const primaryRole = mergedRoles.find(r => r.role === 'PRIMARY_BENCHTOP' || r.role === 'VANITY');

  if (!open) return null;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Serif+Display:ital@0;1&display=swap');

        .tpl-sheet {
          font-family: 'DM Sans', sans-serif;
        }
        .tpl-title {
          font-family: 'DM Serif Display', serif;
        }
        @keyframes tplSlideIn {
          from { transform: translateX(100%); opacity: 0; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @keyframes tplFadeUp {
          from { transform: translateY(12px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
        .tpl-slide-in  { animation: tplSlideIn 0.28s cubic-bezier(0.16, 1, 0.3, 1) forwards; }
        .tpl-fade-up   { animation: tplFadeUp  0.22s cubic-bezier(0.16, 1, 0.3, 1) forwards; }

        .tpl-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 12px;
          cursor: pointer;
          transition: border-color 0.15s, transform 0.12s;
          position: relative;
          overflow: hidden;
        }
        .tpl-card::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(135deg, rgba(217,119,6,0.06) 0%, transparent 60%);
          opacity: 0;
          transition: opacity 0.2s;
        }
        .tpl-card:hover::before { opacity: 1; }
        .tpl-card:hover { border-color: #d1d5db; transform: translateY(-1px); }
        .tpl-card.selected {
          border-color: #d97706;
          background: #fffbf5;
        }
        .tpl-card.selected::before { opacity: 1; }

        .tpl-check {
          width: 20px; height: 20px;
          border-radius: 6px;
          border: 1.5px solid #d1d5db;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
          background: transparent;
        }
        .tpl-check.checked {
          background: #d97706;
          border-color: #d97706;
        }

        .tpl-tab {
          padding: 5px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.02em;
          cursor: pointer;
          transition: all 0.15s;
          border: 1px solid transparent;
          white-space: nowrap;
          color: #6b7280;
          background: transparent;
        }
        .tpl-tab:hover { color: #111827; background: #f3f4f6; }
        .tpl-tab.active {
          color: #d97706;
          background: rgba(217,119,6,0.12);
          border-color: rgba(217,119,6,0.25);
        }

        .tpl-btn-primary {
          background: #d97706;
          color: #fff;
          border: none;
          border-radius: 8px;
          padding: 9px 20px;
          font-size: 13px;
          font-weight: 600;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: background 0.15s, transform 0.1s;
          letter-spacing: 0.01em;
        }
        .tpl-btn-primary:hover:not(:disabled) { background: #b45309; transform: translateY(-1px); }
        .tpl-btn-primary:disabled { opacity: 0.4; cursor: not-allowed; }

        .tpl-btn-ghost {
          background: transparent;
          color: #6b7280;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          padding: 9px 16px;
          font-size: 13px;
          font-weight: 500;
          font-family: 'DM Sans', sans-serif;
          cursor: pointer;
          transition: all 0.15s;
        }
        .tpl-btn-ghost:hover { color: #111827; border-color: #d1d5db; background: #f3f4f6; }

        .tpl-select {
          width: 100%;
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 8px;
          color: #111827;
          padding: 8px 12px;
          font-size: 13px;
          font-family: 'DM Sans', sans-serif;
          appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236b7280' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 10px center;
          padding-right: 32px;
          cursor: pointer;
          transition: border-color 0.15s;
        }
        .tpl-select:focus { outline: none; border-color: #d97706; }
        .tpl-select option { background: #ffffff; }
        .tpl-select optgroup { color: #6b7280; font-size: 11px; }

        .tpl-role-card {
          background: #ffffff;
          border: 1px solid #e5e7eb;
          border-radius: 10px;
          padding: 14px;
        }

        .tpl-badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 10px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.04em;
          text-transform: uppercase;
        }
      `}</style>

      <div className="fixed inset-0 z-50 flex justify-end tpl-sheet">
        {/* Overlay */}
        <div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />

        {/* Sheet — wider than before */}
        <div
          ref={sheetRef}
          className="tpl-slide-in relative flex flex-col"
          style={{
            width: '100%',
            maxWidth: '580px',
            background: '#ffffff',
            borderLeft: '1px solid #e5e7eb',
            boxShadow: '-20px 0 60px rgba(0,0,0,0.1)',
          }}
        >
          {/* Header */}
          <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #e5e7eb' }}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="tpl-title" style={{ fontSize: '22px', color: '#111827', lineHeight: 1.2, marginBottom: '4px' }}>
                  {assigning ? 'Assign Materials' : 'Select Templates'}
                </h2>
                <p style={{ fontSize: '12px', color: '#6b7280', lineHeight: 1.5 }}>
                  {assigning
                    ? `${selectedIds.size} template${selectedIds.size !== 1 ? 's' : ''} selected — assign a material to each role`
                    : 'Choose one or more room templates to add to this quote'}
                </p>
              </div>
              <button
                onClick={onClose}
                style={{ color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}
              >
                <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
            {!assigning ? (
              /* ── SELECTION VIEW ── */
              <div className="tpl-fade-up">
                {/* Category tabs */}
                <div style={{ display: 'flex', gap: '6px', marginBottom: '20px', overflowX: 'auto', paddingBottom: '2px' }}>
                  {CATEGORY_TABS.map(tab => (
                    <button
                      key={tab.key}
                      onClick={() => setActiveCategory(tab.key)}
                      className={`tpl-tab${activeCategory === tab.key ? ' active' : ''}`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {isLoading && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '13px' }}>
                    Loading templates…
                  </div>
                )}

                {error && (
                  <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
                    {error}
                  </div>
                )}

                {!isLoading && !error && filtered.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '40px 0', color: '#9ca3af', fontSize: '13px' }}>
                    No templates in this category yet.
                  </div>
                )}

                {/* Template cards — 2-column grid */}
                {!isLoading && filtered.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    {filtered.map((template, i) => {
                      const selected = selectedIds.has(template.id);
                      return (
                        <div
                          key={template.id}
                          className={`tpl-card${selected ? ' selected' : ''}`}
                          style={{ padding: '14px', animationDelay: `${i * 30}ms` }}
                          onClick={() => toggleSelect(template.id)}
                        >
                          {/* Top row: category badge + checkbox */}
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                            <span
                              className="tpl-badge"
                              style={{
                                background: selected ? 'rgba(217,119,6,0.12)' : '#f3f4f6',
                                color: selected ? '#d97706' : '#6b7280',
                              }}
                            >
                              {getCategoryLabel(template.category)}
                            </span>
                            <div className={`tpl-check${selected ? ' checked' : ''}`}>
                              {selected && (
                                <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="#fff" strokeWidth={3}>
                                  <polyline points="20 6 9 17 4 12" />
                                </svg>
                              )}
                            </div>
                          </div>

                          {/* Name */}
                          <p style={{ fontSize: '13px', fontWeight: 600, color: '#111827', marginBottom: '4px', lineHeight: 1.3 }}>
                            {template.name}
                          </p>

                          {/* Description */}
                          {template.description && (
                            <p style={{ fontSize: '11px', color: '#6b7280', lineHeight: 1.5, marginBottom: '8px' }}>
                              {template.description}
                            </p>
                          )}

                          {/* Stats */}
                          <div style={{ display: 'flex', gap: '12px', marginTop: 'auto' }}>
                            <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                              {template.pieceCount} piece{template.pieceCount !== 1 ? 's' : ''}
                            </span>
                            {template.estimatedAreaSqm > 0 && (
                              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                                ~{template.estimatedAreaSqm.toFixed(1)} m²
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              /* ── MATERIAL ASSIGNMENT VIEW ── */
              <div className="tpl-fade-up">
                {/* Selected templates summary */}
                <div style={{ marginBottom: '20px', padding: '12px 14px', background: '#f9fafb', borderRadius: '10px', border: '1px solid #e5e7eb' }}>
                  <p style={{ fontSize: '11px', color: '#6b7280', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>
                    Adding to quote
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {selectedTemplates.map(t => (
                      <span key={t.id} style={{ fontSize: '12px', color: '#d97706', background: 'rgba(217,119,6,0.15)', padding: '3px 10px', borderRadius: '20px', border: '1px solid rgba(217,119,6,0.25)' }}>
                        {t.name}
                      </span>
                    ))}
                  </div>
                </div>

                {rolesLoading ? (
                  <div style={{ textAlign: 'center', padding: '32px 0', color: '#9ca3af', fontSize: '13px' }}>
                    Loading material roles…
                  </div>
                ) : (
                  <>
                    {applyError && (
                      <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', padding: '10px 14px', color: '#dc2626', fontSize: '12px', marginBottom: '16px' }}>
                        {applyError}
                      </div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                      {mergedRoles.map(role => {
                        const isPrimary = role.role === 'PRIMARY_BENCHTOP' || role.role === 'VANITY';
                        const benchtopId = assignments['PRIMARY_BENCHTOP'] ?? assignments['VANITY'];
                        const hasValue = !!assignments[role.role];

                        return (
                          <div key={role.role} className="tpl-role-card">
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                              <div>
                                <span style={{ fontSize: '13px', fontWeight: 600, color: '#111827' }}>{role.label}</span>
                                <span style={{ fontSize: '11px', color: '#9ca3af', marginLeft: '8px' }}>
                                  {role.pieceCount} piece{role.pieceCount !== 1 ? 's' : ''}
                                </span>
                              </div>
                              {isPrimary && (
                                <span className="tpl-badge" style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171' }}>
                                  Required
                                </span>
                              )}
                            </div>

                            <select
                              value={assignments[role.role] ?? ''}
                              onChange={e => handleAssign(role.role, Number(e.target.value))}
                              className="tpl-select"
                            >
                              <option value="">Select material…</option>
                              {collectionNames.map(collection => (
                                <optgroup key={collection} label={collection}>
                                  {materialsByCollection[collection].map(m => (
                                    <option key={m.id} value={m.id}>
                                      {m.name} — ${m.pricePerSqm.toFixed(2)}/m²
                                    </option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>

                            {/* Same as primary shortcut */}
                            {!isPrimary && benchtopId && !hasValue && (
                              <button
                                onClick={() => handleAssign(role.role, benchtopId)}
                                style={{ marginTop: '8px', fontSize: '11px', color: '#d97706', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'inherit' }}
                              >
                                Use same as primary ↑
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 24px', borderTop: '1px solid #e5e7eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', background: '#ffffff' }}>
            {!assigning ? (
              <>
                <span style={{ fontSize: '12px', color: '#9ca3af' }}>
                  {selectedIds.size > 0
                    ? `${selectedIds.size} template${selectedIds.size !== 1 ? 's' : ''} selected`
                    : 'No templates selected'}
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className="tpl-btn-ghost" onClick={onClose}>Cancel</button>
                  <button
                    className="tpl-btn-primary"
                    disabled={selectedIds.size === 0}
                    onClick={handleContinue}
                  >
                    Continue →
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  className="tpl-btn-ghost"
                  onClick={() => { setAssigning(false); setApplyError(null); }}
                >
                  ← Back
                </button>
                <button
                  className="tpl-btn-primary"
                  disabled={isApplying || !primaryRole || !assignments[primaryRole.role]}
                  onClick={handleApply}
                >
                  {isApplying ? 'Adding…' : `Add ${selectedIds.size} template${selectedIds.size !== 1 ? 's' : ''} to quote`}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
