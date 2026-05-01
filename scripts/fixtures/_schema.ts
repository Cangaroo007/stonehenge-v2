/**
 * RegressionFixture — drives one regression check against a quote already
 * present in the database (Design B).
 *
 * Lifecycle: harness reads fixture → loads quote by quoteNumber → runs
 * calculateQuotePrice → compares result.totalIncGst (and optional line items)
 * to `expected` → emits a delta report row. No DB writes.
 */
export interface RegressionFixture {
  meta: {
    fixtureId: string;            // e.g. "ncs-q23111"
    sourceQuoteNumber: string;    // Northcoast's number, e.g. "Q23111"
    customerName: string;         // e.g. "Hudson Kitchen Solutions"
    endClient?: string;           // e.g. "Alison Law"
    jobAddress?: string;
    corpusPath: string;           // path under ~/Downloads/Stonehenge-Quote-Test-Corpus
    notes?: string;
  };

  // The quote ALREADY EXISTS in the Stonehenge V2 database.
  // Identified by quoteNumber (e.g. "Q-00005") OR id (numeric).
  // Exactly one must be set.
  target: {
    quoteNumber?: string;
    quoteId?: number;
  };

  /**
   * What Northcoast actually quoted, as extracted from the issued PDF.
   * Drives delta math.
   *
   * Stonehenge tracks the full subtotal → rules → tax chain explicitly.
   * NCS PDFs often only print the headline total; the lower-level fields
   * are recorded here when present and left null when not.
   *
   * Field semantics (matched against V2's calculation_breakdown):
   *   baseSubtotal       → pre-rules subtotal. Sum of materials + edges +
   *                        cutouts + services + delivery + templating + custom.
   *                        Equals `baseSubtotal` and `subtotal` in V2 breakdown.
   *   rulesDiscount      → total $ discount applied by pricing rules engine.
   *                        Equals `rulesDiscount` in V2 breakdown.
   *                        Positive number; represents an amount subtracted.
   *   subtotalAfterRules → baseSubtotal - rulesDiscount.
   *                        Equals `rulesAdjustedSubtotal` in V2 breakdown.
   *                        This is what GST is calculated on.
   *   gstAmount          → subtotalAfterRules × gstRate.
   *   totalIncGst        → subtotalAfterRules + gstAmount.
   *                        The harness gates PASS/FAIL on this.
   *
   * Internal reconciliation rule (harness will warn, not fail, if violated):
   *   baseSubtotal - rulesDiscount + gstAmount === totalIncGst (within $0.05)
   *
   * NCS PDFs frequently omit baseSubtotal and rulesDiscount — leave them
   * null when not stated. The harness still runs the totalIncGst check.
   */
  expected: {
    baseSubtotal: number | null;
    rulesDiscount: number | null;
    subtotalAfterRules: number;
    gstAmount: number;
    totalIncGst: number;

    materials?: { total: number; totalAreaM2?: number };
    edges?: { total: number; totalLinearMeters?: number };
    cutouts?: { total: number };
    services?: Array<{ serviceType: string; subtotal: number }>;
    delivery?: { finalCost: number };

    /**
     * NCS-implied breakdown — our best estimate of how NCS's bundled total
     * decomposes into materials / cutting / polishing / cutouts / installation /
     * templating / delivery.
     *
     * NOT extracted from the PDF (NCS PDFs bundle everything).
     * DERIVED from:
     *   - drawing dimensions (length × width, edge lengths, cutout counts)
     *   - Beau's rate sheet (Quoting Review thread 2026-01-27):
     *       20mm cut       $17.50/Lm
     *       20mm polish    $45.00/Lm
     *       40mm cut       $45.00/Lm
     *       40mm polish    $115.00/Lm
     *       standard cutout $65.00 each (hotplate, GPO, tap hole)
     *       undermount sink $300.00 each
     *   - Alpha Surfaces catalog (North Coast Stone Mar26) for stone $/slab
     *   - V2's hardcoded delivery + templating model (mirrors what V2 calculates):
     *       Company HQ: 20 Hitech Drive, KUNDA PARK QLD 4556 (or env COMPANY_ADDRESS)
     *       Local zone   (0–30 km):   $50  base + $2.50/km
     *       Regional zone (31–100 km): $75  base + $3.00/km
     *       Remote zone  (101–500 km): $100 base + $3.50/km
     *       Templating: $150 base + $2.00/km (only when templatingRequired = true)
     *
     * Authority: this is OUR estimate; NOT NCS-authoritative. Where rates are
     * not in evidence, leave the field null rather than fabricating. The harness
     * does NOT gate PASS/FAIL on these fields — they are reference data for Jay.
     *
     * The harness reports per-component deltas where both sides are populated.
     */
    ncsImpliedBreakdown?: {
      materials?: { total: number; rateProvenance: string };
      cutting?: { total: number; totalLm: number; rateProvenance: string };
      polishing?: { total: number; totalLm: number; rateProvenance: string };
      cutouts?: { total: number; itemCount: number; rateProvenance: string };
      installation?: { total: number; rateProvenance: string };
      templating?: { total: number; required: boolean; distanceKm: number; rateProvenance: string };
      delivery?: { total: number; zoneName: string; distanceKm: number; rateProvenance: string };
    };

    tolerance?: {
      absoluteDollars?: number;   // default 1.00
      percentOfTotal?: number;    // default 0.005 (0.5%)
    };
  };
}

export interface DeltaReportRow {
  fixtureId: string;
  sourceQuoteNumber: string;

  // Headline totals (PASS/FAIL gates on totalIncGst only)
  ncsTotalIncGst: number;
  v2TotalIncGst: number;
  deltaDollars: number;          // v2 - ncs
  deltaPercent: number;          // (v2 - ncs) / ncs
  withinTolerance: boolean;

  // Subtotal → rules → tax chain (NCS values may be null when PDF omits them)
  ncsBaseSubtotal: number | null;
  ncsRulesDiscount: number | null;
  ncsSubtotalAfterRules: number;
  v2BaseSubtotal: number;
  v2RulesDiscount: number;
  v2SubtotalAfterRules: number;

  lineItemDeltas?: Record<string, { ncs: number; v2: number; delta: number }>;

  // Implied per-component deltas — INFORMATIONAL ONLY, do not affect PASS/FAIL.
  // Populated when fixture.expected.ncsImpliedBreakdown is set.
  impliedComponentDeltas?: Array<{
    component: string;
    ncsImplied: number;
    v2: number | null;
    delta: number | null;
    rateProvenance: string;
  }>;

  errors: string[];              // any runtime issues (missing quote, calc failure, reconciliation warning)
}
