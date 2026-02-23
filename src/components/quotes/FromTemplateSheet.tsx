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

  // Material assignment state
  const [selectedTemplate, setSelectedTemplate] = useState<TemplateSummary | null>(null);
  const [roles, setRoles] = useState<TemplateRole[]>([]);
  const [materials, setMaterials] = useState<Material[]>([]);
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [rolesLoading, setRolesLoading] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);

  // Save as template state
  const [showSaveForm, setShowSaveForm] = useState(false);
  const [saveTemplateName, setSaveTemplateName] = useState('');
  const [saveCategory, setSaveCategory] = useState('kitchen');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const sheetRef = useRef<HTMLDivElement>(null);

  // Fetch templates on open
  useEffect(() => {
    if (!open) return;
    setIsLoading(true);
    setError(null);
    setSelectedTemplate(null);
    setShowSaveForm(false);
    setSaveSuccess(null);

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
  }, [open]);

  // Fetch roles and materials when a template is selected
  useEffect(() => {
    if (!selectedTemplate) return;
    const templateId = selectedTemplate.id;
    setRolesLoading(true);
    setApplyError(null);
    setAssignments({});

    async function fetchRolesAndMaterials() {
      try {
        const [rolesRes, materialsRes] = await Promise.all([
          fetch(`/api/starter-templates/${templateId}/roles`),
          fetch('/api/materials?isActive=true'),
        ]);

        if (!rolesRes.ok) throw new Error('Failed to load template roles');
        if (!materialsRes.ok) throw new Error('Failed to load materials');

        const rolesData = await rolesRes.json();
        const materialsData = await materialsRes.json();

        setRoles(rolesData.roles || []);
        const activeMaterials = (materialsData as Material[]).filter(m => m.isActive);
        setMaterials(activeMaterials);

        // Auto-select if only one material
        if (activeMaterials.length === 1) {
          const autoAssignments: Record<string, number> = {};
          for (const role of (rolesData.roles || []) as TemplateRole[]) {
            autoAssignments[role.role] = activeMaterials[0].id;
          }
          setAssignments(autoAssignments);
        }
      } catch (err) {
        setApplyError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setRolesLoading(false);
      }
    }
    fetchRolesAndMaterials();
  }, [selectedTemplate]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleAssign = useCallback((role: string, materialId: number) => {
    setAssignments(prev => ({ ...prev, [role]: materialId }));
  }, []);

  const handleSameAsBenchtop = useCallback((role: string) => {
    const benchtopMaterial = assignments['PRIMARY_BENCHTOP'];
    if (benchtopMaterial) {
      setAssignments(prev => ({ ...prev, [role]: benchtopMaterial }));
    }
  }, [assignments]);

  const handleApply = async () => {
    if (!selectedTemplate || !assignments['PRIMARY_BENCHTOP']) return;

    setIsApplying(true);
    setApplyError(null);

    try {
      const res = await fetch(`/api/starter-templates/${selectedTemplate.id}/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialAssignments: assignments,
          quoteId: Number(quoteId),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to apply template');
      }

      const result = await res.json();
      onApplied(result.piecesCreated, selectedTemplate.name);
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to add template pieces');
    } finally {
      setIsApplying(false);
    }
  };

  const handleSaveAsTemplate = async () => {
    if (!saveTemplateName.trim()) return;

    setIsSavingTemplate(true);
    setApplyError(null);

    try {
      const res = await fetch(`/api/quotes/${quoteId}/save-as-template`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: saveTemplateName.trim(),
          category: saveCategory,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save template');
      }

      setSaveSuccess(`Saved as template: ${saveTemplateName.trim()}`);
      setShowSaveForm(false);
      setSaveTemplateName('');
      // Refresh templates list
      const templatesRes = await fetch('/api/starter-templates?isActive=true');
      if (templatesRes.ok) {
        setTemplates(await templatesRes.json());
      }
    } catch (err) {
      setApplyError(err instanceof Error ? err.message : 'Failed to save template');
    } finally {
      setIsSavingTemplate(false);
    }
  };

  const filtered = activeCategory === 'all'
    ? templates
    : templates.filter(t => t.category.toLowerCase() === activeCategory);

  // Group materials by collection for the dropdown
  const materialsByCollection = materials.reduce<Record<string, Material[]>>((acc, m) => {
    const collection = m.collection || 'Other';
    if (!acc[collection]) acc[collection] = [];
    acc[collection].push(m);
    return acc;
  }, {});
  const collectionNames = Object.keys(materialsByCollection).sort();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black bg-opacity-40 transition-opacity"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="relative w-full max-w-lg bg-white shadow-xl flex flex-col animate-slide-in-right"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">
              {selectedTemplate ? `Adding: ${selectedTemplate.name}` : 'Add from Template'}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {selectedTemplate
                ? 'Assign materials to each role'
                : 'Add rooms and pieces from a template into this quote.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {selectedTemplate ? (
            /* Material assignment view */
            <div>
              {rolesLoading ? (
                <div className="text-center py-8 text-gray-500">Loading template details...</div>
              ) : (
                <>
                  {applyError && (
                    <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">
                      {applyError}
                    </div>
                  )}

                  <div className="space-y-3">
                    {roles.map(role => {
                      const isPrimary = role.role === 'PRIMARY_BENCHTOP';
                      const benchtopAssigned = assignments['PRIMARY_BENCHTOP'];

                      return (
                        <div key={role.role} className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                          <div className="flex items-center justify-between mb-1.5">
                            <div>
                              <span className="text-sm font-medium text-gray-900">{role.label}</span>
                              <span className="text-xs text-gray-500 ml-2">
                                ({role.pieceCount} piece{role.pieceCount !== 1 ? 's' : ''} &mdash; {role.roomNames.join(', ')})
                              </span>
                            </div>
                            {isPrimary && (
                              <span className="text-xs text-red-600 font-medium">Required</span>
                            )}
                          </div>

                          <select
                            value={assignments[role.role] || ''}
                            onChange={(e) => handleAssign(role.role, Number(e.target.value))}
                            className="w-full px-2.5 py-1.5 border border-gray-300 rounded-md text-sm focus:ring-amber-500 focus:border-amber-500"
                          >
                            <option value="">Select material...</option>
                            {collectionNames.map(collection => (
                              <optgroup key={collection} label={collection}>
                                {materialsByCollection[collection].map(m => (
                                  <option key={m.id} value={m.id}>
                                    {m.name} &mdash; ${m.pricePerSqm.toFixed(2)}/m&sup2;
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </select>

                          {/* "Same as benchtop" shortcut */}
                          {role.role !== 'PRIMARY_BENCHTOP' && benchtopAssigned && !assignments[role.role] && (
                            <button
                              onClick={() => handleSameAsBenchtop(role.role)}
                              className="mt-1.5 text-xs text-amber-600 hover:text-amber-700 font-medium"
                            >
                              Use same as benchtop
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Actions */}
                  <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-200">
                    <button
                      onClick={() => setSelectedTemplate(null)}
                      className="btn-secondary text-sm"
                    >
                      Back
                    </button>
                    <button
                      onClick={handleApply}
                      disabled={isApplying || !assignments['PRIMARY_BENCHTOP']}
                      className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isApplying ? 'Adding...' : 'Add to Quote'}
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            /* Template list view */
            <>
              {/* Category filters */}
              <div className="flex gap-1.5 mb-4 flex-wrap">
                {CATEGORY_TABS.map(tab => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveCategory(tab.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
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
                <div className="text-center py-8 text-gray-500 text-sm">Loading templates...</div>
              )}

              {/* Error */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm mb-4">
                  {error}
                </div>
              )}

              {/* Empty state */}
              {!isLoading && !error && filtered.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-gray-500 text-sm mb-1">
                    No templates available{activeCategory !== 'all' ? ` in ${activeCategory}` : ''}.
                  </p>
                  <a
                    href="/admin/pricing"
                    className="text-amber-600 hover:text-amber-700 text-xs font-medium"
                  >
                    Manage templates in Pricing Admin
                  </a>
                </div>
              )}

              {/* Template list */}
              {!isLoading && filtered.length > 0 && (
                <div className="space-y-3">
                  {filtered.map(template => (
                    <div
                      key={template.id}
                      className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                    >
                      <div className="flex items-start gap-3">
                        <span className="text-xl flex-shrink-0">{getCategoryIcon(template.category)}</span>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-medium text-gray-900 text-sm">{template.name}</h3>
                          {template.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{template.description}</p>
                          )}
                          <p className="text-xs text-gray-500 mt-1">
                            {template.pieceCount} piece{template.pieceCount !== 1 ? 's' : ''}
                            {' '}&middot; ~{template.estimatedAreaSqm}m&sup2;
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedTemplate(template)}
                          className="flex-shrink-0 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-lg hover:bg-amber-100 transition-colors"
                        >
                          + Add
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Success message */}
              {saveSuccess && (
                <div className="mt-4 bg-green-50 border border-green-200 text-green-700 px-3 py-2 rounded-lg text-sm flex items-center gap-2">
                  <svg className="h-4 w-4 text-green-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  {saveSuccess}
                </div>
              )}

              {/* Save current quote as template */}
              <div className="mt-6 pt-4 border-t border-gray-200">
                {showSaveForm ? (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <h4 className="text-sm font-medium text-blue-900 mb-2">Save Quote as Template</h4>
                    {applyError && (
                      <div className="mb-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                        {applyError}
                      </div>
                    )}
                    <div className="space-y-2">
                      <input
                        type="text"
                        value={saveTemplateName}
                        onChange={(e) => setSaveTemplateName(e.target.value)}
                        placeholder="Template name"
                        className="w-full px-2.5 py-1.5 border border-blue-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                        autoFocus
                      />
                      <select
                        value={saveCategory}
                        onChange={(e) => setSaveCategory(e.target.value)}
                        className="w-full px-2.5 py-1.5 border border-blue-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
                      >
                        <option value="kitchen">Kitchen</option>
                        <option value="bathroom">Bathroom</option>
                        <option value="laundry">Laundry</option>
                        <option value="full-unit">Full Unit</option>
                      </select>
                    </div>
                    <div className="flex gap-2 justify-end mt-2">
                      <button
                        onClick={() => { setShowSaveForm(false); setApplyError(null); }}
                        className="px-2.5 py-1 text-xs text-gray-600 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSaveAsTemplate}
                        disabled={isSavingTemplate || !saveTemplateName.trim()}
                        className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {isSavingTemplate ? 'Saving...' : 'Save Template'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setShowSaveForm(true)}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded-lg transition-colors"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save current quote as template
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Slide-in animation */}
      <style jsx>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slideInRight 0.2s ease-out;
        }
      `}</style>
    </div>
  );
}
