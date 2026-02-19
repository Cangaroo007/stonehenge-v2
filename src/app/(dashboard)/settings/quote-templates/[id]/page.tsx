'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import type { QuoteTemplateSections, QuoteFormatType } from '@/lib/types/quote-template';
import { getDefaultSectionsConfig, SECTION_GROUPS } from '@/lib/types/quote-template';

interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  format_type: string;
  is_default: boolean;
  is_active: boolean;
  sections_config: QuoteTemplateSections;
  show_logo: boolean;
  custom_primary_colour: string | null;
  custom_accent_colour: string | null;
  custom_intro_text: string | null;
  terms_and_conditions: string | null;
  footer_text: string | null;
  validity_days: number;
  company_id: number;
}

interface CompanySettings {
  primaryColor: string;
  quoteIntroText1: string | null;
  quoteIntroText2: string | null;
  quoteIntroText3: string | null;
  quoteTermsText1: string | null;
  quoteTermsText2: string | null;
  quoteTermsText3: string | null;
  quoteTermsText4: string | null;
  quoteValidityDays: number;
  depositPercent: number;
  signatureName: string | null;
  signatureTitle: string | null;
}

export default function TemplateEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [template, setTemplate] = useState<TemplateData | null>(null);
  const [companySettings, setCompanySettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'branding' | 'sections' | 'text'>('sections');
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Resolve params (Rule 9: Next.js 14 async params)
  useEffect(() => {
    params.then((p) => setTemplateId(p.id));
  }, [params]);

  // Fetch template and company settings
  useEffect(() => {
    if (!templateId) return;

    const fetchData = async () => {
      try {
        const [templateRes, companyRes] = await Promise.all([
          fetch(`/api/quote-templates/${templateId}`),
          fetch('/api/company/settings'),
        ]);

        if (!templateRes.ok) throw new Error('Template not found');

        const templateData = await templateRes.json();
        // Parse sections_config — Prisma JSON double cast (Rule 9)
        const sectionsConfig = templateData.sections_config as unknown as QuoteTemplateSections;
        const formatType = (templateData.format_type || 'COMPREHENSIVE') as QuoteFormatType;

        // Merge with defaults so all keys exist
        const defaultConfig = getDefaultSectionsConfig(formatType);
        const mergedConfig: QuoteTemplateSections = { ...defaultConfig, ...sectionsConfig };

        setTemplate({
          ...templateData,
          sections_config: mergedConfig,
        });

        if (companyRes.ok) {
          const companyData = await companyRes.json();
          setCompanySettings(companyData);
        }
      } catch (error) {
        console.error('Error loading template:', error);
        setMessage({ type: 'error', text: 'Failed to load template' });
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [templateId]);

  // Auto-save with debounce for toggle changes
  const autoSave = useCallback(
    (updatedTemplate: TemplateData) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(async () => {
        try {
          const response = await fetch(`/api/quote-templates/${updatedTemplate.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              sections_config: updatedTemplate.sections_config,
              show_logo: updatedTemplate.show_logo,
              custom_primary_colour: updatedTemplate.custom_primary_colour,
              custom_accent_colour: updatedTemplate.custom_accent_colour,
              format_type: updatedTemplate.format_type,
            }),
          });

          if (!response.ok) throw new Error('Failed to save');
        } catch (error) {
          console.error('Auto-save failed:', error);
          setMessage({ type: 'error', text: 'Auto-save failed' });
        }
      }, 1000);
    },
    [],
  );

  // Manual save for text fields
  const handleSave = async () => {
    if (!template) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/quote-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: template.name,
          description: template.description,
          format_type: template.format_type,
          sections_config: template.sections_config,
          show_logo: template.show_logo,
          custom_primary_colour: template.custom_primary_colour,
          custom_accent_colour: template.custom_accent_colour,
          custom_intro_text: template.custom_intro_text,
          terms_and_conditions: template.terms_and_conditions,
          footer_text: template.footer_text,
          validity_days: template.validity_days,
        }),
      });

      if (!response.ok) throw new Error('Failed to save template');
      setMessage({ type: 'success', text: 'Template saved' });
      setTimeout(() => setMessage(null), 3000);
    } catch (error) {
      console.error('Error saving template:', error);
      setMessage({ type: 'error', text: 'Failed to save template' });
    } finally {
      setSaving(false);
    }
  };

  const updateTemplate = (updates: Partial<TemplateData>) => {
    if (!template) return;
    const updated = { ...template, ...updates };
    setTemplate(updated);
  };

  const updateSections = (key: keyof QuoteTemplateSections, value: boolean) => {
    if (!template) return;
    const updatedConfig = { ...template.sections_config, [key]: value };
    const updated = { ...template, sections_config: updatedConfig };
    setTemplate(updated);
    autoSave(updated);
  };

  const handleFormatTypeChange = (newType: QuoteFormatType) => {
    if (!template) return;
    const defaults = getDefaultSectionsConfig(newType);
    const updated: TemplateData = {
      ...template,
      format_type: newType,
      sections_config: {
        ...template.sections_config,
        // Auto-toggle format-specific sections
        pieceDetails: defaults.pieceDetails,
        pieceDimensions: defaults.pieceDimensions,
        edgeProfiles: defaults.edgeProfiles,
        cutoutDetails: defaults.cutoutDetails,
        perPiecePricing: defaults.perPiecePricing,
        fabricationBreakdown: defaults.fabricationBreakdown,
        slabSummary: defaults.slabSummary,
        machineOperations: defaults.machineOperations,
      },
    };
    setTemplate(updated);
    autoSave(updated);
  };

  const handleBrandingToggle = (key: 'show_logo', value: boolean) => {
    if (!template) return;
    const updated = { ...template, [key]: value };
    setTemplate(updated);
    autoSave(updated);
  };

  const handleColourChange = (key: 'custom_primary_colour' | 'custom_accent_colour', value: string) => {
    if (!template) return;
    const updated = { ...template, [key]: value || null };
    setTemplate(updated);
    autoSave(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading template...</p>
        </div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Template not found.</p>
        </div>
      </div>
    );
  }

  const isSummary = template.format_type === 'SUMMARY';
  const companyPrimaryColour = companySettings?.primaryColor || '#1e40af';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/settings/quote-templates')}
            className="btn-secondary text-sm"
          >
            Back
          </button>
          <div>
            <input
              type="text"
              value={template.name}
              onChange={(e) => updateTemplate({ name: e.target.value })}
              className="text-2xl font-bold text-gray-900 bg-transparent border-none outline-none focus:border-b-2 focus:border-blue-500 w-full"
              placeholder="Template name"
            />
            <input
              type="text"
              value={template.description || ''}
              onChange={(e) => updateTemplate({ description: e.target.value || null })}
              className="text-sm text-gray-600 bg-transparent border-none outline-none focus:border-b focus:border-blue-300 w-full mt-1"
              placeholder="Add a description..."
            />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={template.format_type}
            onChange={(e) => handleFormatTypeChange(e.target.value as QuoteFormatType)}
            className="input text-sm w-auto"
          >
            <option value="COMPREHENSIVE">Comprehensive</option>
            <option value="SUMMARY">Summary</option>
          </select>
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>

      {message && (
        <div
          className={`p-3 rounded-lg text-sm ${
            message.type === 'success'
              ? 'bg-green-50 border border-green-200 text-green-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'branding' as const, label: 'Branding' },
            { id: 'sections' as const, label: 'Sections' },
            { id: 'text' as const, label: 'Text' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab 1: Branding */}
      {activeTab === 'branding' && (
        <div className="card p-6 space-y-6">
          <h2 className="text-lg font-semibold">Branding</h2>

          {/* Logo toggle */}
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">Show company logo</p>
              <p className="text-sm text-gray-500">Display the company logo on the PDF header</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={template.show_logo}
                onChange={(e) => handleBrandingToggle('show_logo', e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          {/* Primary colour */}
          <div>
            <label className="label">Primary Colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={template.custom_primary_colour || companyPrimaryColour}
                onChange={(e) => handleColourChange('custom_primary_colour', e.target.value)}
                className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={template.custom_primary_colour || ''}
                onChange={(e) => handleColourChange('custom_primary_colour', e.target.value)}
                className="input flex-1"
                placeholder={`Company default: ${companyPrimaryColour}`}
              />
              {template.custom_primary_colour && (
                <button
                  onClick={() => handleColourChange('custom_primary_colour', '')}
                  className="text-sm text-blue-600 hover:underline whitespace-nowrap"
                >
                  Use company default
                </button>
              )}
            </div>
          </div>

          {/* Accent colour */}
          <div>
            <label className="label">Accent Colour</label>
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={template.custom_accent_colour || '#f59e0b'}
                onChange={(e) => handleColourChange('custom_accent_colour', e.target.value)}
                className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
              />
              <input
                type="text"
                value={template.custom_accent_colour || ''}
                onChange={(e) => handleColourChange('custom_accent_colour', e.target.value)}
                className="input flex-1"
                placeholder="Optional accent colour"
              />
              {template.custom_accent_colour && (
                <button
                  onClick={() => handleColourChange('custom_accent_colour', '')}
                  className="text-sm text-blue-600 hover:underline whitespace-nowrap"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Preview header bar */}
          <div>
            <label className="label">Header Preview</label>
            <div
              className="rounded-lg p-4 text-white"
              style={{
                backgroundColor: template.custom_primary_colour || companyPrimaryColour,
              }}
            >
              <p className="text-lg font-bold">Company Name</p>
              <p className="text-sm opacity-80">Quote #Q-0001</p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Sections */}
      {activeTab === 'sections' && (
        <div className="space-y-4">
          {isSummary && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-800">
              Summary mode: piece-level details and technical sections are automatically disabled.
            </div>
          )}

          {SECTION_GROUPS.map((group) => (
            <SectionGroup
              key={group.key}
              group={group}
              sections={template.sections_config}
              isSummary={isSummary}
              onToggle={(key, value) => updateSections(key, value)}
            />
          ))}
        </div>
      )}

      {/* Tab 3: Text */}
      {activeTab === 'text' && (
        <div className="space-y-6">
          {/* Introduction text */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Introduction Text</h2>
              {template.custom_intro_text && (
                <button
                  onClick={() => updateTemplate({ custom_intro_text: null })}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Use company default
                </button>
              )}
            </div>
            <textarea
              className="input"
              rows={5}
              value={template.custom_intro_text || ''}
              onChange={(e) => updateTemplate({ custom_intro_text: e.target.value || null })}
              placeholder={
                companySettings
                  ? [companySettings.quoteIntroText1, companySettings.quoteIntroText2, companySettings.quoteIntroText3]
                      .filter(Boolean)
                      .join('\n\n') || 'Enter introduction text...'
                  : 'Enter introduction text...'
              }
            />
            <p className="text-xs text-gray-500">
              Leave blank to use company default. Custom text overrides the company-level introduction.
            </p>
          </div>

          {/* Terms & Conditions */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Terms & Conditions</h2>
              {template.terms_and_conditions && (
                <button
                  onClick={() => updateTemplate({ terms_and_conditions: null })}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Use company default
                </button>
              )}
            </div>
            <textarea
              className="input"
              rows={6}
              value={template.terms_and_conditions || ''}
              onChange={(e) => updateTemplate({ terms_and_conditions: e.target.value || null })}
              placeholder={
                companySettings
                  ? [
                      companySettings.quoteTermsText1,
                      companySettings.quoteTermsText2,
                      companySettings.quoteTermsText3,
                      companySettings.quoteTermsText4,
                    ]
                      .filter(Boolean)
                      .join('\n\n') || 'Enter terms and conditions...'
                  : 'Enter terms and conditions...'
              }
            />
            <p className="text-xs text-gray-500">
              Leave blank to use company default terms.
            </p>
          </div>

          {/* Validity & Deposit */}
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Validity & Deposit</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Validity Period (days)</label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="365"
                  value={template.validity_days}
                  onChange={(e) => updateTemplate({ validity_days: parseInt(e.target.value) || 30 })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Company default: {companySettings?.quoteValidityDays || 30} days
                </p>
              </div>
              <div>
                <label className="label">Deposit Percentage</label>
                <input
                  type="number"
                  className="input"
                  value={companySettings?.depositPercent || 50}
                  disabled
                />
                <p className="text-xs text-gray-500 mt-1">
                  Set at company level in Company Settings
                </p>
              </div>
            </div>
          </div>

          {/* Footer text */}
          <div className="card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Footer Text</h2>
              {template.footer_text && (
                <button
                  onClick={() => updateTemplate({ footer_text: null })}
                  className="text-sm text-blue-600 hover:underline"
                >
                  Clear
                </button>
              )}
            </div>
            <input
              type="text"
              className="input"
              value={template.footer_text || ''}
              onChange={(e) => updateTemplate({ footer_text: e.target.value || null })}
              placeholder="Custom footer text (appears at the bottom of every page)"
            />
          </div>

          {/* Signature */}
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold">Signature</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Signature Name</label>
                <input
                  type="text"
                  className="input"
                  value={companySettings?.signatureName || ''}
                  disabled
                />
              </div>
              <div>
                <label className="label">Signature Title</label>
                <input
                  type="text"
                  className="input"
                  value={companySettings?.signatureTitle || ''}
                  disabled
                />
              </div>
            </div>
            <p className="text-xs text-gray-500">
              Signature details are managed in Company Settings
            </p>
          </div>

          {/* Save button for text changes */}
          <div className="flex justify-end">
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Section Group Component ──────────────────────────────────────────────────

function SectionGroup({
  group,
  sections,
  isSummary,
  onToggle,
}: {
  group: (typeof SECTION_GROUPS)[number];
  sections: QuoteTemplateSections;
  isSummary: boolean;
  onToggle: (key: keyof QuoteTemplateSections, value: boolean) => void;
}) {
  const [collapsed, setCollapsed] = useState('collapsed' in group && group.collapsed === true);

  return (
    <div className="card">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between p-4 hover:bg-gray-50"
      >
        <h3 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
          {group.label}
        </h3>
        <svg
          className={`w-4 h-4 text-gray-400 transition-transform ${collapsed ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {!collapsed && (
        <div className="border-t border-gray-100">
          {group.sections.map((section) => {
            const sectionKey = section.key as keyof QuoteTemplateSections;
            const isComprehensiveOnly = 'comprehensiveOnly' in section && section.comprehensiveOnly;
            const isDisabled = isSummary && isComprehensiveOnly;
            const isChecked = isDisabled ? false : (sections[sectionKey] as boolean);

            return (
              <div
                key={section.key}
                className={`flex items-center justify-between px-4 py-3 border-b border-gray-50 last:border-b-0 ${
                  isDisabled ? 'opacity-50' : ''
                }`}
              >
                <div>
                  <p className="text-sm text-gray-900">{section.label}</p>
                  {isDisabled && (
                    <p className="text-xs text-gray-400 italic">Disabled in Summary mode</p>
                  )}
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={(e) => onToggle(sectionKey, e.target.checked)}
                    disabled={isDisabled}
                    className="sr-only peer"
                  />
                  <div
                    className={`w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600 ${
                      isDisabled ? 'cursor-not-allowed' : ''
                    }`}
                  ></div>
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
