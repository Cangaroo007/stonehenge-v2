export interface SlabSize {
  lengthMm: number;
  widthMm: number;
  name: string;
}

export const SLAB_SIZES: Record<string, SlabSize> = {
  ENGINEERED_QUARTZ_JUMBO: {
    lengthMm: 3200,
    widthMm: 1600,
    name: 'Engineered Quartz (Jumbo)',
  },
  ENGINEERED_QUARTZ_STANDARD: {
    lengthMm: 3050,
    widthMm: 1440,
    name: 'Engineered Quartz (Standard)',
  },
  NATURAL_STONE: {
    lengthMm: 2800,
    widthMm: 1600,
    name: 'Natural Stone',
  },
  PORCELAIN: {
    lengthMm: 3200,
    widthMm: 1600,
    name: 'Porcelain',
  },
};

// Strip cutting configurations for 40mm lamination
export const STRIP_CONFIGURATIONS = {
  STANDARD: {
    stripWidthMm: 108,
    visibleWidthMm: 60,
    laminationWidthMm: 40,
    kerfLossMm: 8,
  },
  WIDE: {
    stripWidthMm: 348,
    visibleWidthMm: 300,
    laminationWidthMm: 40,
    kerfLossMm: 8,
  },
};

// Join cost per lineal metre
export const JOIN_RATE_PER_METRE = 85;

/**
 * Get slab size based on material category
 */
export function getSlabSize(materialCategory: string): SlabSize {
  // Map common material categories to slab sizes
  const categoryMap: Record<string, string> = {
    'caesarstone': 'ENGINEERED_QUARTZ_JUMBO',
    'silestone': 'ENGINEERED_QUARTZ_JUMBO',
    'essastone': 'ENGINEERED_QUARTZ_STANDARD',
    'smartstone': 'ENGINEERED_QUARTZ_JUMBO',
    'granite': 'NATURAL_STONE',
    'marble': 'NATURAL_STONE',
    'quartzite': 'NATURAL_STONE',
    'porcelain': 'PORCELAIN',
    'dekton': 'PORCELAIN',
    'neolith': 'PORCELAIN',
  };

  const normalised = materialCategory.toLowerCase().replace(/[^a-z]/g, '');
  const slabKey = categoryMap[normalised] || 'ENGINEERED_QUARTZ_JUMBO';

  return SLAB_SIZES[slabKey];
}

/**
 * Map a FabricationCategory enum value to a SLAB_SIZES key.
 */
const FABRICATION_CATEGORY_MAP: Record<string, string> = {
  ENGINEERED: 'ENGINEERED_QUARTZ_JUMBO',
  NATURAL_HARD: 'NATURAL_STONE',
  NATURAL_SOFT: 'NATURAL_STONE',
  NATURAL_PREMIUM: 'NATURAL_STONE',
  SINTERED: 'PORCELAIN',
};

/**
 * Get the default slab length (longer dimension) for a fabrication category.
 * Returns lengthMm from SLAB_SIZES.
 */
export function getDefaultSlabLength(fabricationCategory: string | null | undefined): number | undefined {
  if (!fabricationCategory) return undefined;
  const key = FABRICATION_CATEGORY_MAP[fabricationCategory];
  return key ? SLAB_SIZES[key]?.lengthMm : undefined;
}

/**
 * Get the default slab width (shorter dimension) for a fabrication category.
 * Returns widthMm from SLAB_SIZES.
 */
export function getDefaultSlabWidth(fabricationCategory: string | null | undefined): number | undefined {
  if (!fabricationCategory) return undefined;
  const key = FABRICATION_CATEGORY_MAP[fabricationCategory];
  return key ? SLAB_SIZES[key]?.widthMm : undefined;
}

/**
 * Get max usable dimensions (accounting for edge trim)
 */
export function getMaxUsableDimensions(slabSize: SlabSize, edgeTrimMm: number = 20): {
  maxLength: number;
  maxWidth: number;
} {
  return {
    maxLength: slabSize.lengthMm - (edgeTrimMm * 2),
    maxWidth: slabSize.widthMm - (edgeTrimMm * 2),
  };
}
