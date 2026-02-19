'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface QuoteTemplate {
  id: string;
  name: string;
  description: string | null;
  format_type: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export default function QuoteTemplatesPage() {
  const router = useRouter();
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    fetchTemplates();
  }, []);

  const fetchTemplates = async () => {
    try {
      const response = await fetch('/api/quote-templates');
      if (!response.ok) throw new Error('Failed to fetch templates');
      const data = await response.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
      setMessage({ type: 'error', text: 'Failed to load templates' });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTemplate = async () => {
    try {
      const response = await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New Template',
          format_type: 'COMPREHENSIVE',
          is_default: templates.length === 0,
        }),
      });

      if (!response.ok) throw new Error('Failed to create template');
      const template = await response.json();
      router.push(`/settings/quote-templates/${template.id}`);
    } catch (error) {
      console.error('Error creating template:', error);
      setMessage({ type: 'error', text: 'Failed to create template' });
    }
  };

  const handleDuplicate = async (template: QuoteTemplate) => {
    try {
      // Fetch full template data
      const res = await fetch(`/api/quote-templates/${template.id}`);
      if (!res.ok) throw new Error('Failed to fetch template');
      const fullTemplate = await res.json();

      // Create a copy
      const response = await fetch('/api/quote-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...fullTemplate,
          id: undefined,
          name: `${template.name} (Copy)`,
          is_default: false,
          created_at: undefined,
          updated_at: undefined,
        }),
      });

      if (!response.ok) throw new Error('Failed to duplicate template');
      const newTemplate = await response.json();
      setTemplates([...templates, newTemplate]);
      setMessage({ type: 'success', text: `Duplicated "${template.name}"` });
    } catch (error) {
      console.error('Error duplicating template:', error);
      setMessage({ type: 'error', text: 'Failed to duplicate template' });
    }
  };

  const handleSetDefault = async (template: QuoteTemplate) => {
    try {
      const response = await fetch(`/api/quote-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_default: true }),
      });

      if (!response.ok) throw new Error('Failed to update template');
      await fetchTemplates();
      setMessage({ type: 'success', text: `"${template.name}" is now the default template` });
    } catch (error) {
      console.error('Error setting default:', error);
      setMessage({ type: 'error', text: 'Failed to set default template' });
    }
  };

  const handleToggleActive = async (template: QuoteTemplate) => {
    try {
      const response = await fetch(`/api/quote-templates/${template.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !template.is_active }),
      });

      if (!response.ok) throw new Error('Failed to update template');
      await fetchTemplates();
      setMessage({
        type: 'success',
        text: `"${template.name}" ${template.is_active ? 'deactivated' : 'activated'}`,
      });
    } catch (error) {
      console.error('Error toggling active:', error);
      setMessage({ type: 'error', text: 'Failed to update template' });
    }
  };

  const handleDelete = async (template: QuoteTemplate) => {
    if (!confirm(`Are you sure you want to delete "${template.name}"?`)) return;

    try {
      const response = await fetch(`/api/quote-templates/${template.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) throw new Error('Failed to delete template');
      setTemplates(templates.filter((t) => t.id !== template.id));
      setMessage({ type: 'success', text: `Deleted "${template.name}"` });
    } catch (error) {
      console.error('Error deleting template:', error);
      setMessage({ type: 'error', text: 'Failed to delete template' });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading templates...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Quote Templates</h1>
          <p className="text-sm text-gray-600 mt-1">
            Customise which sections appear on your quote PDFs
          </p>
        </div>
        <button onClick={handleCreateTemplate} className="btn-primary">
          Create New Template
        </button>
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

      {templates.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-gray-600 mb-4">No templates yet. Create your first template to get started.</p>
          <button onClick={handleCreateTemplate} className="btn-primary">
            Create Template
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className={`card p-5 ${!template.is_active ? 'opacity-60' : ''}`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          template.format_type === 'COMPREHENSIVE'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-green-100 text-green-800'
                        }`}
                      >
                        {template.format_type === 'COMPREHENSIVE' ? 'Comprehensive' : 'Summary'}
                      </span>
                      {template.is_default && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                          Default
                        </span>
                      )}
                      {!template.is_active && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                          Inactive
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Link
                    href={`/settings/quote-templates/${template.id}`}
                    className="btn-secondary text-sm"
                  >
                    Edit
                  </Link>
                  <button
                    onClick={() => handleDuplicate(template)}
                    className="btn-secondary text-sm"
                  >
                    Duplicate
                  </button>
                  {!template.is_default && (
                    <button
                      onClick={() => handleSetDefault(template)}
                      className="btn-secondary text-sm"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    onClick={() => handleToggleActive(template)}
                    className="btn-secondary text-sm"
                  >
                    {template.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {!template.is_default && (
                    <button
                      onClick={() => handleDelete(template)}
                      className="btn-secondary text-sm text-red-600 hover:bg-red-50"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="text-sm text-gray-500">
        <Link href="/settings/company" className="text-blue-600 hover:underline">
          Company Settings
        </Link>
        {' — '}
        Manage company-level defaults for branding, intro text, and terms
      </div>
    </div>
  );
}
