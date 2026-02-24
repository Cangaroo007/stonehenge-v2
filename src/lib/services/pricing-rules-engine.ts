/**
 * PRICING RULES ENGINE — Stone Henge v2
 *
 * Canonical, locked pricing calculation engine.
 * All formulas traced to Pricing Bible v1.3.
 * See docs/PRICING-ENGINE-AUDIT.md for full audit history.
 *
 * RULES FOR THIS FILE:
 * - No Prisma calls. DB data is pre-fetched and passed as input.
 * - Every rule is a named export function with a Bible citation comment.
 * - This file has a test suite (pricing-rules-engine.test.ts).
 *   Any change that breaks a test is a regression — fix the code, not the test.
 * - pricing-calculator-v2.ts calls this engine and contains zero pricing logic itself.
 */

// ─── Input Types ──────────────────────────────────────────────────────────────

export interface EngineSettings {
  cuttingUnit: 'LINEAL_METRE' | 'SQUARE_METRE'
  polishingUnit: 'LINEAL_METRE' | 'SQUARE_METRE'
  installationUnit: 'SQUARE_METRE' | 'LINEAL_METRE' | 'FIXED'
  gstRate: number                   // from DB — e.g. 0.10 — NEVER hardcode
  materialPricingBasis: 'PER_SLAB' | 'PER_SQUARE_METRE'
  deliveryCost: number
  templatingCost: number
  laminatedMultiplier: number       // default 1.30
  mitredMultiplier: number          // default 1.50
}

export interface EngineServiceRate {
  serviceType: string
  fabricationCategory: string
  rate20mm: number
  rate40mm: number
}

export interface EngineEdgeCategoryRate {
  edgeTypeId: number
  fabricationCategory: string
  rate20mm: number
  rate40mm: number
}

export interface EngineCutoutRate {
  cutoutType: string
  fabricationCategory: string
  rate: number
}

export interface EngineEdge {
  position: 'TOP' | 'BOTTOM' | 'LEFT' | 'RIGHT'
  isFinished: boolean               // false = RAW wall edge — no polishing
  edgeTypeId: number | null         // null = no profile surcharge
  length_mm: number
}

export interface EngineCutout {
  cutoutType: string
  quantity: number
}

export interface EnginePiece {
  id: string
  name: string
  length_mm: number
  width_mm: number
  thickness_mm: number
  isOversize: boolean
  joinLength_Lm?: number
  requiresGrainMatch?: boolean
  laminationMethod?: 'LAMINATED' | 'MITRED' | null
  edges: EngineEdge[]
  cutouts: EngineCutout[]
}

export interface EngineMaterial {
  fabricationCategory: string
  pricePerSlab: number
}

