'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface Customer {
  id: number;
  name: string;
  company: string | null;
}

interface UnitBlockProject {
  id: number;
  name: string;
  customer: Customer | null;
  projectType: 'APARTMENTS' | 'TOWNHOUSES' | 'COMMERCIAL' | 'MIXED_USE' | 'OTHER';
  status: string;
  totalUnits: number;
  totalArea_sqm: string | number | null;
  subtotalExGst: string | number | null;
  discountAmount: string | number | null;
  grandTotal: string | number | null;
  volumeTier: string | null;
  volumeDiscount: string | number | null;
  createdAt: string;
}

export default function UnitBlockProjectsPage() {
  const [projects, setProjects] = useState<UnitBlockProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProjects();
  }, []);

  const fetchProjects = async () => {
    try {
      const res = await fetch('/api/unit-blocks');
      if (res.ok) {
        const data = await res.json();
        setProjects(data);
      }
    } catch (err) {
      console.error('Failed to load projects:', err);
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (id: number) => {
    if (!confirm('Are you sure you want to delete this project?')) return;
    try {
      const res = await fetch(`/api/unit-blocks/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setProjects(projects.filter(p => p.id !== id));
      }
    } catch (err) {
      console.error('Failed to delete project:', err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Unit Block Projects</h1>
          <p className="text-gray-500 mt-1">
            Multi-unit developments with volume pricing and consolidated billing
          </p>
        </div>
        <Link
          href="/quotes/new/unit-block"
          className="btn-primary"
        >
          + New Unit Block Project
        </Link>
      </div>

      {/* Projects Grid */}
      {projects.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <svg
            className="mx-auto h-12 w-12 text-gray-400 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No unit block projects yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Create a unit block project to manage multi-unit developments like apartments or townhouses.
            Combine multiple quotes for volume discounts and consolidated billing.
          </p>
          <Link href="/quotes/new/unit-block" className="btn-primary">
            Create Your First Project
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div key={project.id} className="bg-white rounded-lg shadow hover:shadow-md transition-shadow">
              <div className="p-6">
                {/* Project Type Badge */}
                <div className="flex items-center justify-between mb-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    project.projectType === 'APARTMENTS' ? 'bg-blue-100 text-blue-800' :
                    project.projectType === 'TOWNHOUSES' ? 'bg-green-100 text-green-800' :
                    project.projectType === 'COMMERCIAL' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {project.projectType}
                  </span>
                  <span className="text-xs text-gray-500">
                    {new Date(project.createdAt).toLocaleDateString()}
                  </span>
                </div>

                {/* Project Name */}
                <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                  {project.name}
                </h3>
                <p className="text-sm text-gray-500 mb-4">
                  {project.customer?.company || project.customer?.name || 'No customer'}
                </p>

                {/* Stats */}
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Units:</span>
                    <span className="font-medium">{project.totalUnits}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total Area:</span>
                    <span className="font-medium">{Number(project.totalArea_sqm || 0).toFixed(2)} m²</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Volume Tier:</span>
                    <span className="font-medium text-blue-600">{project.volumeTier || 'N/A'}</span>
                  </div>
                </div>

                {/* Pricing */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Subtotal:</span>
                    <span className="font-medium">{formatCurrency(Number(project.subtotalExGst || 0))}</span>
                  </div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-600">Volume Discount:</span>
                    <span className="font-medium text-green-600">
                      -{formatCurrency(Number(project.discountAmount || 0))}
                    </span>
                  </div>
                  <div className="flex justify-between text-base font-semibold pt-2 border-t border-gray-100">
                    <span className="text-gray-900">Total:</span>
                    <span className="text-primary-600">{formatCurrency(Number(project.grandTotal || 0))}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="mt-4 flex gap-2">
                  <Link
                    href={`/quotes/unit-block/${project.id}`}
                    className="flex-1 text-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium transition-colors"
                  >
                    View Project
                  </Link>
                  <button
                    onClick={() => deleteProject(project.id)}
                    className="px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
                    title="Delete project"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Info Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mt-8">
        <h3 className="text-lg font-semibold text-blue-900 mb-2">About Unit Block Projects</h3>
        <div className="grid md:grid-cols-3 gap-6 text-sm text-blue-800">
          <div>
            <h4 className="font-medium mb-1">Volume Discounts</h4>
            <p>Automatic tiered pricing based on total project size. Larger projects get bigger discounts.</p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Consolidated Billing</h4>
            <p>One invoice for the entire project, or break down by building, floor, or phase.</p>
          </div>
          <div>
            <h4 className="font-medium mb-1">Material Optimization</h4>
            <p>Order materials for multiple units together to reduce waste and get better pricing.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
