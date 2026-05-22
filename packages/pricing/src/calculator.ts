// packages/pricing/src/calculator.ts
//
// Quote calculator — composes the calc functions, applies markup, adds GST,
// and returns a `QuoteSummary`.
//
// Money rules:
//   * All Decimal values are constructed from strings.
//   * Internal arithmetic (subtotal, markup, GST) runs at full precision.
//   * Subtotal, markupAmount, subtotalAfterMarkup, gstAmount, and totalIncGst
//     are rounded to 2 dp at the summary boundary.
//
// Rounding mode:
//   ROUND_HALF_UP (Australian invoicing convention; e.g. 142.945 → 142.95).
//   The Gate 0 audit §6 worked example reconciles under HALF_UP — see the
//   note in pricing/__tests__/calculator.test.ts.
//
// Round 3B steps (orchestrator only — R-LINT-014: calc functions don't call
// other calc functions):
//   1. Area material
//   2. Edge profiling
//   3. Feature costs
//   4. Build-up strip costs   (NEW — when `job` is supplied)
//   5. Join costs             (NEW — when `job` is supplied)
//   6. Markup + GST
//
// Per UNCERTAIN-3B-6 [A]: `job`, `buildUpRates`, `joinRates` are OPTIONAL.
// When omitted, the calculator behaves exactly as Phase 1 did — the
// worked-example snapshot test stays bit-for-bit identical.

import { Decimal } from "decimal.js";

import { computeAreaM2 } from "@stonehenge-proto/geometry";
import type { Job, Piece } from "@stonehenge-proto/geometry";

import { calcAreaMaterial } from "./functions/area-material.js";
import { calcBuildUpCosts } from "./functions/buildup-costs.js";
import { calcEdgeProfiling } from "./functions/edge-profiling.js";
import { calcFeatureCosts } from "./functions/feature-costs.js";
import { calcJoinCosts } from "./functions/join-costs.js";
import type {
  BuildUpRate,
  EdgeProfileRate,
  FeatureRate,
  JoinRate,
  MaterialRate,
  QuoteLineItem,
  QuoteSummary,
} from "./types.js";

const ZERO = new Decimal("0");
const HUNDRED = new Decimal("100");
const GST_RATE = new Decimal("0.10");
const ROUND = Decimal.ROUND_HALF_UP;
const CENTS = 2;

export interface CalculateQuoteInput {
  readonly piece: Piece;
  readonly materialRate: MaterialRate;
  readonly edgeRates: readonly EdgeProfileRate[];
  readonly featureRates: readonly FeatureRate[];
  /** Markup as a decimal string, e.g. "15" for 15%. */
  readonly markupPercent: string;
  /**
   * Round 3B — optional Job. When supplied, the calculator additionally
   * bills the join lines (one per Job join) and the build-up strip lines
   * (one per child piece whose `parentPieceId === piece.id`).
   *
   * When omitted, the calculator runs the Phase 1 path only — the
   * worked-example snapshot stays identical.
   */
  readonly job?: Job;
  readonly buildUpRates?: readonly BuildUpRate[];
  readonly joinRates?: readonly JoinRate[];
}

export function calculateQuote(input: CalculateQuoteInput): QuoteSummary {
  const {
    piece,
    materialRate,
    edgeRates,
    featureRates,
    markupPercent,
    job,
    buildUpRates,
    joinRates,
  } = input;

  const areaM2 = computeAreaM2(piece.vertices, piece.outerRing, piece.edges, [
    ...piece.innerRings,
  ]);
  const areaLine = calcAreaMaterial(areaM2, materialRate);
  const edgeLines = calcEdgeProfiling(piece, edgeRates);
  const featureLines = calcFeatureCosts(piece, featureRates);

  const lineItems: QuoteLineItem[] = [areaLine, ...edgeLines, ...featureLines];

  // Round 3B — optional multi-piece additions. Each branch is guarded so
  // the Phase 1 single-piece path emits exactly the same line items as
  // before this round landed.
  if (job && buildUpRates) {
    const childPieces = job.pieces.filter(
      (p) => p.parentPieceId === piece.id,
    );
    if (childPieces.length > 0) {
      const buildUpLines = calcBuildUpCosts(piece, childPieces, buildUpRates);
      lineItems.push(...buildUpLines);
    }
  }
  if (job && joinRates && job.joins.length > 0) {
    const joinLines = calcJoinCosts(job.joins, job.pieces, joinRates);
    lineItems.push(...joinLines);
  }

  const subtotalRaw = lineItems.reduce(
    (acc, l) => acc.plus(l.lineTotal),
    ZERO,
  );
  const markupPct = new Decimal(markupPercent);
  const markupAmountRaw = subtotalRaw.times(markupPct).dividedBy(HUNDRED);
  const subtotalAfterMarkupRaw = subtotalRaw.plus(markupAmountRaw);
  const gstAmountRaw = subtotalAfterMarkupRaw.times(GST_RATE);
  const totalIncGstRaw = subtotalAfterMarkupRaw.plus(gstAmountRaw);

  return {
    lineItems,
    subtotal: subtotalRaw.toDecimalPlaces(CENTS, ROUND),
    markupPercent: markupPct,
    markupAmount: markupAmountRaw.toDecimalPlaces(CENTS, ROUND),
    subtotalAfterMarkup: subtotalAfterMarkupRaw.toDecimalPlaces(CENTS, ROUND),
    gstAmount: gstAmountRaw.toDecimalPlaces(CENTS, ROUND),
    totalIncGst: totalIncGstRaw.toDecimalPlaces(CENTS, ROUND),
  };
}
