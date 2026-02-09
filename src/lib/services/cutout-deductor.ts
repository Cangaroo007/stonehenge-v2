import {
  StoneFace,
  ElevationOpening,
  ElevationAnalysis,
  DeductionResult,
  DeductionWarning,
  OpeningDeduction,
  ElevationDeductionSummary,
} from '@/lib/types/drawing-analysis';

/**
 * Calculate deductions for a single stone face.
 *
 * Net area = gross area - sum of opening areas
 * Total cutting perimeter = outer perimeter + sum of opening perimeters
 *
 * Why opening perimeters matter for cutting:
 * The fabricator must cut the stone to fit around windows, doors, etc.
 * Each opening adds its perimeter to the total cutting length.
 */
export function calculateDeductions(face: StoneFace): DeductionResult {
  const warnings = validateDeductions(face);

  // Gross area in square metres
  const grossArea_sqm =
    (face.grossDimensions.width * face.grossDimensions.height) / 1_000_000;

  // Process each opening
  const openings: OpeningDeduction[] = face.openings.map((opening) =>
    calculateOpeningDeduction(opening)
  );

  // Total deduction
  const totalDeduction_sqm = openings.reduce(
    (sum, o) => sum + o.area_sqm,
    0
  );

  // Net area (cannot be negative)
  const netArea_sqm = Math.max(0, grossArea_sqm - totalDeduction_sqm);

  // Outer perimeter of the stone face (in lineal metres)
  const outerPerimeter_Lm =
    (2 * (face.grossDimensions.width + face.grossDimensions.height)) / 1000;

  // Sum of all opening perimeters (in lineal metres)
  const openingPerimeters_Lm = openings.reduce(
    (sum, o) => sum + o.perimeter_Lm,
    0
  );

  // Total cutting = outer + all openings
  const totalCuttingPerimeter_Lm = outerPerimeter_Lm + openingPerimeters_Lm;

  // Deduction percentage
  const deductionPercentage =
    grossArea_sqm > 0
      ? Math.round((totalDeduction_sqm / grossArea_sqm) * 100 * 10) / 10
      : 0;

  return {
    faceId: face.id,
    faceName: face.name,
    grossDimensions: face.grossDimensions,
    grossArea_sqm: roundTo4(grossArea_sqm),
    openings,
    totalDeduction_sqm: roundTo4(totalDeduction_sqm),
    netArea_sqm: roundTo4(netArea_sqm),
    outerPerimeter_Lm: roundTo3(outerPerimeter_Lm),
    openingPerimeters_Lm: roundTo3(openingPerimeters_Lm),
    totalCuttingPerimeter_Lm: roundTo3(totalCuttingPerimeter_Lm),
    deductionPercentage,
    warnings,
  };
}

/**
 * Calculate area and perimeter for a single opening.
 */
function calculateOpeningDeduction(
  opening: ElevationOpening
): OpeningDeduction {
  const area_sqm =
    (opening.dimensions.width * opening.dimensions.height) / 1_000_000;

  const perimeter_Lm =
    (2 * (opening.dimensions.width + opening.dimensions.height)) / 1000;

  return {
    type: opening.type,
    dimensions: opening.dimensions,
    area_sqm: roundTo4(area_sqm),
    perimeter_Lm: roundTo3(perimeter_Lm),
  };
}

/**
 * Calculate deductions for ALL stone faces in an elevation analysis.
 * Returns individual face results plus aggregated totals.
 */
export function calculateElevationDeductions(
  analysis: ElevationAnalysis
): ElevationDeductionSummary {
  const faceResults = analysis.stoneFaces.map(calculateDeductions);

  const totalGrossArea_sqm = faceResults.reduce(
    (sum, r) => sum + r.grossArea_sqm,
    0
  );
  const totalNetArea_sqm = faceResults.reduce(
    (sum, r) => sum + r.netArea_sqm,
    0
  );
  const totalDeduction_sqm = faceResults.reduce(
    (sum, r) => sum + r.totalDeduction_sqm,
    0
  );
  const totalCuttingPerimeter_Lm = faceResults.reduce(
    (sum, r) => sum + r.totalCuttingPerimeter_Lm,
    0
  );

  const overallDeductionPercentage =
    totalGrossArea_sqm > 0
      ? Math.round(
          (totalDeduction_sqm / totalGrossArea_sqm) * 100 * 10
        ) / 10
      : 0;

  // Aggregate all warnings
  const warnings = faceResults.flatMap((r) => r.warnings);

  return {
    faceResults,
    totalGrossArea_sqm: roundTo4(totalGrossArea_sqm),
    totalNetArea_sqm: roundTo4(totalNetArea_sqm),
    totalDeduction_sqm: roundTo4(totalDeduction_sqm),
    totalCuttingPerimeter_Lm: roundTo3(totalCuttingPerimeter_Lm),
    overallDeductionPercentage,
    warnings,
  };
}