export interface PricingEngineInput {
  settings: EngineSettings
  serviceRates: EngineServiceRate[]
  edgeCategoryRates: EngineEdgeCategoryRate[]
  cutoutRates: EngineCutoutRate[]
  material: EngineMaterial
  slabCount: number
  pieces: EnginePiece[]
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface PiecePricingResult {
  id: string
  name: string
  cutting:        { lm: number; ratePerLm: number; cost: number }
  polishing:      { lm: number; ratePerLm: number; cost: number }
  edgeProfiles:   { lm: number; cost: number; items: Array<{ edgeTypeId: number; lm: number; rate: number; cost: number }> }
  lamination:     { lm: number; rate: number; cost: number } | null
  cutouts:        { cost: number; items: Array<{ type: string; qty: number; rate: number; cost: number }> }
  join:           { lm: number; rate: number; cost: number } | null
  grainSurcharge: { base: number; rate: number; cost: number } | null
  installation:   { area_sqm: number; ratePerSqm: number; cost: number }
  subtotal: number
}

export interface QuotePricingResult {
  pieces: PiecePricingResult[]
  material:              { slabCount: number; pricePerSlab: number; cost: number }
  fabricationSubtotal:   number
  installationSubtotal:  number
  deliveryCost:          number
  templatingCost:        number
  subtotalExGst:         number
  gstRate:               number
  gstAmount:             number
  totalIncGst:           number
}

// ─── Rule Functions ───────────────────────────────────────────────────────────

/**
 * RULE: Cutting — Pricing Bible v1.3 §3
 * Full perimeter × rate. All 4 sides, always.
 * NEVER filtered to finished edges only.
 */
export function ruleCutting(
  piece: EnginePiece,
  rates: EngineServiceRate[],
  category: string
): PiecePricingResult['cutting'] {
  const perimeterLm = 2 * (piece.length_mm + piece.width_mm) / 1000
  const rate = rates.find(r => r.serviceType === 'CUTTING' && r.fabricationCategory === category)
  if (!rate) throw new Error(
    `[PricingEngine] No CUTTING rate configured for category "${category}". ` +
    `Go to Pricing Admin → Service Rates to fix this.`
  )
  const ratePerLm = piece.thickness_mm >= 40 ? rate.rate40mm : rate.rate20mm
  return { lm: perimeterLm, ratePerLm, cost: perimeterLm * ratePerLm }
}

/**
 * RULE: Polishing — Pricing Bible v1.3 §4
 * Finished edges ONLY. NEVER full perimeter.
 * finished_edges_Lm = sum of lengths of edges where isFinished === true
 */
export function rulePolishing(
  piece: EnginePiece,
  rates: EngineServiceRate[],
  category: string
): PiecePricingResult['polishing'] {
  const finishedLm = piece.edges
    .filter(e => e.isFinished)
    .reduce((s, e) => s + e.length_mm / 1000, 0)
  const rate = rates.find(r => r.serviceType === 'POLISHING' && r.fabricationCategory === category)
  if (!rate) throw new Error(
    `[PricingEngine] No POLISHING rate configured for category "${category}". ` +
    `Go to Pricing Admin → Service Rates to fix this.`
  )
  const ratePerLm = piece.thickness_mm >= 40 ? rate.rate40mm : rate.rate20mm
  return { lm: finishedLm, ratePerLm, cost: finishedLm * ratePerLm }
}

/**
 * RULE: Edge Profile Surcharges — Pricing Bible v1.3 §7
 * ADDITIONAL to polishing — not a replacement.
 * Category-aware via edge_type_category_rates.
 * Falls back to $0 if no rate configured (some profiles intentionally free).
 */
export function ruleEdgeProfiles(
  piece: EnginePiece,
  edgeCategoryRates: EngineEdgeCategoryRate[],
  category: string
): PiecePricingResult['edgeProfiles'] {
  const items: PiecePricingResult['edgeProfiles']['items'] = []
  for (const edge of piece.edges.filter(e => e.isFinished && e.edgeTypeId !== null)) {
    const lm = edge.length_mm / 1000
    const catRate = edgeCategoryRates.find(
      r => r.edgeTypeId === edge.edgeTypeId && r.fabricationCategory === category
    )
    const rate = catRate
      ? (piece.thickness_mm >= 40 ? catRate.rate40mm : catRate.rate20mm)
      : 0  // $0 = intentionally free profile (e.g. Arris, Pencil Round)
    items.push({ edgeTypeId: edge.edgeTypeId!, lm, rate, cost: lm * rate })
  }
  return {
    lm: items.reduce((s, i) => s + i.lm, 0),
    cost: items.reduce((s, i) => s + i.cost, 0),
    items,
  }
}

/**
 * RULE: Lamination — Pricing Bible v1.3 §8
 * Only for thickness > 20mm.
 * Rate = polishing_rate_20mm × multiplier (1.30 for LAMINATED, 1.50 for MITRED).
 * Applies to finished edges only (same edges as polishing).
 */
export function ruleLamination(
  piece: EnginePiece,
  rates: EngineServiceRate[],
  settings: EngineSettings,
  category: string
): PiecePricingResult['lamination'] {
  if (piece.thickness_mm <= 20 || !piece.laminationMethod) return null
  const polishRate = rates.find(r => r.serviceType === 'POLISHING' && r.fabricationCategory === category)
  if (!polishRate) return null
  const lm = piece.edges.filter(e => e.isFinished).reduce((s, e) => s + e.length_mm / 1000, 0)
  const multiplier = piece.laminationMethod === 'MITRED'
    ? settings.mitredMultiplier
    : settings.laminatedMultiplier
  const rate = polishRate.rate20mm * multiplier
  return { lm, rate, cost: lm * rate }
}

/**
 * RULE: Cutouts — Pricing Bible v1.3 §9
 * Per-unit fixed pricing. Category-aware.
 */
export function ruleCutouts(
  piece: EnginePiece,
  cutoutRates: EngineCutoutRate[],
  category: string
): PiecePricingResult['cutouts'] {
  const items: PiecePricingResult['cutouts']['items'] = []
  for (const cutout of piece.cutouts) {
    const rateRow = cutoutRates.find(
      r => r.cutoutType === cutout.cutoutType && r.fabricationCategory === category
    )
    const rate = rateRow?.rate ?? 0
    items.push({ type: cutout.cutoutType, qty: cutout.quantity, rate, cost: cutout.quantity * rate })
  }
  return { cost: items.reduce((s, i) => s + i.cost, 0), items }
}

/**
 * RULE: Join Cost — Pricing Bible v1.3 §11
 * Only for oversize pieces. MUST appear as a named line item — never hidden.
 */
export function ruleJoin(
  piece: EnginePiece,
  rates: EngineServiceRate[],
  category: string
): PiecePricingResult['join'] {
  if (!piece.isOversize || !piece.joinLength_Lm) return null
  const rate = rates.find(r => r.serviceType === 'JOIN' && r.fabricationCategory === category)
  if (!rate) throw new Error(
    `[PricingEngine] No JOIN rate configured for category "${category}". ` +
    `Go to Pricing Admin → Service Rates to fix this.`
  )
  const ratePerLm = piece.thickness_mm >= 40 ? rate.rate40mm : rate.rate20mm
  return { lm: piece.joinLength_Lm, rate: ratePerLm, cost: piece.joinLength_Lm * ratePerLm }
}

/**
 * RULE: Grain Matching Surcharge — Pricing Bible v1.3 §11
 * 15% surcharge on fabrication subtotal.
 * ONLY for grain-matched joins — NOT for plain butt-joins.
 */
export function ruleGrainSurcharge(
  piece: EnginePiece,
  fabricationSubtotal: number
): PiecePricingResult['grainSurcharge'] {
  if (!piece.requiresGrainMatch) return null
  return { base: fabricationSubtotal, rate: 0.15, cost: fabricationSubtotal * 0.15 }
}

/**
 * RULE: Installation — Pricing Bible v1.3 §10
 * area_sqm × rate[thickness][fabricationCategory]
 */
export function ruleInstallation(
  piece: EnginePiece,
  rates: EngineServiceRate[],
  category: string
): PiecePricingResult['installation'] {
  const area_sqm = (piece.length_mm * piece.width_mm) / 1_000_000
  const rate = rates.find(r => r.serviceType === 'INSTALLATION' && r.fabricationCategory === category)
  if (!rate) throw new Error(
    `[PricingEngine] No INSTALLATION rate configured for category "${category}". ` +
    `Go to Pricing Admin → Service Rates to fix this.`
  )
  const ratePerSqm = piece.thickness_mm >= 40 ? rate.rate40mm : rate.rate20mm
  return { area_sqm, ratePerSqm, cost: area_sqm * ratePerSqm }
}

// ─── Master Function ──────────────────────────────────────────────────────────

export function calculateQuote(input: PricingEngineInput): QuotePricingResult {
  const category = input.material.fabricationCategory
  const pieceResults: PiecePricingResult[] = []

  for (const piece of input.pieces) {
    const cutting       = ruleCutting(piece, input.serviceRates, category)
    const polishing     = rulePolishing(piece, input.serviceRates, category)
    const edgeProfiles  = ruleEdgeProfiles(piece, input.edgeCategoryRates, category)
    const lamination    = ruleLamination(piece, input.serviceRates, input.settings, category)
    const cutouts       = ruleCutouts(piece, input.cutoutRates, category)
    const join          = ruleJoin(piece, input.serviceRates, category)
    const installation  = ruleInstallation(piece, input.serviceRates, category)

    const fabricationSubtotal =
      cutting.cost + polishing.cost + edgeProfiles.cost +
      (lamination?.cost ?? 0) + cutouts.cost + (join?.cost ?? 0)

    const grainSurcharge = ruleGrainSurcharge(piece, fabricationSubtotal)

    pieceResults.push({
      id: piece.id,
      name: piece.name,
      cutting, polishing, edgeProfiles,
      lamination: lamination ?? null,
      cutouts,
      join: join ?? null,
      grainSurcharge: grainSurcharge ?? null,
      installation,
      subtotal: fabricationSubtotal + (grainSurcharge?.cost ?? 0) + installation.cost,
    })
  }

  const materialCost          = input.slabCount * input.material.pricePerSlab
  const fabricationSubtotal   = pieceResults.reduce((s, p) =>
    s + p.cutting.cost + p.polishing.cost + p.edgeProfiles.cost +
    (p.lamination?.cost ?? 0) + p.cutouts.cost + (p.join?.cost ?? 0) +
    (p.grainSurcharge?.cost ?? 0), 0)
  const installationSubtotal  = pieceResults.reduce((s, p) => s + p.installation.cost, 0)

  const subtotalExGst =
    materialCost + fabricationSubtotal + installationSubtotal +
    input.settings.deliveryCost + input.settings.templatingCost

  // GST — Pricing Bible v1.3 §14 — from DB, NEVER hardcoded
  const gstAmount   = subtotalExGst * input.settings.gstRate
  const totalIncGst = subtotalExGst + gstAmount

  return {
    pieces: pieceResults,
    material: { slabCount: input.slabCount, pricePerSlab: input.material.pricePerSlab, cost: materialCost },
    fabricationSubtotal,
    installationSubtotal,
    deliveryCost:  input.settings.deliveryCost,
    templatingCost: input.settings.templatingCost,
    subtotalExGst,
    gstRate:    input.settings.gstRate,
    gstAmount,
    totalIncGst,
  }
}
