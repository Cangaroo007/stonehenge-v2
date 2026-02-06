'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface CompanySettings {
  id: number;
  name: string;
  abn: string | null;
  address: string;
  phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  workshopAddress: string;
  logoStorageKey: string | null;
  primaryColor: string;
  quoteIntroText1: string | null;
  quoteIntroText2: string | null;
  quoteIntroText3: string | null;
  quotePleaseNote: string | null;
  quoteTermsText1: string | null;
  quoteTermsText2: string | null;
  quoteTermsText3: string | null;
  quoteTermsText4: string | null;
  quoteValidityDays: number;
  depositPercent: number;
  termsUrl: string | null;
  signatureName: string | null;
  signatureTitle: string | null;
  defaultUnitSystem: string;
}

export default function CompanySettingsPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<CompanySettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeTab, setActiveTab] = useState<'company' | 'branding' | 'quote-template' | 'settings'>('company');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/company/settings');
      if (!response.ok) throw new Error('Failed to fetch settings');
      const data = await response.json();
      setSettings(data);
    } catch (error) {
      console.error('Error fetching settings:', error);
      setMessage({ type: 'error', text: 'Failed to load settings' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!settings) return;

    setSaving(true);
    setMessage(null);

    try {
      const response = await fetch('/api/company/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error('Failed to update settings');

      const updated = await response.json();
      setSettings(updated);
      setMessage({ type: 'success', text: 'Settings updated successfully!' });
      
      // Refresh after 1 second
      setTimeout(() => {
        router.refresh();
      }, 1000);
    } catch (error) {
      console.error('Error updating settings:', error);
      setMessage({ type: 'error', text: 'Failed to update settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch('/api/company/logo', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload logo');
      }

      const result = await response.json();
      setSettings((prev) => prev ? { ...prev, logoStorageKey: result.storageKey } : null);
      setMessage({ type: 'success', text: 'Logo uploaded successfully!' });
    } catch (error) {
      console.error('Error uploading logo:', error);
      setMessage({ 
        type: 'error', 
        text: error instanceof Error ? error.message : 'Failed to upload logo' 
      });
    } finally {
      setUploading(false);
    }
  };

  const handleLogoDelete = async () => {
    if (!confirm('Are you sure you want to delete the company logo?')) return;

    setUploading(true);
    setMessage(null);

    try {
      const response = await fetch('/api/company/logo', {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete logo');

      setSettings((prev) => prev ? { ...prev, logoStorageKey: null } : null);
      setMessage({ type: 'success', text: 'Logo deleted successfully!' });
    } catch (error) {
      console.error('Error deleting logo:', error);
      setMessage({ type: 'error', text: 'Failed to delete logo' });
    } finally {
      setUploading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">Failed to load company settings.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Company Settings</h1>
      </div>

      {message && (
        <div
          className={`p-4 rounded-lg ${
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
            { id: 'company', label: 'Company Details' },
            { id: 'branding', label: 'Branding' },
            { id: 'quote-template', label: 'Quote Template' },
            { id: 'settings', label: 'Settings' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as typeof activeTab)}
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

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Company Details Tab */}
        {activeTab === 'company' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Company Information</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label">Company Name *</label>
                <input
                  type="text"
                  className="input"
                  value={settings.name}
                  onChange={(e) => setSettings({ ...settings, name: e.target.value })}
                  required
                />
              </div>

              <div>
                <label className="label">ABN</label>
                <input
                  type="text"
                  className="input"
                  value={settings.abn || ''}
                  onChange={(e) => setSettings({ ...settings, abn: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Phone</label>
                <input
                  type="tel"
                  className="input"
                  value={settings.phone || ''}
                  onChange={(e) => setSettings({ ...settings, phone: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Fax</label>
                <input
                  type="tel"
                  className="input"
                  value={settings.fax || ''}
                  onChange={(e) => setSettings({ ...settings, fax: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Email</label>
                <input
                  type="email"
                  className="input"
                  value={settings.email || ''}
                  onChange={(e) => setSettings({ ...settings, email: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Website</label>
                <input
                  type="url"
                  className="input"
                  placeholder="https://example.com"
                  value={settings.website || ''}
                  onChange={(e) => setSettings({ ...settings, website: e.target.value })}
                />
              </div>

              <div className="md:col-span-2">
                <label className="label">Business Address *</label>
                <input
                  type="text"
                  className="input"
                  value={settings.address}
                  onChange={(e) => setSettings({ ...settings, address: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This address appears on quotes and invoices
                </p>
              </div>

              <div className="md:col-span-2">
                <label className="label">Workshop Address *</label>
                <input
                  type="text"
                  className="input"
                  value={settings.workshopAddress}
                  onChange={(e) => setSettings({ ...settings, workshopAddress: e.target.value })}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Used for distance calculations (delivery & templating)
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Branding Tab */}
        {activeTab === 'branding' && (
          <div className="card p-6 space-y-6">
            <h2 className="text-lg font-semibold mb-4">Branding & Logo</h2>

            {/* Logo Upload */}
            <div>
              <label className="label">Company Logo</label>
              <div className="space-y-4">
                {settings.logoStorageKey && (
                  <div className="flex items-center space-x-4">
                    <img
                      src={`/api/company/logo/view?key=${encodeURIComponent(settings.logoStorageKey)}`}
                      alt="Company Logo"
                      className="h-24 w-auto object-contain border border-gray-200 rounded p-2 bg-white"
                    />
                    <button
                      type="button"
                      onClick={handleLogoDelete}
                      disabled={uploading}
                      className="btn-secondary text-red-600 hover:bg-red-50"
                    >
                      Remove Logo
                    </button>
                  </div>
                )}

                <div>
                  <input
                    type="file"
                    id="logo-upload"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    disabled={uploading}
                    className="hidden"
                  />
                  <label
                    htmlFor="logo-upload"
                    className={`btn-secondary inline-block cursor-pointer ${
                      uploading ? 'opacity-50 cursor-not-allowed' : ''
                    }`}
                  >
                    {uploading ? 'Uploading...' : settings.logoStorageKey ? 'Replace Logo' : 'Upload Logo'}
                  </label>
                  <p className="text-xs text-gray-500 mt-2">
                    PNG, JPG, or SVG. Max 5MB. Recommended: 400x100px
                  </p>
                </div>
              </div>
            </div>

            {/* Primary Color */}
            <div>
              <label className="label">Primary Color</label>
              <div className="flex items-center space-x-4">
                <input
                  type="color"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="h-10 w-20 rounded border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  value={settings.primaryColor}
                  onChange={(e) => setSettings({ ...settings, primaryColor: e.target.value })}
                  className="input flex-1"
                  placeholder="#1e40af"
                  pattern="^#[0-9A-Fa-f]{6}$"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Used for headings and accents in PDFs
              </p>
            </div>
          </div>
        )}

        {/* Quote Template Tab */}
        {activeTab === 'quote-template' && (
          <div className="space-y-6">
            {/* Introduction Text */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold mb-4">Introduction Text</h2>
              <p className="text-sm text-gray-600 mb-4">
                These paragraphs appear at the beginning of every quote
              </p>

              <div>
                <label className="label">Paragraph 1</label>
                <textarea
                  className="input"
                  rows={3}
                  value={settings.quoteIntroText1 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteIntroText1: e.target.value })}
                  placeholder="Please see below for our price breakdown..."
                />
              </div>

              <div>
                <label className="label">Paragraph 2</label>
                <textarea
                  className="input"
                  rows={2}
                  value={settings.quoteIntroText2 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteIntroText2: e.target.value })}
                  placeholder="This quote is for supply, fabrication..."
                />
              </div>

              <div>
                <label className="label">Paragraph 3</label>
                <textarea
                  className="input"
                  rows={2}
                  value={settings.quoteIntroText3 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteIntroText3: e.target.value })}
                  placeholder="Thank you for the opportunity..."
                />
              </div>
            </div>

            {/* Please Note Section */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold mb-4">Please Note Section</h2>
              <p className="text-sm text-gray-600 mb-4">
                Highlighted notice box that appears after the introduction
              </p>

              <div>
                <label className="label">Please Note Text</label>
                <textarea
                  className="input"
                  rows={3}
                  value={settings.quotePleaseNote || ''}
                  onChange={(e) => setSettings({ ...settings, quotePleaseNote: e.target.value })}
                  placeholder="This Quote is based on the proviso..."
                />
              </div>
            </div>

            {/* Terms & Conditions */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold mb-4">Terms & Conditions</h2>
              <p className="text-sm text-gray-600 mb-4">
                Legal terms that appear at the bottom of the quote
              </p>

              <div>
                <label className="label">Terms Paragraph 1</label>
                <textarea
                  className="input"
                  rows={4}
                  value={settings.quoteTermsText1 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteTermsText1: e.target.value })}
                  placeholder="Upon acceptance of this quotation..."
                />
              </div>

              <div>
                <label className="label">Terms Paragraph 2</label>
                <textarea
                  className="input"
                  rows={2}
                  value={settings.quoteTermsText2 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteTermsText2: e.target.value })}
                  placeholder="Please read this quote carefully..."
                />
              </div>

              <div>
                <label className="label">Terms Paragraph 3</label>
                <textarea
                  className="input"
                  rows={2}
                  value={settings.quoteTermsText3 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteTermsText3: e.target.value })}
                  placeholder="Please contact our office..."
                />
              </div>

              <div>
                <label className="label">Terms Paragraph 4</label>
                <textarea
                  className="input"
                  rows={2}
                  value={settings.quoteTermsText4 || ''}
                  onChange={(e) => setSettings({ ...settings, quoteTermsText4: e.target.value })}
                  placeholder="This quote is valid for..."
                />
              </div>

              <div>
                <label className="label">Terms & Conditions URL</label>
                <input
                  type="url"
                  className="input"
                  value={settings.termsUrl || ''}
                  onChange={(e) => setSettings({ ...settings, termsUrl: e.target.value })}
                  placeholder="https://yourcompany.com/terms"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Link to your full terms and conditions
                </p>
              </div>
            </div>

            {/* Signature */}
            <div className="card p-6 space-y-4">
              <h2 className="text-lg font-semibold mb-4">Signature</h2>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">Signature Name</label>
                  <input
                    type="text"
                    className="input"
                    value={settings.signatureName || ''}
                    onChange={(e) => setSettings({ ...settings, signatureName: e.target.value })}
                    placeholder="Beau Kavanagh"
                  />
                </div>

                <div>
                  <label className="label">Signature Title</label>
                  <input
                    type="text"
                    className="input"
                    value={settings.signatureTitle || ''}
                    onChange={(e) => setSettings({ ...settings, signatureTitle: e.target.value })}
                    placeholder="Managing Director"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Settings Tab */}
        {activeTab === 'settings' && (
          <div className="card p-6 space-y-4">
            <h2 className="text-lg font-semibold mb-4">Quote Settings</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Quote Validity (days)</label>
                <input
                  type="number"
                  className="input"
                  min="1"
                  max="365"
                  value={settings.quoteValidityDays}
                  onChange={(e) => setSettings({ ...settings, quoteValidityDays: parseInt(e.target.value) })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Number of days the quote remains valid
                </p>
              </div>

              <div>
                <label className="label">Deposit Percentage</label>
                <input
                  type="number"
                  className="input"
                  min="0"
                  max="100"
                  value={settings.depositPercent}
                  onChange={(e) => setSettings({ ...settings, depositPercent: parseInt(e.target.value) })}
                />
                <p className="text-xs text-gray-500 mt-1">
                  Required deposit percentage
                </p>
              </div>

              <div>
                <label className="label">Unit System</label>
                <select
                  className="input"
                  value={settings.defaultUnitSystem}
                  onChange={(e) => setSettings({ ...settings, defaultUnitSystem: e.target.value })}
                >
                  <option value="METRIC">Metric (metres, m²)</option>
                  <option value="IMPERIAL">Imperial (feet, ft²)</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Save Button */}
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="btn-secondary"
            disabled={saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-primary"
            disabled={saving}
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  );
}