/**
 * Validate openings against the face dimensions.
 * Returns warnings but does not prevent calculation.
 */
export function validateDeductions(face: StoneFace): DeductionWarning[] {
  const warnings: DeductionWarning[] = [];

  for (const opening of face.openings) {
    // Check if opening is wider or taller than the face
    if (
      opening.dimensions.width > face.grossDimensions.width ||
      opening.dimensions.height > face.grossDimensions.height
    ) {
      warnings.push({
        faceId: face.id,
        type: 'OPENING_EXCEEDS_FACE',
        message: `Opening (${opening.type}: ${opening.dimensions.width}×${opening.dimensions.height}mm) exceeds face dimensions (${face.grossDimensions.width}×${face.grossDimensions.height}mm)`,
        severity: 'ERROR',
      });
    }

    // Check for zero or negative dimensions
    if (opening.dimensions.width <= 0 || opening.dimensions.height <= 0) {
      warnings.push({
        faceId: face.id,
        type: 'ZERO_DIMENSION',
        message: `Opening (${opening.type}) has zero or negative dimensions`,
        severity: 'ERROR',
      });
    }
  }

  // Check if total deduction exceeds gross area
  const grossArea =
    (face.grossDimensions.width * face.grossDimensions.height) / 1_000_000;
  const totalOpeningArea = face.openings.reduce(
    (sum, o) =>
      sum + (o.dimensions.width * o.dimensions.height) / 1_000_000,
    0
  );

  if (totalOpeningArea > grossArea) {
    warnings.push({
      faceId: face.id,
      type: 'TOTAL_DEDUCTION_EXCEEDS_GROSS',
      message: `Total opening area (${roundTo4(totalOpeningArea)} m²) exceeds gross face area (${roundTo4(grossArea)} m²). Net area will be clamped to 0.`,
      severity: 'WARNING',
    });
  }

  // Basic overlap check: if sum of opening widths exceeds face width
  // (simplified — full geometric overlap detection is future work)
  const totalOpeningWidth = face.openings.reduce(
    (sum, o) => sum + o.dimensions.width,
    0
  );
  if (totalOpeningWidth > face.grossDimensions.width * 1.5) {
    warnings.push({
      faceId: face.id,
      type: 'OVERLAPPING_OPENINGS',
      message: 'Openings may be overlapping — total opening width exceeds face width. Manual review recommended.',
      severity: 'WARNING',
    });
  }

  return warnings;
}

/**
 * Generate a human-readable summary of deductions.
 * Useful for display in the UI or inclusion in quote notes.
 */
export function formatDeductionSummary(
  summary: ElevationDeductionSummary
): string {
  const lines: string[] = [];

  lines.push('=== Elevation Stone Deduction Summary ===');
  lines.push('');

  for (const result of summary.faceResults) {
    lines.push(`── ${result.faceName} ──`);
    lines.push(
      `  Gross: ${result.grossDimensions.width}mm × ${result.grossDimensions.height}mm = ${result.grossArea_sqm} m²`
    );

    if (result.openings.length > 0) {
      for (const opening of result.openings) {
        lines.push(
          `  Less ${opening.type}: ${opening.dimensions.width}mm × ${opening.dimensions.height}mm = -${opening.area_sqm} m²`
        );
      }
      lines.push(
        `  Deductions: -${result.totalDeduction_sqm} m² (${result.deductionPercentage}%)`
      );
    } else {
      lines.push('  No openings');
    }

    lines.push(`  Net area: ${result.netArea_sqm} m²`);
    lines.push(
      `  Cutting: ${result.totalCuttingPerimeter_Lm} Lm (outer: ${result.outerPerimeter_Lm} + openings: ${result.openingPerimeters_Lm})`
    );
    lines.push('');
  }

  lines.push('── TOTALS ──');
  lines.push(`  Gross area: ${summary.totalGrossArea_sqm} m²`);
  lines.push(`  Total deductions: -${summary.totalDeduction_sqm} m² (${summary.overallDeductionPercentage}%)`);
  lines.push(`  Net area (for material): ${summary.totalNetArea_sqm} m²`);
  lines.push(`  Total cutting perimeter: ${summary.totalCuttingPerimeter_Lm} Lm`);

  return lines.join('\n');
}

// ──── Utility ────

function roundTo3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function roundTo4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
