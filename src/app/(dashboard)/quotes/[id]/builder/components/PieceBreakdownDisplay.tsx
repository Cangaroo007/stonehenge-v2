'use client';

import { formatCurrency } from '@/lib/utils';
import { useUnits } from '@/lib/contexts/UnitContext';
import { formatDimensions } from '@/lib/utils/units';

interface PieceBreakdownItem {
  label: string;
  quantity: number;
  unit: string;
  rate: number;
  base: number;
  discount: number;
  total: number;
}

interface PieceBreakdownProps {
  index: number;
  piece: {
    name: string;
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };
  items: PieceBreakdownItem[];
  subtotal: number;
}

export default function PieceBreakdownDisplay({
  index,
  piece,
  items,
  subtotal,
}: PieceBreakdownProps) {
  const { unitSystem } = useUnits();

  return (
    <div className="mb-4 pb-4 border-b border-gray-200 last:border-b-0">
      <div className="font-semibold text-sm text-gray-900 mb-2">
        {index}. {piece.name} ({formatDimensions(piece.lengthMm, piece.widthMm, piece.thicknessMm, unitSystem)})
      </div>
      <div className="ml-4 space-y-2 text-sm">
        {items.map((item, idx) => (
          <div key={idx} className="space-y-1">
            <div className="flex justify-between text-gray-700">
              <span className="font-medium">
                {item.label}: {item.quantity.toFixed(1)} {item.unit} × {formatCurrency(item.rate)}
              </span>
              <span className="text-gray-600">Base: {formatCurrency(item.base)}</span>
            </div>
            {item.discount > 0 && (
              <div className="flex justify-end text-green-600 text-xs">
                <span>Disc: -{formatCurrency(item.discount)} ({((item.discount / item.base) * 100).toFixed(0)}%)</span>
              </div>
            )}
            <div className="flex justify-end text-gray-900 font-medium">
              <span>Total: {formatCurrency(item.total)}</span>
            </div>
          </div>
        ))}
        <div className="flex justify-between font-semibold text-gray-900 pt-2 mt-2 border-t border-gray-200">
          <span>PIECE SUBTOTAL:</span>
          <span>{formatCurrency(subtotal)}</span>
        </div>
      </div>
    </div>
  );
}
