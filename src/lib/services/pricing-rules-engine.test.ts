import { calculateQuote, ruleCutting, ruleCutouts } from './pricing-rules-engine'

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

test('cutting segments can price built-up edges without uprating the whole piece', () => {
  const result = ruleCutting(makePiece({
    cuttingSegments: [
      { lm: 2, effectiveThicknessMm: 40 },
      { lm: 4 },
    ],
  }), BASE_RATES, 'ENGINEERED')

  expect(result.lm).toBeCloseTo(6.0)
  expect(result.cost).toBeCloseTo((2 * 45.00) + (4 * 17.50))
  expect(result.ratePerLm).toBeCloseTo(result.cost / result.lm)
  expect(result.items).toHaveLength(2)
  expect(result.items?.[0].ratePerLm).toBe(45.00)
  expect(result.items?.[1].ratePerLm).toBe(17.50)
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

test('uses each piece fabrication category for labour rates', () => {
  const result = calculateQuote({
    settings: BASE_SETTINGS,
    serviceRates: [
      ...BASE_RATES,
      { serviceType: 'CUTTING', fabricationCategory: 'SINTERED', rate20mm: 100.00, rate40mm: 200.00 },
      { serviceType: 'INSTALLATION', fabricationCategory: 'SINTERED', rate20mm: 300.00, rate40mm: 400.00 },
    ],
    edgeCategoryRates: [],
    cutoutRates: [],
    material: { fabricationCategory: 'ENGINEERED', pricePerSlab: 0 },
    slabCount: 0,
    pieces: [
      makePiece({ id: 'engineered', fabricationCategory: 'ENGINEERED' }),
      makePiece({ id: 'sintered', fabricationCategory: 'SINTERED' }),
    ],
  })

  expect(result.pieces[0].cutting.ratePerLm).toBe(17.50)
  expect(result.pieces[1].cutting.ratePerLm).toBe(100.00)
  expect(result.pieces[0].installation.ratePerSqm).toBe(140.00)
  expect(result.pieces[1].installation.ratePerSqm).toBe(300.00)
})

test('uses edge effective thickness for built-up edge profile rates', () => {
  const result = calculateQuote({
    settings: BASE_SETTINGS,
    serviceRates: BASE_RATES,
    edgeCategoryRates: [
      { edgeTypeId: 1, fabricationCategory: 'ENGINEERED', rate20mm: 40.00, rate40mm: 115.00 },
    ],
    cutoutRates: [],
    material: { fabricationCategory: 'ENGINEERED', pricePerSlab: 0 },
    slabCount: 0,
    pieces: [
      makePiece({
        edges: [
          { position: 'TOP' as const, isFinished: true, edgeTypeId: 1, length_mm: 2000, effectiveThicknessMm: 40 },
          { position: 'BOTTOM' as const, isFinished: true, edgeTypeId: 1, length_mm: 2000 },
        ],
      }),
    ],
  })

  expect(result.pieces[0].edgeProfiles.items[0].rate).toBe(115.00)
  expect(result.pieces[0].edgeProfiles.items[0].effectiveThicknessMm).toBe(40)
  expect(result.pieces[0].edgeProfiles.items[1].rate).toBe(40.00)
  expect(result.pieces[0].edgeProfiles.items[1].effectiveThicknessMm).toBe(20)
})

test('charges every Q23114-style cutout that maps to a priced type', () => {
  const cutouts = ruleCutouts(
    makePiece({
      cutouts: [
        { cutoutType: 'Undermount Sink', quantity: 1 },
        { cutoutType: 'Cooktop Cutout', quantity: 1 },
        { cutoutType: 'Custom Cutout', quantity: 1 },
      ],
    }),
    [
      { cutoutType: 'Undermount Sink', fabricationCategory: 'ENGINEERED', rate: 320 },
      { cutoutType: 'Cooktop Cutout', fabricationCategory: 'ENGINEERED', rate: 65 },
      { cutoutType: 'Custom Cutout', fabricationCategory: 'ENGINEERED', rate: 65 },
    ],
    'ENGINEERED'
  )

  expect(cutouts.items).toHaveLength(3)
  expect(cutouts.items.every(item => item.rate > 0)).toBe(true)
  expect(cutouts.cost).toBe(450)
})

test('throws instead of pricing an unresolved generic cutout at zero', () => {
  expect(() => ruleCutouts(
    makePiece({ cutouts: [{ cutoutType: 'Cutout', quantity: 1 }] }),
    [{ cutoutType: 'Cooktop Cutout', fabricationCategory: 'ENGINEERED', rate: 65 }],
    'ENGINEERED'
  )).toThrow(/No CUTOUT rate configured/)
})
