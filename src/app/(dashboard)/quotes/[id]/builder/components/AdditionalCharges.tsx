'use client';

import { formatCurrency } from '@/lib/utils';

interface AdditionalChargesProps {
  delivery?: {
    zone?: string;
    price: number;
  } | null;
  templating?: {
    price: number;
  } | null;
  installation?: {
    area: number;
    rate: number;
    total: number;
  } | null;
  total: number;
}

export default function AdditionalCharges({
  delivery,
  templating,
  installation,
  total,
}: AdditionalChargesProps) {
  return (
    <div className="pb-3 border-b border-gray-200">
      <h4 className="text-sm font-semibold text-gray-700 mb-2">ADDITIONAL</h4>
      <div className="space-y-1 text-sm">
        {delivery && delivery.price > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Delivery{delivery.zone ? ` (${delivery.zone})` : ''}:</span>
            <span>{formatCurrency(delivery.price)}</span>
          </div>
        )}
        {templating && templating.price > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Templating:</span>
            <span>{formatCurrency(templating.price)}</span>
          </div>
        )}
        {installation && installation.total > 0 && (
          <div className="flex justify-between text-gray-600">
            <span>Installation: {installation.area.toFixed(2)} m² × {formatCurrency(installation.rate)}</span>
            <span>{formatCurrency(installation.total)}</span>
          </div>
        )}
        <div className="flex justify-between font-medium pt-1 border-t border-gray-200 mt-1">
          <span>ADDITIONAL TOTAL:</span>
          <span>{formatCurrency(total)}</span>
        </div>
      </div>
    </div>
  );
}
