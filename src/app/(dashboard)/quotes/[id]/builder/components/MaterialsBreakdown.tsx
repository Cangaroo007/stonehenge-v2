'use client';

import { formatCurrency } from '@/lib/utils';

interface MaterialsBreakdownProps {
  slabs?: Array<{
    material: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  joins?: Array<{
    quantity: number;
    length: number;
    rate: number;
    total: number;
  }>;
  total: number;
}

export default function MaterialsBreakdown({
  slabs = [],
  joins = [],
  total,
}: MaterialsBreakdownProps) {
  return (
    <div className="pb-3 border-b border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">MATERIALS</h4>
      <div className="space-y-1 text-sm">
        {slabs.map((slab, idx) => (
          <div key={idx} className="flex justify-between text-gray-600">
            <span>Slabs: {slab.quantity} × {slab.material} @ {formatCurrency(slab.unitPrice)}</span>
            <span>{formatCurrency(slab.total)}</span>
          </div>
        ))}
        {joins.map((join, idx) => (
          <div key={idx} className="flex justify-between text-gray-600">
            <span>Join: {join.quantity} × {join.length.toFixed(1)} Lm @ {formatCurrency(join.rate)}</span>
            <span>{formatCurrency(join.total)}</span>
          </div>
        ))}
        <div className="flex justify-between font-medium pt-1 border-t border-gray-200 mt-1">
          <span>MATERIALS TOTAL:</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
