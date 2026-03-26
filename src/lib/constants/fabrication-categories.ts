export const FABRICATION_CATEGORIES = [
  { value: 'ENGINEERED', label: 'Zero Silica', shortLabel: 'Zero Silica' },
  { value: 'NATURAL_HARD', label: 'Granite', shortLabel: 'Granite' },
  { value: 'NATURAL_SOFT', label: 'Marble', shortLabel: 'Marble' },
  { value: 'NATURAL_PREMIUM', label: 'Quartzite', shortLabel: 'Quartzite' },
  { value: 'SINTERED', label: 'Porcelain', shortLabel: 'Porcelain' },
] as const;

export const CATEGORY_LABELS: Record<string, string> = {
  ENGINEERED: 'Zero Silica',
  NATURAL_HARD: 'Granite',
  NATURAL_SOFT: 'Marble',
  NATURAL_PREMIUM: 'Quartzite',
  SINTERED: 'Porcelain',
};
