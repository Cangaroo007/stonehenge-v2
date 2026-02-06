'use client';

import { useUnits } from '@/lib/contexts/UnitContext';
import { formatLength, formatDimensions, formatAreaFromSqm } from '@/lib/utils/units';

interface DimensionDisplayProps {
  mm: number;
  className?: string;
}

/**
 * Displays a single length value formatted according to the active unit system.
 */
export function DimensionDisplay({ mm, className }: DimensionDisplayProps) {
  const { unitSystem } = useUnits();
  return <span className={className}>{formatLength(mm, unitSystem)}</span>;
}

interface DimensionsDisplayProps {
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  className?: string;
}

/**
 * Displays L x W x T dimensions formatted according to the active unit system.
 */
export function DimensionsDisplay({ lengthMm, widthMm, thicknessMm, className }: DimensionsDisplayProps) {
  const { unitSystem } = useUnits();
  return (
    <span className={className}>
      {formatDimensions(lengthMm, widthMm, thicknessMm, unitSystem)}
    </span>
  );
}

interface AreaDisplayProps {
  sqm: number;
  className?: string;
}

/**
 * Displays an area value (already in m²) formatted according to the active unit system.
 */
export function AreaDisplay({ sqm, className }: AreaDisplayProps) {
  const { unitSystem } = useUnits();
  return <span className={className}>{formatAreaFromSqm(sqm, unitSystem)}</span>;
}
