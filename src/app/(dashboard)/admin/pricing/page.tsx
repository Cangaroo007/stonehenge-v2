'use client';

import { useState, useEffect, useCallback } from 'react';
import EntityTable from './components/EntityTable';
import EntityModal from './components/EntityModal';
import EdgeTypeForm from './components/EdgeTypeForm';
import CutoutTypeForm from './components/CutoutTypeForm';
import ThicknessForm from './components/ThicknessForm';
import ClientTypeForm from './components/ClientTypeForm';
import ClientTierForm from './components/ClientTierForm';
import PricingRuleForm from './components/PricingRuleForm';
import PriceBookForm from './components/PriceBookForm';
import StripConfigurationForm from './components/StripConfigurationForm';
import TierManagement from '@/components/pricing/TierManagement';
import MachineManagement from '@/components/pricing/MachineManagement';
import { cn } from '@/lib/utils';

type TabKey = 'edge-types' | 'cutout-types' | 'thickness-options' | 'client-types' | 'client-tiers' | 'pricing-rules' | 'price-books' | 'strip-configurations' | 'tiers' | 'machines';

interface Tab {
  key: TabKey;
  label: string;
  apiPath: string;
}

const tabs: Tab[] = [
  { key: 'edge-types', label: 'Edge Types', apiPath: '/api/admin/pricing/edge-types' },
  { key: 'cutout-types', label: 'Cutout Types', apiPath: '/api/admin/pricing/cutout-types' },
  { key: 'thickness-options', label: 'Thickness', apiPath: '/api/admin/pricing/thickness-options' },
  { key: 'strip-configurations', label: 'Strip Configurations', apiPath: '/api/admin/pricing/strip-configurations' },
  { key: 'machines', label: 'Machines', apiPath: '/api/admin/pricing/machines' },
  { key: 'client-types', label: 'Client Types', apiPath: '/api/admin/pricing/client-types' },
  { key: 'client-tiers', label: 'Client Tiers', apiPath: '/api/admin/pricing/client-tiers' },
  { key: 'tiers', label: 'Tiers', apiPath: '/api/admin/pricing/tiers' },
  { key: 'pricing-rules', label: 'Pricing Rules', apiPath: '/api/admin/pricing/pricing-rules' },
  { key: 'price-books', label: 'Price Books', apiPath: '/api/admin/pricing/price-books' },
];

interface Column {
  key: string;
  label: string;
  render?: (value: unknown, row: Record<string, unknown>) => React.ReactNode;
}

