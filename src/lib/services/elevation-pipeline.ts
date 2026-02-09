import {
  ElevationAnalysis,
  SlabFitConfig,
  SlabFitResult,
} from '@/lib/types/drawing-analysis';
import { SLAB_SIZES } from '@/lib/constants/slab-sizes';
import { calculateElevationDeductions } from './cutout-deductor';
import { elevationToOptimizerInput } from './analysis-to-optimizer-adapter';
import { optimizeSlabs } from './slab-optimizer';

/**
 * Run the full elevation-to-pricing pipeline.
 *
 * 1. Calculate deductions (net areas, cutting perimeters)
 * 2. Transform faces into optimizer pieces (using GROSS dimensions)
 * 3. Run the slab optimizer
 * 4. Package results for pricing
 */
export function runElevationPipeline(
  analysis: ElevationAnalysis,
  config: SlabFitConfig
): SlabFitResult {
  // Step 1: Calculate deductions
  const deductions = calculateElevationDeductions(analysis);

  // Step 2: Transform to optimizer input
  const { pieces, optimizerInput } = elevationToOptimizerInput(
    analysis,
    deductions,
    config
  );

  // Step 3: Run the existing slab optimizer
  const optimizerResult = optimizeSlabs(optimizerInput);

  // Step 4: Package result for pricing
  return {
    pieces,
    optimizerResult: {
      placements: optimizerResult.placements.map((p) => ({
        pieceId: p.pieceId,
        slabIndex: p.slabIndex,
        x: p.x,
        y: p.y,
        width: p.width,
        height: p.height,
        rotated: p.rotated,
        label: p.label,
      })),
      slabs: optimizerResult.slabs.map((s) => ({
        slabIndex: s.slabIndex,
        width: s.width,
        height: s.height,
        usedArea: s.usedArea,
        wasteArea: s.wasteArea,
        wastePercent: s.wastePercent,
      })),
      totalSlabs: optimizerResult.totalSlabs,
      totalUsedArea: optimizerResult.totalUsedArea,
      totalWasteArea: optimizerResult.totalWasteArea,
      wastePercent: optimizerResult.wastePercent,
      unplacedPieces: optimizerResult.unplacedPieces,
    },
    slabCount: optimizerResult.totalSlabs,
    totalWastePercent: optimizerResult.wastePercent,
    unplacedPieces: optimizerResult.unplacedPieces,
    totalNetArea_sqm: deductions.totalNetArea_sqm,
    totalCuttingPerimeter_Lm: deductions.totalCuttingPerimeter_Lm,
  };
}

/**
 * Get default slab config for a material category.
 * Uses the existing SLAB_SIZES constants.
 */
export function getDefaultSlabConfig(
  materialCategory: string,
  thickness: number = 20
): SlabFitConfig {
  const size = SLAB_SIZES[materialCategory] ?? SLAB_SIZES.ENGINEERED_QUARTZ_JUMBO;

  return {
    materialCategory,
    slabWidth: size.lengthMm,
    slabHeight: size.widthMm,
    kerfWidth: 8,
    allowRotation: true,
    thickness,
  };
}
