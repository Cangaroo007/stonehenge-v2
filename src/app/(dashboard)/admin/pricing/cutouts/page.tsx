'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';

interface CutoutRate {
  id: string;
  cutoutType: string;
  name: string;
  description: string | null;
  rate: number;
  isActive: boolean;
}

export default function CutoutRatesPage() {
  const [rates, setRates] = useState<CutoutRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchRates();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const fetchRates = async () => {
    try {
      const res = await fetch('/api/admin/pricing/cutout-types');
      if (!res.ok) throw new Error('Failed to fetch cutout rates');
      const data = await res.json();
      setRates(data);
    } catch (error) {
      console.error('Error fetching cutout rates:', error);
      setToast({ message: 'Failed to load cutout rates', type: 'error' });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-gray-500">Loading cutout rates...</div>
      </div>
    );
  }

  return (
    <>
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

      <div className="card">
        <div className="text-center py-12">
          <p className="text-gray-700 font-medium">Cutout Rates</p>
          <p className="text-sm text-gray-500 mt-2">
            Cutout rates are managed in the main Pricing page under the "Cutout Types" tab.
          </p>
          <a
            href="/admin/pricing"
            className="inline-block mt-4 text-primary-600 hover:text-primary-700 text-sm font-medium"
          >
            Go to Cutout Types →
          </a>
        </div>
      </div>
    </>
  );
}
