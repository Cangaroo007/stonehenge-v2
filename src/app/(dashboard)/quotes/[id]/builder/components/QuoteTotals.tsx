'use client';

import { formatCurrency } from '@/lib/utils';

interface QuoteTotalsProps {
  fabricationTotal: number;
  materialsTotal: number;
  additionalTotal: number;
  subtotal: number;
  additionalDiscount?: {
    type: 'percentage' | 'fixed';
    value: number;
  };
  onDiscountChange?: (discount: { type: 'percentage' | 'fixed'; value: number }) => void;
  subtotalAfterDiscount: number;
  gst: number;
  total: number;
}

export default function QuoteTotals({
  fabricationTotal,
  materialsTotal,
  additionalTotal,
  subtotal,
  additionalDiscount,
  onDiscountChange,
  subtotalAfterDiscount,
  gst,
  total,
}: QuoteTotalsProps) {
  const discountAmount = subtotal - subtotalAfterDiscount;

  return (
    <div className="space-y-3">
      {/* Totals Breakdown */}
      <div className="pt-3 border-t-2 border-gray-300">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between font-medium">
            <span>FABRICATION TOTAL:</span>
            <span>{formatCurrency(fabricationTotal)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>MATERIALS TOTAL:</span>
            <span>{formatCurrency(materialsTotal)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>ADDITIONAL TOTAL:</span>
            <span>{formatCurrency(additionalTotal)}</span>
          </div>
        </div>
      </div>

      {/* Subtotal and Additional Discount */}
      <div className="pt-3 border-t border-gray-200">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">SUBTOTAL:</span>
            <span className="font-medium">{formatCurrency(subtotal)}</span>
          </div>
          
          {/* Additional Discount Input */}
          {onDiscountChange && (
            <div className="flex justify-between items-center">
              <span>ADDITIONAL DISCOUNT:</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={additionalDiscount?.value || 0}
                  onChange={(e) => onDiscountChange({
                    type: additionalDiscount?.type || 'percentage',
                    value: parseFloat(e.target.value) || 0
                  })}
                  className="w-16 px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
                <select
                  value={additionalDiscount?.type || 'percentage'}
                  onChange={(e) => onDiscountChange({
                    type: e.target.value as 'percentage' | 'fixed',
                    value: additionalDiscount?.value || 0
                  })}
                  className="px-2 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                >
                  <option value="percentage">%</option>
                  <option value="fixed">$</option>
                </select>
                <span className="text-red-600 font-medium">-{formatCurrency(discountAmount)}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Final Totals */}
      <div className="pt-3 border-t border-gray-200">
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="font-medium">SUBTOTAL (after discount):</span>
            <span className="font-medium">{formatCurrency(subtotalAfterDiscount)}</span>
          </div>
          <div className="flex justify-between">
            <span>GST (10%):</span>
            <span>{formatCurrency(gst)}</span>
          </div>
        </div>
      </div>

      {/* Grand Total */}
      <div className="pt-3 border-t-2 border-gray-800">
        <div className="flex justify-between text-lg font-bold">
          <span>TOTAL:</span>
          <span className="text-primary-600">{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
