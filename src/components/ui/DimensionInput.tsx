'use client';

import { useState, useEffect, useCallback } from 'react';
import { useUnits } from '@/lib/contexts/UnitContext';
import { mmToDisplayUnit, parseToMm, getDimensionUnitLabel } from '@/lib/utils/units';

interface DimensionInputProps {
  /** The value in mm (source of truth) */
  valueMm: number;
  /** Called with the new value in mm */
  onChangeMm: (mm: number) => void;
  className?: string;
  min?: number;
  label?: string;
  placeholder?: string;
}

/**
 * Input component that displays values in the user's preferred unit system
 * but stores and emits values in mm.
 *
 * - METRIC: input/output in mm
 * - IMPERIAL: displays inches, converts to/from mm on change
 */
export function DimensionInput({
  valueMm,
  onChangeMm,
  className = 'input',
  min,
  label,
  placeholder,
}: DimensionInputProps) {
  const { unitSystem } = useUnits();
  const unitLabel = getDimensionUnitLabel(unitSystem);

  // Local display value derived from the mm prop
  const [displayValue, setDisplayValue] = useState(() =>
    Math.round(mmToDisplayUnit(valueMm, unitSystem) * 10) / 10
  );

  // Sync display value when valueMm or unitSystem changes externally
  useEffect(() => {
    setDisplayValue(Math.round(mmToDisplayUnit(valueMm, unitSystem) * 10) / 10);
  }, [valueMm, unitSystem]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = Number(e.target.value);
      setDisplayValue(raw);
      const mm = Math.round(parseToMm(raw, unitSystem));
      onChangeMm(mm);
    },
    [unitSystem, onChangeMm]
  );

  return (
    <div>
      {label && <label className="label">{label} ({unitLabel})</label>}
      <div className="relative">
        <input
          type="number"
          className={className}
          value={displayValue}
          onChange={handleChange}
          min={min}
          placeholder={placeholder}
        />
        {!label && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
            {unitLabel}
          </span>
        )}
      </div>
    </div>
  );
}
