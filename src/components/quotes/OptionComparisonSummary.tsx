'use client';

import { formatCurrency } from '@/lib/utils';
import type { QuoteOption } from '@/hooks/useQuoteOptions';

interface OptionComparisonSummaryProps {
  options: QuoteOption[];
}

export default function OptionComparisonSummary({
  options,
}: OptionComparisonSummaryProps) {
  if (options.length < 2) return null;

  const baseOption = options.find(o => o.isBase);
  const baseTotal = baseOption?.total ? Number(baseOption.total) : 0;

  return (
    <div className="card">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700">Option Comparison</h3>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left px-4 py-2 text-gray-500 font-medium"></th>
              {options.map(option => (
                <th
                  key={option.id}
                  className="text-right px-4 py-2 font-semibold text-gray-700 min-w-[120px]"
                >
                  <div className="flex items-center justify-end gap-1">
                    {option.isBase && (
                      <span className="inline-block w-2 h-2 rounded-full bg-primary-500 flex-shrink-0" />
                    )}
                    {option.name}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Subtotal row */}
            <tr className="border-b border-gray-100">
              <td className="px-4 py-2 text-gray-600">Subtotal (ex GST)</td>
              {options.map(option => {
                const subtotal = option.subtotal ? Number(option.subtotal) : 0;
                return (
                  <td key={option.id} className="text-right px-4 py-2 tabular-nums font-medium">
                    {subtotal > 0 ? formatCurrency(subtotal) : '-'}
                  </td>
                );
              })}
            </tr>

            {/* GST row */}
            <tr className="border-b border-gray-100">
              <td className="px-4 py-2 text-gray-600">GST (10%)</td>
              {options.map(option => {
                const gst = option.gstAmount ? Number(option.gstAmount) : 0;
                return (
                  <td key={option.id} className="text-right px-4 py-2 tabular-nums text-gray-500">
                    {gst > 0 ? formatCurrency(gst) : '-'}
                  </td>
                );
              })}
            </tr>

            {/* Total row */}
            <tr className="border-b border-gray-200 bg-gray-50">
              <td className="px-4 py-2 font-semibold text-gray-700">Total (inc GST)</td>
              {options.map(option => {
                const total = option.total ? Number(option.total) : 0;
                return (
                  <td key={option.id} className="text-right px-4 py-2 tabular-nums font-bold text-gray-900">
                    {total > 0 ? formatCurrency(total) : '-'}
                  </td>
                );
              })}
            </tr>

            {/* Savings vs base row */}
            {baseOption && (
              <tr>
                <td className="px-4 py-2 text-gray-500 text-xs">vs {baseOption.name}</td>
                {options.map(option => {
                  if (option.isBase) {
                    return (
                      <td key={option.id} className="text-right px-4 py-2 text-gray-400 text-xs">
                        -
                      </td>
                    );
                  }
                  const total = option.total ? Number(option.total) : 0;
                  const diff = total - baseTotal;
                  const pct = baseTotal > 0 ? Math.round((Math.abs(diff) / baseTotal) * 100) : 0;

                  if (diff === 0 || total === 0) {
                    return (
                      <td key={option.id} className="text-right px-4 py-2 text-gray-400 text-xs">
                        -
                      </td>
                    );
                  }

                  return (
                    <td
                      key={option.id}
                      className={`text-right px-4 py-2 text-xs font-medium ${
                        diff < 0 ? 'text-green-600' : 'text-red-500'
                      }`}
                    >
                      {diff < 0 ? '-' : '+'}{formatCurrency(Math.abs(diff))} ({pct}%)
                    </td>
                  );
                })}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