const columnConfigs: Record<TabKey, Column[]> = {
  'edge-types': [
    { key: 'name', label: 'Name' },
    { key: 'category', label: 'Category' },
    { key: 'baseRate', label: 'Base Rate', render: (v) => `$${Number(v).toFixed(2)}/m` },
    { key: 'sortOrder', label: 'Sort Order' },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'cutout-types': [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'baseRate', label: 'Base Rate', render: (v) => `$${Number(v).toFixed(2)}` },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'thickness-options': [
    { key: 'name', label: 'Name' },
    { key: 'value', label: 'Value (mm)' },
    { key: 'multiplier', label: 'Multiplier', render: (v) => `${Number(v).toFixed(2)}x` },
    { key: 'isDefault', label: 'Default', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'strip-configurations': [
    { key: 'name', label: 'Name' },
    { key: 'usageType', label: 'Usage Type', render: (v) => formatUsageType(v as string) },
    { key: 'finalThickness', label: 'Final Thickness', render: (v) => `${v}mm` },
    { key: 'totalMaterialWidth', label: 'Total Width', render: (v) => `${v}mm` },
    { key: 'isDefault', label: 'Default', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'client-types': [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'sortOrder', label: 'Sort Order' },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'client-tiers': [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'priority', label: 'Priority' },
    { key: 'isDefault', label: 'Default', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'tiers': [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'priority', label: 'Priority' },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'machines': [
    { key: 'name', label: 'Name' },
    { key: 'kerfWidthMm', label: 'Kerf Width', render: (v) => `${v}mm` },
    { key: 'isDefault', label: 'Default', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'pricing-rules': [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'priority', label: 'Priority' },
    { key: 'adjustmentType', label: 'Type' },
    { key: 'adjustmentValue', label: 'Value', render: (v, row) => formatAdjustment(row.adjustmentType as string, v as number) },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
  'price-books': [
    { key: 'name', label: 'Name' },
    { key: 'description', label: 'Description' },
    { key: 'category', label: 'Category' },
    { key: 'defaultThickness', label: 'Default Thickness', render: (v) => `${v}mm` },
    { key: 'isDefault', label: 'Default', render: (v) => (v ? 'Yes' : 'No') },
    { key: 'isActive', label: 'Status', render: (v) => <StatusBadge active={v as boolean} /> },
  ],
};

function StatusBadge({ active }: { active: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium',
        active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
      )}
    >
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function formatAdjustment(type: string, value: number): string {
  if (type === 'percentage') {
    return `${Number(value) >= 0 ? '+' : ''}${Number(value).toFixed(2)}%`;
  }
  return `${Number(value) >= 0 ? '+' : ''}$${Number(value).toFixed(2)}`;
}

function formatUsageType(type: string): string {
  const labels: Record<string, string> = {
    EDGE_LAMINATION: 'Edge Lamination',
    WATERFALL_STANDARD: 'Waterfall (Standard)',
    WATERFALL_EXTENDED: 'Waterfall (Extended)',
    APRON: 'Apron',
    CUSTOM: 'Custom',
  };
  return labels[type] || type;
}

export default function PricingAdminPage() {
  const [activeTab, setActiveTab] = useState<TabKey>('edge-types');
  const [data, setData] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Record<string, unknown> | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [clientTypes, setClientTypes] = useState<Record<string, unknown>[]>([]);
  const [pricingRules, setPricingRules] = useState<Record<string, unknown>[]>([]);

  const currentTab = tabs.find((t) => t.key === activeTab)!;

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(currentTab.apiPath);
      if (!res.ok) throw new Error('Failed to fetch data');
      const json = await res.json();
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  }, [currentTab.apiPath]);

  const fetchRelatedData = useCallback(async () => {
    if (activeTab === 'client-tiers' || activeTab === 'pricing-rules') {
      try {
        const res = await fetch('/api/admin/pricing/client-types');
        if (res.ok) {
          const json = await res.json();
          setClientTypes(json);
        }
      } catch {
        // Silently fail for related data
      }
    }
    if (activeTab === 'price-books') {
      try {
        const res = await fetch('/api/admin/pricing/pricing-rules');
        if (res.ok) {
          const json = await res.json();
          setPricingRules(json);
        }
      } catch {
        // Silently fail for related data
      }
    }
  }, [activeTab]);

  useEffect(() => {
    fetchData();
    fetchRelatedData();
  }, [fetchData, fetchRelatedData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const showToast = (message: string, type: 'success' | 'error') => {
    setToast({ message, type });
  };

  const handleAdd = () => {
    setEditingItem(null);
    setModalOpen(true);
  };

  const handleEdit = (item: Record<string, unknown>) => {
    setEditingItem(item);
    setModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`${currentTab.apiPath}/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
      showToast('Item deleted successfully', 'success');
      fetchData();
    } catch {
      showToast('Failed to delete item', 'error');
    }
    setDeleteConfirmId(null);
  };

  const handleSave = async (formData: Record<string, unknown>) => {
    try {
      const isEditing = editingItem !== null;
      const url = isEditing ? `${currentTab.apiPath}/${editingItem.id}` : currentTab.apiPath;
      const method = isEditing ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to save');
      }

      showToast(isEditing ? 'Item updated successfully' : 'Item created successfully', 'success');
      setModalOpen(false);
      setEditingItem(null);
      fetchData();
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Failed to save item', 'error');
    }
  };

  const renderForm = () => {
    const props = {
      initialData: editingItem,
      onSave: handleSave,
      onCancel: () => {
        setModalOpen(false);
        setEditingItem(null);
      },
    };

    switch (activeTab) {
      case 'edge-types':
        return <EdgeTypeForm {...props} />;
      case 'cutout-types':
        return <CutoutTypeForm {...props} />;
      case 'thickness-options':
        return <ThicknessForm {...props} />;
      case 'strip-configurations':
        return <StripConfigurationForm {...props} />;
      case 'client-types':
        return <ClientTypeForm {...props} />;
      case 'client-tiers':
        return <ClientTierForm {...props} clientTypes={clientTypes} />;
      case 'pricing-rules':
        return <PricingRuleForm {...props} clientTypes={clientTypes} />;
      case 'price-books':
        return <PriceBookForm {...props} pricingRules={pricingRules} />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pricing Management</h1>
      </div>

      {/* Toast Notification */}
      {toast && (
        <div
          className={cn(
            'fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg',
            toast.type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'
          )}
        >
          {toast.message}
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium',
                activeTab === tab.key
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              )}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="card">
        {activeTab === 'tiers' ? (
          <TierManagement />
        ) : activeTab === 'machines' ? (
          <MachineManagement />
        ) : (
          <EntityTable
            columns={columnConfigs[activeTab]}
            data={data}
            loading={loading}
            error={error}
            onAdd={handleAdd}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteConfirmId(id)}
            entityName={currentTab.label}
          />
        )}
      </div>

      {/* Add/Edit Modal */}
      <EntityModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingItem(null);
        }}
        title={editingItem ? `Edit ${currentTab.label.slice(0, -1)}` : `Add ${currentTab.label.slice(0, -1)}`}
      >
        {renderForm()}
      </EntityModal>

      {/* Delete Confirmation Modal */}
      <EntityModal
        isOpen={deleteConfirmId !== null}
        onClose={() => setDeleteConfirmId(null)}
        title="Confirm Delete"
      >
        <div className="space-y-4">
          <p className="text-gray-600">Are you sure you want to delete this item? This action cannot be undone.</p>
          <div className="flex justify-end space-x-3">
            <button
              onClick={() => setDeleteConfirmId(null)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => deleteConfirmId && handleDelete(deleteConfirmId)}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>
      </EntityModal>
    </div>
  );
}
