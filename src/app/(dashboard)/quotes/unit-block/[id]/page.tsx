'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface Quote {
  id: number;
  quote_number: string;
  project_name: string | null;
  status: string;
  total: number;
  subtotal: number;
  rooms: {
    id: number;
    name: string;
    pieces: {
      id: number;
      name: string;
      lengthMm: number;
      widthMm: number;
      totalCost: number;
    }[];
  }[];
}

interface UnitBlockProject {
  id: string;
  name: string;
  projectType: 'APARTMENTS' | 'TOWNHOUSES' | 'COMMERCIAL' | 'OTHER';
  customer: {
    id: number;
    name: string;
    company: string | null;
  };
  quotes: Quote[];
  totalAreaSqm: number;
  subtotal: number;
  volumeDiscount: number;
  grandTotal: number;
  volumeTier: string;
  createdAt: string;
}

export default function UnitBlockDetailPage() {
  const params = useParams();
  const projectId = params.id as string;
  const [project, setProject] = useState<UnitBlockProject | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem('unitBlockProjects');
    if (saved) {
      const projects: UnitBlockProject[] = JSON.parse(saved);
      setProject(projects.find(p => p.id === projectId) || null);
    }
    setLoading(false);
  }, [projectId]);

  if (loading) return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  if (!project) return <div className="text-center py-12"><p className="text-gray-500 mb-4">Project not found</p><Link href="/quotes/unit-block" className="btn-secondary">Back to Projects</Link></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Link href="/quotes/unit-block" className="text-gray-500 hover:text-gray-700">← Back to Projects</Link>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          <p className="text-gray-500">{project.customer.company || project.customer.name} • {project.projectType}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => alert('Export coming soon')} className="btn-secondary">Export PDF</button>
          <Link href="/quotes/unit-block" className="btn-primary">Edit Project</Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Units</p><p className="text-3xl font-bold text-gray-900">{project.quotes.length}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Total Area</p><p className="text-3xl font-bold text-gray-900">{project.totalAreaSqm.toFixed(2)} m²</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Volume Tier</p><p className="text-2xl font-bold text-blue-600">{project.volumeTier}</p></div>
        <div className="bg-white rounded-lg shadow p-6"><p className="text-sm text-gray-500 mb-1">Grand Total</p><p className="text-3xl font-bold text-green-600">{formatCurrency(project.grandTotal)}</p></div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Pricing Summary</h2></div>
        <div className="p-6">
          <div className="max-w-md space-y-3">
            <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal ({project.quotes.length} units):</span><span className="font-medium">{formatCurrency(project.subtotal)}</span></div>
            <div className="flex justify-between text-sm text-green-600"><span>Volume Discount:</span><span className="font-medium">-{formatCurrency(project.volumeDiscount)}</span></div>
            <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-200"><span>Grand Total:</span><span className="text-blue-600">{formatCurrency(project.grandTotal)}</span></div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow">
        <div className="p-6 border-b border-gray-200"><h2 className="text-lg font-semibold text-gray-900">Units</h2></div>
        <div className="divide-y divide-gray-200">
          {project.quotes.map((quote, index) => {
            const pieceCount = quote.rooms.reduce((sum, r) => sum + r.pieces.length, 0);
            const areaSqm = quote.rooms.reduce((sum, r) => sum + r.pieces.reduce((pSum, p) => pSum + (p.lengthMm * p.widthMm) / 1_000_000, 0), 0);
            return (
              <div key={quote.id} className="p-6 hover:bg-gray-50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-semibold">{index + 1}</span>
                    <div><p className="font-medium text-gray-900">{quote.quote_number}</p><p className="text-sm text-gray-500">{quote.project_name || 'Unnamed Unit'}</p></div>
                  </div>
                  <div className="text-right"><p className="font-medium">{formatCurrency(Number(quote.total))}</p><p className="text-sm text-gray-500">{pieceCount} pieces • {areaSqm.toFixed(2)} m²</p></div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="font-semibold text-blue-900 mb-2">Volume Pricing Applied</h3>
        <p className="text-sm text-blue-800 mb-4">This project qualifies for <strong>{project.volumeTier}</strong> pricing tier based on a total area of {project.totalAreaSqm.toFixed(2)} m² across {project.quotes.length} units.</p>
        <div className="grid md:grid-cols-2 gap-4 text-sm">
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Benefits</h4>
            <ul className="list-disc list-inside text-blue-800 space-y-1">
              <li>Volume discount on materials</li>
              <li>Discounted fabrication rates</li>
              <li>Consolidated material ordering</li>
              <li>Single point of contact</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-900 mb-1">Savings</h4>
            <p className="text-blue-800">Total volume discount: <strong className="text-green-700">{formatCurrency(project.volumeDiscount)}</strong></p>
            <p className="text-blue-800 mt-1">Compared to individual unit pricing</p>
          </div>
        </div>
      </div>
    </div>
  );
}
