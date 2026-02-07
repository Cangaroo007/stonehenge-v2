'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils';

interface Customer {
  id: number;
  name: string;
  company: string | null;
  clientType?: { id: string; name: string } | null;
  clientTier?: { id: string; name: string } | null;
}

interface Quote {
  id: number;
  quoteNumber: string;
  projectName: string | null;
  status: string;
  total: number;
  subtotal: number;
  createdAt: string;
  rooms: {
    id: number;
    name: string;
    pieces: {
      id: number;
      lengthMm: number;
      widthMm: number;
      totalCost: number;
    }[];
  }[];
}

interface VolumeTier {
  tierId: string;
  name: string;
  minSquareMeters: number;
  maxSquareMeters: number | null;
  discountPercent: number;
}

const VOLUME_TIERS: VolumeTier[] = [
  { tierId: 'small', name: 'Small Project', minSquareMeters: 0, maxSquareMeters: 50, discountPercent: 0 },
  { tierId: 'medium', name: 'Medium Project', minSquareMeters: 50, maxSquareMeters: 150, discountPercent: 5 },
  { tierId: 'large', name: 'Large Project', minSquareMeters: 150, maxSquareMeters: 500, discountPercent: 10 },
  { tierId: 'enterprise', name: 'Enterprise', minSquareMeters: 500, maxSquareMeters: null, discountPercent: 15 },
];

