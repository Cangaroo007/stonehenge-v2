export type UnitSystem = 'METRIC' | 'IMPERIAL';

// Conversion constants
const MM_PER_INCH = 25.4;
const MM_PER_FOOT = 304.8;
const SQ_MM_PER_SQ_FOOT = 92903.04;
const SQ_MM_PER_SQ_METRE = 1000000;

/**
 * Format a length in mm for display in the user's preferred unit system.
 * Metric: displays as mm for values < 1000, metres for >= 1000
 * Imperial: displays as feet and inches
 */
export function formatLength(mm: number, system: UnitSystem): string {
  if (system === 'IMPERIAL') {
    const totalInches = mm / MM_PER_INCH;
    const feet = Math.floor(totalInches / 12);
    const inches = totalInches % 12;

    if (feet === 0) {
      return `${inches.toFixed(1)}″`;
    }
    if (inches < 0.05) {
      return `${feet}′`;
    }
    return `${feet}′ ${inches.toFixed(1)}″`;
  }

  // Metric
  if (mm >= 1000) {
    const metres = mm / 1000;
    return `${metres.toFixed(metres % 1 === 0 ? 0 : 2)} m`;
  }
  return `${Math.round(mm)} mm`;
}

/**
 * Format a length in mm as a lineal measurement.
 * Metric: lineal metres
 * Imperial: lineal feet
 */
export function formatLinealLength(mm: number, system: UnitSystem): string {
  if (system === 'IMPERIAL') {
    const feet = mm / MM_PER_FOOT;
    return `${feet.toFixed(2)} lin. ft`;
  }

  const metres = mm / 1000;
  return `${metres.toFixed(2)} lin. m`;
}

/**
 * Format an area in square mm for display.
 * Metric: square metres (m²)
 * Imperial: square feet (ft²)
 */
export function formatArea(sqMm: number, system: UnitSystem): string {
  if (system === 'IMPERIAL') {
    const sqFt = sqMm / SQ_MM_PER_SQ_FOOT;
    return `${sqFt.toFixed(2)} ft²`;
  }

  const sqM = sqMm / SQ_MM_PER_SQ_METRE;
  return `${sqM.toFixed(2)} m²`;
}

/**
 * Format an area already in m² for display.
 * Metric: square metres (m²)
 * Imperial: square feet (ft²)
 */
export function formatAreaFromSqm(sqm: number, system: UnitSystem): string {
  if (system === 'IMPERIAL') {
    const sqFt = sqm * (SQ_MM_PER_SQ_METRE / SQ_MM_PER_SQ_FOOT);
    return `${sqFt.toFixed(2)} ft²`;
  }

  return `${sqm.toFixed(2)} m²`;
}

/**
 * Get a unit label for pricing display.
 * Uses Australian spelling (metre, not meter).
 */
export function getUnitLabel(
  unit: 'mm' | 'metre' | 'lineal_metre' | 'square_metre',
  system: UnitSystem
): string {
  if (system === 'IMPERIAL') {
    switch (unit) {
      case 'mm':
        return 'inches';
      case 'metre':
        return 'feet';
      case 'lineal_metre':
        return 'per lineal foot';
      case 'square_metre':
        return 'per square foot';
      default:
        return unit;
    }
  }

  // Metric - Australian spelling
  switch (unit) {
    case 'mm':
      return 'millimetres';
    case 'metre':
      return 'metres';
    case 'lineal_metre':
      return 'per lineal metre';
    case 'square_metre':
      return 'per square metre';
    default:
      return unit;
  }
}

/**
 * Parse a user-entered value back to mm based on the unit system.
 * Metric input is assumed to be in mm.
 * Imperial input is assumed to be in inches.
 */
export function parseToMm(value: number, system: UnitSystem): number {
  if (system === 'IMPERIAL') {
    return value * MM_PER_INCH;
  }
  return value;
}

/**
 * Convert mm to the display unit value (without formatting).
 * Metric: returns mm
 * Imperial: returns inches
 */
export function mmToDisplayUnit(mm: number, system: UnitSystem): number {
  if (system === 'IMPERIAL') {
    return mm / MM_PER_INCH;
  }
  return mm;
}

/**
 * Convert display unit value back to mm.
 * Metric: input is mm, returns as-is
 * Imperial: input is inches, converts to mm
 */
export function displayUnitToMm(value: number, system: UnitSystem): number {
  if (system === 'IMPERIAL') {
    return value * MM_PER_INCH;
  }
  return value;
}

/**
 * Get the short unit suffix for dimension inputs.
 */
export function getDimensionUnitLabel(system: UnitSystem): string {
  return system === 'IMPERIAL' ? 'in' : 'mm';
}

/**
 * Format raw dimension values (lengthMm x widthMm x thicknessMm) for display.
 */
export function formatDimensions(
  lengthMm: number,
  widthMm: number,
  thicknessMm: number,
  system: UnitSystem
): string {
  if (system === 'IMPERIAL') {
    const l = (lengthMm / MM_PER_INCH).toFixed(1);
    const w = (widthMm / MM_PER_INCH).toFixed(1);
    const t = (thicknessMm / MM_PER_INCH).toFixed(1);
    return `${l} x ${w} x ${t}″`;
  }

  return `${lengthMm} x ${widthMm} x ${thicknessMm}mm`;
}
