import { calculateQuote, ruleCutting } from './pricing-rules-engine'

// ─── Shared Fixtures ─────────────────────────────────────────────────────────

const BASE_SETTINGS = {
  cuttingUnit: 'LINEAL_METRE' as const,
  polishingUnit: 'LINEAL_METRE' as const,
  installationUnit: 'SQUARE_METRE' as const,
  gstRate: 0.10,
  materialPricingBasis: 'PER_SLAB' as const,
  deliveryCost: 0,
  templatingCost: 0,
  laminatedMultiplier: 1.30,
  mitredMultiplier: 1.50,
  curvedCuttingMode: 'FIXED' as const,
  curvedPolishingMode: 'FIXED' as const,
}

const BASE_RATES = [
  { serviceType: 'CUTTING',      fabricationCategory: 'ENGINEERED', rate20mm: 17.50, rate40mm: 45.00 },
  { serviceType: 'POLISHING',    fabricationCategory: 'ENGINEERED', rate20mm: 45.00, rate40mm: 115.00 },
  { serviceType: 'INSTALLATION', fabricationCategory: 'ENGINEERED', rate20mm: 140.00, rate40mm: 170.00 },
  { serviceType: 'JOIN',         fabricationCategory: 'ENGINEERED', rate20mm: 85.00, rate40mm: 120.00 },
]

const makePiece = (overrides = {}) => ({
  id: '1', name: 'Test Benchtop',
  length_mm: 2400, width_mm: 600, thickness_mm: 20,
  isOversize: false, laminationMethod: null as null,
  requiresGrainMatch: false,
  edges: [
    { position: 'TOP' as const,    isFinished: true,  edgeTypeId: null, length_mm: 2400 },
    { position: 'BOTTOM' as const, isFinished: false, edgeTypeId: null, length_mm: 2400 },
    { position: 'LEFT' as const,   isFinished: false, edgeTypeId: null, length_mm: 600 },
    { position: 'RIGHT' as const,  isFinished: false, edgeTypeId: null, length_mm: 600 },
  ],
  cutouts: [],
  ...overrides,
})

// ─── Tests ────────────────────────────────────────────────────────────────────

test('TEST 1 — cutting uses full perimeter, all 4 sides', () => {
  const result = ruleCutting(makePiece(), BASE_RATES, 'ENGINEERED')
  // (2×2400 + 2×600) / 1000 = 6.0 Lm × $17.50 = $105.00
  expect(result.lm).toBeCloseTo(6.0)
  expect(result.cost).toBeCloseTo(105.00)
})

// NOTE: Tests 2 & 3 (polishing) removed — polishing is no longer a concept in StoneHenge.
// Polishing was a misunderstanding; the cost is now covered by edge profile rates.

test('TEST 4 — GST uses settings.gstRate, never hardcoded', () => {
  const result = calculateQuote({
    settings: { ...BASE_SETTINGS, gstRate: 0.15 },
    serviceRates: BASE_RATES, edgeCategoryRates: [], cutoutRates: [],
    material: { fabricationCategory: 'ENGINEERED', pricePerSlab: 0 },
    slabCount: 0, pieces: [],
  })
  expect(result.gstRate).toBe(0.15)
  expect(result.gstAmount).toBeCloseTo(result.subtotalExGst * 0.15)
  expect(result.totalIncGst).toBeCloseTo(result.subtotalExGst * 1.15)
})

test('TEST 5 — oversize piece has explicit named join cost line item', () => {
  const piece = makePiece({ length_mm: 4941, isOversize: true, joinLength_Lm: 0.6 })
  const result = calculateQuote({
    settings: BASE_SETTINGS, serviceRates: BASE_RATES,
    edgeCategoryRates: [], cutoutRates: [],
    material: { fabricationCategory: 'ENGINEERED', pricePerSlab: 0 },
    slabCount: 0, pieces: [piece],
  })
  expect(result.pieces[0].join).not.toBeNull()
  expect(result.pieces[0].join?.lm).toBeCloseTo(0.6)
  expect(result.pieces[0].join?.cost).toBeCloseTo(0.6 * 85.00)  // 0.6 × $85 = $51
})

test('TEST 6 — totalIncGst is greater than subtotalExGst', () => {
  const result = calculateQuote({
    settings: BASE_SETTINGS, serviceRates: BASE_RATES,
    edgeCategoryRates: [], cutoutRates: [],
    material: { fabricationCategory: 'ENGINEERED', pricePerSlab: 1596 },
    slabCount: 1, pieces: [makePiece()],
  })
  expect(result.gstAmount).toBeGreaterThan(0)
  expect(result.totalIncGst).toBeGreaterThan(result.subtotalExGst)
  expect(result.totalIncGst).toBeCloseTo(result.subtotalExGst * 1.10)
})