export default function NewUnitBlockPage() {
  const router = useRouter();
  const [step, setStep] = useState<'details' | 'quotes' | 'review'>('details');
  
  const [projectName, setProjectName] = useState('');
  const [projectType, setProjectType] = useState<'APARTMENTS' | 'TOWNHOUSES' | 'COMMERCIAL' | 'OTHER'>('APARTMENTS');
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [availableQuotes, setAvailableQuotes] = useState<Quote[]>([]);
  const [selectedQuoteIds, setSelectedQuoteIds] = useState<number[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculation, setCalculation] = useState<any>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [customersRes, quotesRes] = await Promise.all([
          fetch('/api/customers'),
          fetch('/api/quotes'),
        ]);
        
        if (customersRes.ok) setCustomers(await customersRes.json());
        if (quotesRes.ok) {
          const quotes = await quotesRes.json();
          setAvailableQuotes(quotes.filter((q: Quote) => q.rooms?.some(r => r.pieces?.length > 0)));
        }
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedQuoteIds.length === 0) {
      setCalculation(null);
      return;
    }
    const selectedQuotes = availableQuotes.filter(q => selectedQuoteIds.includes(q.id));
    const totalAreaSqm = selectedQuotes.reduce((sum, quote) => 
      sum + quote.rooms.reduce((roomSum, room) => 
        roomSum + room.pieces.reduce((pieceSum, piece) => 
          pieceSum + (piece.lengthMm * piece.widthMm) / 1_000_000, 0), 0), 0);
    const subtotal = selectedQuotes.reduce((sum, q) => sum + Number(q.subtotal || q.total), 0);
    const volumeTier = VOLUME_TIERS.find(t => {
      const aboveMin = totalAreaSqm >= t.minSquareMeters;
      const belowMax = t.maxSquareMeters === null || totalAreaSqm < t.maxSquareMeters;
      return aboveMin && belowMax;
    }) || VOLUME_TIERS[VOLUME_TIERS.length - 1];
    const volumeDiscount = subtotal * (volumeTier.discountPercent / 100);
    setCalculation({ totalAreaSqm, subtotal, volumeTier, volumeDiscount, grandTotal: subtotal - volumeDiscount, unitCount: selectedQuotes.length });
  }, [selectedQuoteIds, availableQuotes]);

  const toggleQuoteSelection = (quoteId: number) => {
    setSelectedQuoteIds(prev => prev.includes(quoteId) ? prev.filter(id => id !== quoteId) : [...prev, quoteId]);
  };

  const handleSave = async () => {
    if (!projectName || selectedQuoteIds.length === 0 || !selectedCustomerId) return;
    setSaving(true);
    try {
      const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
      const selectedQuotes = availableQuotes.filter(q => selectedQuoteIds.includes(q.id));
      const project = {
        id: `ub-${Date.now()}`,
        name: projectName,
        projectType,
        customer: selectedCustomer,
        quotes: selectedQuotes,
        totalAreaSqm: calculation.totalAreaSqm,
        subtotal: calculation.subtotal,
        volumeDiscount: calculation.volumeDiscount,
        grandTotal: calculation.grandTotal,
        volumeTier: calculation.volumeTier.name,
        createdAt: new Date().toISOString(),
      };
      const existing = JSON.parse(localStorage.getItem('unitBlockProjects') || '[]');
      localStorage.setItem('unitBlockProjects', JSON.stringify([...existing, project]));
      router.push('/quotes/unit-block');
    } catch (err) {
      alert('Failed to save project');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[400px]"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div></div>;
  }

  const selectedCustomer = customers.find(c => c.id === selectedCustomerId);

  return (
    <div className="max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">New Unit Block Project</h1>
          <p className="text-gray-500 mt-1">Create a multi-unit project with volume pricing</p>
        </div>
        <Link href="/quotes/unit-block" className="btn-secondary">Cancel</Link>
      </div>

      <div className="flex items-center mb-8">
        {['Project Details', 'Select Quotes', 'Review'].map((label, index) => {
          const steps: ('details' | 'quotes' | 'review')[] = ['details', 'quotes', 'review'];
          const stepKey = steps[index];
          const isActive = step === stepKey;
          const isCompleted = steps.indexOf(step) > index;
          return (
            <div key={label} className="flex items-center">
              <button onClick={() => index === 0 ? setStep('details') : index === 1 && projectName && selectedCustomerId ? setStep('quotes') : index === 2 && selectedQuoteIds.length > 0 ? setStep('review') : null}
                disabled={index > 0 && (!projectName || !selectedCustomerId)}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${isActive ? 'bg-blue-600 text-white' : isCompleted ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-sm ${isActive ? 'bg-white text-blue-600' : isCompleted ? 'bg-green-600 text-white' : 'bg-gray-300 text-gray-600'}`}>{isCompleted ? '✓' : index + 1}</span>
                {label}
              </button>
              {index < 2 && <div className="w-12 h-0.5 bg-gray-200 mx-2" />}
            </div>
          );
        })}
      </div>

      {step === 'details' && (
        <div className="bg-white rounded-lg shadow p-6 space-y-6">
          <h2 className="text-lg font-semibold text-gray-900">Project Details</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Name *</label>
              <input type="text" value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g., Skyline Apartments - Building A" className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Project Type *</label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="APARTMENTS">Apartments</option>
                <option value="TOWNHOUSES">Townhouses</option>
                <option value="COMMERCIAL">Commercial</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
            <select value={selectedCustomerId || ''} onChange={(e) => setSelectedCustomerId(Number(e.target.value) || null)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
              <option value="">Select a customer...</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.company || c.name}{c.clientType ? ` (${c.client_types.name})` : ''}</option>)}
            </select>
          </div>
          <div className="pt-4 border-t border-gray-200 flex justify-end">
            <button onClick={() => setStep('quotes')} disabled={!projectName || !selectedCustomerId} className="btn-primary disabled:opacity-50">Continue →</button>
          </div>
        </div>
      )}

      {step === 'quotes' && selectedCustomer && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Select Quotes for {projectName}</h2>
              <span className="text-sm text-gray-500">{selectedQuoteIds.length} selected</span>
            </div>
            <div className="border rounded-lg divide-y divide-gray-200">
              {availableQuotes.filter(q => q.rooms?.some(r => r.pieces?.length > 0)).map(quote => {
                const isSelected = selectedQuoteIds.includes(quote.id);
                const pieceCount = quote.rooms.reduce((sum, r) => sum + r.pieces.length, 0);
                const areaSqm = quote.rooms.reduce((sum, r) => sum + r.pieces.reduce((pSum, p) => pSum + (p.lengthMm * p.widthMm) / 1_000_000, 0), 0);
                return (
                  <div key={quote.id} onClick={() => toggleQuoteSelection(quote.id)} className={`p-4 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50 border-l-4 border-blue-500' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center gap-4">
                      <input type="checkbox" checked={isSelected} onChange={() => {}} className="h-5 w-5 text-blue-600 rounded" />
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">{quote.quoteNumber}</span>
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${quote.status === 'ACCEPTED' ? 'bg-green-100 text-green-800' : quote.status === 'SENT' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'}`}>{quote.status}</span>
                        </div>
                        <p className="text-sm text-gray-500">{quote.projectName || 'Unnamed Project'}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-medium">{pieceCount} pieces</p>
                        <p className="text-gray-500">{areaSqm.toFixed(2)} m²</p>
                      </div>
                      <div className="text-right min-w-[100px]">
                        <p className="font-medium">{formatCurrency(Number(quote.total))}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          {calculation && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-blue-900 mb-4">Project Summary</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-blue-700">Units</p><p className="text-2xl font-bold text-blue-900">{calculation.unitCount}</p></div>
                <div><p className="text-blue-700">Total Area</p><p className="text-2xl font-bold text-blue-900">{calculation.totalAreaSqm.toFixed(2)} m²</p></div>
                <div><p className="text-blue-700">Volume Tier</p><p className="text-xl font-bold text-blue-900">{calculation.volumeTier.name}</p><p className="text-blue-600">{calculation.volumeTier.discountPercent}% discount</p></div>
                <div><p className="text-blue-700">Est. Total</p><p className="text-2xl font-bold text-blue-900">{formatCurrency(calculation.grandTotal)}</p></div>
              </div>
            </div>
          )}
          <div className="flex justify-between">
            <button onClick={() => setStep('details')} className="btn-secondary">← Back</button>
            <button onClick={() => setStep('review')} disabled={selectedQuoteIds.length === 0} className="btn-primary disabled:opacity-50">Review →</button>
          </div>
        </div>
      )}

      {step === 'review' && calculation && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Review Project</h2>
            <div className="grid md:grid-cols-2 gap-6 mb-6 pb-6 border-b border-gray-200">
              <div><p className="text-sm text-gray-500">Project Name</p><p className="font-medium">{projectName}</p></div>
              <div><p className="text-sm text-gray-500">Project Type</p><p className="font-medium">{projectType}</p></div>
              <div><p className="text-sm text-gray-500">Customer</p><p className="font-medium">{selectedCustomer?.company || selectedCustomer?.name}</p></div>
              <div><p className="text-sm text-gray-500">Units</p><p className="font-medium">{calculation.unitCount} quotes</p></div>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between text-sm"><span className="text-gray-600">Total Area:</span><span className="font-medium">{calculation.totalAreaSqm.toFixed(2)} m²</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Volume Tier:</span><span className="font-medium text-blue-600">{calculation.volumeTier.name} ({calculation.volumeTier.discountPercent}% discount)</span></div>
              <div className="flex justify-between text-sm"><span className="text-gray-600">Subtotal:</span><span className="font-medium">{formatCurrency(calculation.subtotal)}</span></div>
              <div className="flex justify-between text-sm text-green-600"><span>Volume Discount:</span><span className="font-medium">-{formatCurrency(calculation.volumeDiscount)}</span></div>
              <div className="flex justify-between text-lg font-semibold pt-3 border-t border-gray-200"><span>Grand Total:</span><span className="text-blue-600">{formatCurrency(calculation.grandTotal)}</span></div>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="font-semibold text-gray-900 mb-4">Selected Quotes</h3>
            <div className="space-y-2">
              {availableQuotes.filter(q => selectedQuoteIds.includes(q.id)).map(quote => (
                <div key={quote.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <div><p className="font-medium">{quote.quoteNumber}</p><p className="text-sm text-gray-500">{quote.projectName || 'Unnamed Project'}</p></div>
                  <p className="font-medium">{formatCurrency(Number(quote.total))}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep('quotes')} className="btn-secondary">← Back</button>
            <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">{saving ? 'Saving...' : 'Create Project'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
