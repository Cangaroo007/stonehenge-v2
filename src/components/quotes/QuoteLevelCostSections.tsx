'use client';

import { useState } from 'react';
import { formatCurrency } from '@/lib/utils';
import type { CalculationResult } from '@/lib/types/pricing';

// ── Interfaces ──────────────────────────────────────────────────────────────

interface QuoteLevelCostSectionsProps {
  calculation: CalculationResult;
  mode: 'view' | 'edit';
  /** Editable fields in edit mode */
  onDeliveryAddressChange?: (address: string) => void;
  onTemplatingToggle?: (required: boolean) => void;
}

// ── Chevron Icon ────────────────────────────────────────────────────────────

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      className={`h-3.5 w-3.5 transform transition-transform ${expanded ? 'rotate-90' : ''}`}
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
    >
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
    </svg>
  );
}

// ── Section Row Component ───────────────────────────────────────────────────

interface SectionRowProps {
  label: string;
  total: number;
  children: React.ReactNode;
  /** Whether there is meaningful data to show */
  hasData: boolean;
}

function SectionRow({ label, total, children, hasData }: SectionRowProps) {
  const [expanded, setExpanded] = useState(false);
  const isZero = total === 0;

  return (
    <div className={`rounded-lg border ${isZero ? 'border-gray-100 bg-gray-50/50' : 'border-gray-200 bg-white'}`}>
      <button
        onClick={() => hasData && setExpanded(!expanded)}
        className={`w-full flex items-center gap-3 px-4 py-3 text-sm transition-colors ${hasData ? 'hover:bg-gray-50/50 cursor-pointer' : 'cursor-default'}`}
      >
        {hasData ? (
          <ChevronIcon expanded={expanded} />
        ) : (
          <span className="w-3.5" />
        )}
        <span className={`font-medium ${isZero ? 'text-gray-400' : 'text-gray-900'}`}>{label}</span>
        <span className={`ml-auto font-medium tabular-nums ${isZero ? 'text-gray-400' : 'text-gray-900'}`}>
          {formatCurrency(total)}
        </span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-gray-100 space-y-2 text-xs text-gray-600">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Detail Row ──────────────────────────────────────────────────────────────

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-700 text-right">{value}</span>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────────────

export default function QuoteLevelCostSections({
  calculation,
  mode,
  onDeliveryAddressChange,
  onTemplatingToggle,
}: QuoteLevelCostSectionsProps) {
  const delivery = calculation.breakdown.delivery;
  const templating = calculation.breakdown.templating;

  // Aggregate installation from per-piece breakdowns
  const installationData = aggregateInstallation(calculation);

  const hasDeliveryData = !!(delivery && (delivery.address || delivery.distanceKm || delivery.zone));
  const hasTemplatingData = !!(templating && (templating.required || templating.finalCost > 0));
  const hasInstallationData = installationData.totalCost > 0 || installationData.items.length > 0;

  // If nothing to show at all, return null
  if (!hasDeliveryData && !hasTemplatingData && !hasInstallationData) {
    return null;
  }

  return (
    <div className="space-y-2">
      <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-1">
        Quote-Level Charges
      </h3>

      {/* Delivery */}
      {delivery && (
        <SectionRow
          label="Delivery"
          total={delivery.finalCost}
          hasData={hasDeliveryData}
        >
          {delivery.address && (
            mode === 'edit' && onDeliveryAddressChange ? (
              <div>
                <label className="text-gray-500 text-[11px] block mb-1">Delivery Address</label>
                <input
                  type="text"
                  defaultValue={delivery.address}
                  onBlur={(e) => onDeliveryAddressChange(e.target.value)}
                  className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:ring-1 focus:ring-primary-500 focus:border-primary-500"
                />
              </div>
            ) : (
              <DetailRow label="Address" value={delivery.address} />
            )
          )}
          {delivery.zone && <DetailRow label="Zone" value={delivery.zone} />}
          {delivery.distanceKm != null && (
            <DetailRow label="Distance" value={`${Number(delivery.distanceKm).toFixed(1)} km`} />
          )}
          {delivery.calculatedCost != null && (
            <DetailRow label="Calculated Cost" value={formatCurrency(delivery.calculatedCost)} />
          )}
          {delivery.overrideCost != null && (
            <DetailRow
              label="Override Applied"
              value={<span className="text-amber-600">{formatCurrency(delivery.overrideCost)}</span>}
            />
          )}
          <div className="flex justify-between items-center pt-1 border-t border-gray-100 font-medium text-gray-800">
            <span>Final Delivery Cost</span>
            <span className="tabular-nums">{formatCurrency(delivery.finalCost)}</span>
          </div>
        </SectionRow>
      )}

      {/* Templating */}
      {templating && (
        <SectionRow
          label="Templating"
          total={templating.finalCost}
          hasData={hasTemplatingData}
        >
          {mode === 'edit' && onTemplatingToggle ? (
            <div className="flex items-center gap-2">
              <label className="text-gray-500 text-[11px]">Required:</label>
              <button
                onClick={() => onTemplatingToggle(!templating.required)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium border transition-colors ${
                  templating.required
                    ? 'bg-green-50 border-green-300 text-green-700'
                    : 'bg-gray-50 border-gray-300 text-gray-500'
                }`}
              >
                {templating.required ? 'Yes' : 'No'}
              </button>
            </div>
          ) : (
            <DetailRow label="Required" value={templating.required ? 'Yes' : 'No'} />
          )}
          {templating.distanceKm != null && (
            <DetailRow label="Distance" value={`${Number(templating.distanceKm).toFixed(1)} km`} />
          )}
          {templating.calculatedCost != null && (
            <DetailRow label="Calculated Cost" value={formatCurrency(templating.calculatedCost)} />
          )}
          {templating.overrideCost != null && (
            <DetailRow
              label="Override Applied"
              value={<span className="text-amber-600">{formatCurrency(templating.overrideCost)}</span>}
            />
          )}
          <div className="flex justify-between items-center pt-1 border-t border-gray-100 font-medium text-gray-800">
            <span>Final Templating Cost</span>
            <span className="tabular-nums">{formatCurrency(templating.finalCost)}</span>
          </div>
        </SectionRow>
      )}

      {/* Installation */}
      {hasInstallationData && (
        <SectionRow
          label="Installation"
          total={installationData.totalCost}
          hasData={true}
        >
          <DetailRow
            label="Total Area"
            value={`${installationData.totalArea.toFixed(2)} m\u00B2`}
          />
          {installationData.items.length > 0 && (
            <>
              {installationData.items.map((item, idx) => (
                <DetailRow
                  key={idx}
                  label={item.pieceName}
                  value={`${item.quantity.toFixed(2)} ${item.unit === 'SQUARE_METRE' ? 'm\u00B2' : item.unit === 'LINEAR_METRE' ? 'Lm' : ''} x ${formatCurrency(item.rate)} = ${formatCurrency(item.total)}`}
                />
              ))}
            </>
          )}
          <div className="flex justify-between items-center pt-1 border-t border-gray-100 font-medium text-gray-800">
            <span>Total Installation</span>
            <span className="tabular-nums">{formatCurrency(installationData.totalCost)}</span>
          </div>
        </SectionRow>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

interface InstallationItem {
  pieceName: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
}

interface InstallationAggregate {
  totalCost: number;
  totalArea: number;
  items: InstallationItem[];
}

function aggregateInstallation(calculation: CalculationResult): InstallationAggregate {
  const items: InstallationItem[] = [];
  let totalCost = 0;
  let totalArea = 0;

  const pieces = calculation.breakdown.pieces ?? [];
  for (const piece of pieces) {
    if (piece.fabrication.installation && piece.fabrication.installation.total > 0) {
      const inst = piece.fabrication.installation;
      items.push({
        pieceName: piece.pieceName,
        quantity: inst.quantity,
        unit: inst.unit,
        rate: inst.rate,
        total: inst.total,
      });
      totalCost += inst.total;
      if (inst.unit === 'SQUARE_METRE') {
        totalArea += inst.quantity;
      }
    }
  }

  // Also check services breakdown for installation service
  const services = (calculation.breakdown as Record<string, unknown>).services as
    | { items: Array<{ serviceType: string; quantity: number; unit: string; rate: number; subtotal: number }>; total: number }
    | undefined;

  if (services?.items) {
    for (const svc of services.items) {
      if (svc.serviceType === 'INSTALLATION' && svc.subtotal > 0) {
        // Only add if not already counted from pieces
        if (items.length === 0) {
          items.push({
            pieceName: 'Installation Service',
            quantity: svc.quantity,
            unit: svc.unit,
            rate: svc.rate,
            total: svc.subtotal,
          });
          totalCost += svc.subtotal;
          if (svc.unit === 'SQUARE_METRE') {
            totalArea += svc.quantity;
          }
        }
      }
    }
  }

  return { totalCost, totalArea, items };
}
