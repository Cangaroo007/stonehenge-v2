"use client";

// apps/web/src/hooks/useQuote.ts
//
// Live quote computation. The hook is a thin memoised wrapper around the
// pure `computeQuote` helper, which is exported for unit testing
// (Phase 2A audit §7.1 — the test exercises `computeQuote` directly).
//
// Round 3B (UNCERTAIN-3B-6 [B]): the optional `job` / `buildUpRates` /
// `joinRates` plumbing reaches the calculator only when supplied — the
// Phase 1 single-piece path stays bit-for-bit identical so the existing
// `useQuote` test keeps passing.
//
// Round 8A (FIX 1.5, Gate 0 UNCERTAIN-2 [A]): cutout edge profiling line
// items are composed HERE — not in `packages/pricing` — because the
// pricing package is out of scope for this round. When `fixtureMetadata`
// is supplied AND at least one feature carries a non-raw
// `cutoutEdgeProfile`, we append `QuoteLineItem`s for the cutout
// perimeter at the catalogue edge-profile rate, then re-derive
// subtotal/markup/GST/total using the same `HALF_UP @ 2dp` rules the
// calculator uses (`packages/pricing/src/calculator.ts:114–132`). When
// `fixtureMetadata` is absent (the existing tests' call shape), behaviour
// is bit-identical to the prior implementation.

import { useMemo } from "react";

import { Decimal } from "decimal.js";

import { calculateQuote } from "@stonehenge-proto/pricing";
import type {
  BuildUpRate,
  EdgeProfileRate,
  FeatureRate,
  JoinRate,
  MaterialRate,
  QuoteLineItem,
  QuoteSummary,
} from "@stonehenge-proto/pricing";
import type { Feature, FeatureId, Job, Piece } from "@stonehenge-proto/geometry";

import buildUpRatesCatalogue from "../data/buildup-rates.json";
import edgeProfilesCatalogue from "../data/edge-profiles.json";
import featuresCatalogue from "../data/features.json";
import joinRatesCatalogue from "../data/join-rates.json";
import materialsCatalogue from "../data/materials.json";

import { PROFILE_LABEL } from "../lib/colour-map";
import { cutoutPerimeterMm } from "../lib/fixture-to-feature";
import type { FixtureMetadata } from "../types/editor";

const DEFAULT_MARKUP_PERCENT = "15";

const MATERIALS = materialsCatalogue as readonly MaterialRate[];
const EDGE_PROFILES = edgeProfilesCatalogue as readonly EdgeProfileRate[];
const FEATURES = featuresCatalogue as readonly FeatureRate[];
const BUILD_UP_RATES = buildUpRatesCatalogue as readonly BuildUpRate[];
const JOIN_RATES = joinRatesCatalogue as readonly JoinRate[];

// Round 8A — local copies of the calculator's rounding constants. Kept in
// sync with `packages/pricing/src/calculator.ts` (out of scope this round)
// so the cutout-profiling subtotal/markup/GST/total re-derivation matches
// to the cent. If those constants drift, the existing `useQuote.test.ts`
// rounding-identity test fails first, surfacing the divergence.
const ZERO = new Decimal("0");
const HUNDRED = new Decimal("100");
const GST_RATE = new Decimal("0.10");
const ROUND = Decimal.ROUND_HALF_UP;
const CENTS = 2;

// ─────────────────────────────────────────────────────────────────────────
// Pure helper — exported so tests can drive it without React.
// ─────────────────────────────────────────────────────────────────────────

export interface ComputeQuoteOptions {
  readonly markupPercent?: string;
  readonly materials?: readonly MaterialRate[];
  readonly edgeRates?: readonly EdgeProfileRate[];
  readonly featureRates?: readonly FeatureRate[];
  /** Round 3B — supply the Job to enable build-up + join pricing. */
  readonly job?: Job;
  readonly buildUpRates?: readonly BuildUpRate[];
  readonly joinRates?: readonly JoinRate[];
  /**
   * Round 8A (FIX 1.5) — per-feature catalogue/fixture metadata. When
   * supplied AND any feature has `cutoutEdgeProfile` set to a non-"raw"
   * profile, the quote gains a "Cutout profiling — {profile}" line item
   * per such feature. Absent metadata or "raw" profile = no extra line.
   *
   * When omitted, the function is bit-identical to its Round 3B shape —
   * the 356-test baseline (which doesn't thread fixture metadata) stays
   * green.
   */
  readonly fixtureMetadata?: ReadonlyMap<FeatureId, FixtureMetadata>;
}

/**
 * Computes a `QuoteSummary` for a given piece. Resolves the material rate
 * by `piece.materialId`; throws if the catalogue has no matching entry.
 */
export function computeQuote(
  piece: Piece,
  options: ComputeQuoteOptions = {},
): QuoteSummary {
  const materials = options.materials ?? MATERIALS;
  const edgeRates = options.edgeRates ?? EDGE_PROFILES;
  const featureRates = options.featureRates ?? FEATURES;
  const markupPercent = options.markupPercent ?? DEFAULT_MARKUP_PERCENT;

  const materialRate = materials.find((m) => m.materialId === piece.materialId);
  if (!materialRate) {
    throw new Error(
      `computeQuote: no material rate for piece.materialId "${piece.materialId}"`,
    );
  }

  // Round 3B: only thread the optional fields when the caller supplies a
  // Job. The Phase 1 worked-example snapshot path stays untouched.
  const baseSummary: QuoteSummary =
    options.job !== undefined
      ? calculateQuote({
          piece,
          materialRate,
          edgeRates,
          featureRates,
          markupPercent,
          job: options.job,
          buildUpRates: options.buildUpRates ?? BUILD_UP_RATES,
          joinRates: options.joinRates ?? JOIN_RATES,
        })
      : calculateQuote({
          piece,
          materialRate,
          edgeRates,
          featureRates,
          markupPercent,
        });

  // Round 8A (FIX 1.5) — append cutout-profiling line items when metadata
  // names a non-raw cutout edge profile on at least one feature.
  if (!options.fixtureMetadata || options.fixtureMetadata.size === 0) {
    return baseSummary;
  }
  const cutoutLines = computeCutoutProfilingLines(
    piece,
    options.fixtureMetadata,
    edgeRates,
  );
  if (cutoutLines.length === 0) return baseSummary;
  return rebuildSummaryWithExtras(baseSummary, cutoutLines, markupPercent);
}

// ─────────────────────────────────────────────────────────────────────────
// Round 8A internals — cutout profiling
// ─────────────────────────────────────────────────────────────────────────

/**
 * Walk `piece.features`; for each feature whose fixture metadata names a
 * non-"raw" cutoutEdgeProfile, emit one `QuoteLineItem` for the cutout
 * perimeter at the catalogue rate.
 *
 * Perimeter helper lives in `fixture-to-feature.ts` (`cutoutPerimeterMm`)
 * so the test suite can exercise it directly.
 */
function computeCutoutProfilingLines(
  piece: Piece,
  fixtureMetadata: ReadonlyMap<FeatureId, FixtureMetadata>,
  edgeRates: readonly EdgeProfileRate[],
): readonly QuoteLineItem[] {
  const lines: QuoteLineItem[] = [];
  for (const feature of piece.features) {
    const meta = fixtureMetadata.get(feature.id);
    if (!meta) continue;
    const profile = meta.cutoutEdgeProfile;
    if (!profile || profile === "raw") continue;
    const rate = edgeRates.find((r) => r.profile === profile);
    if (!rate) continue;
    const perimeterMm = cutoutPerimeterMm(feature);
    if (perimeterMm <= 0) continue;
    // Lineal metres = mm / 1000. Construct from strings per the money rule.
    const perimeterLm = new Decimal(perimeterMm.toString()).dividedBy("1000");
    const unitRate = new Decimal(rate.ratePerLinealMetre);
    const lineTotal = perimeterLm.times(unitRate);
    lines.push({
      description: `Cutout profiling — ${PROFILE_LABEL[profile]}`,
      quantity: perimeterLm,
      unit: "lm",
      unitRate,
      lineTotal,
    });
  }
  return lines;
}

/**
 * Rebuild a `QuoteSummary` after appending extra line items. Re-derives
 * subtotal/markup/GST/total using the same `HALF_UP @ 2dp` rounding the
 * pricing calculator uses, so the totals match to the cent regardless of
 * whether the cutout-profiling work lives here or (in a future round) in
 * `packages/pricing/src/calculator.ts`.
 */
function rebuildSummaryWithExtras(
  base: QuoteSummary,
  extras: readonly QuoteLineItem[],
  markupPercent: string,
): QuoteSummary {
  const lineItems: QuoteLineItem[] = [...base.lineItems, ...extras];
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

// ─────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────

/**
 * Returns the live quote for a piece. Memoises on `piece` reference — the
 * `usePiece` reducer returns a new piece object on every commit, so the
 * memo invalidates exactly when geometry, material, or features change.
 */
export function useQuote(
  piece: Piece,
  options: ComputeQuoteOptions = {},
): QuoteSummary {
  const markup = options.markupPercent ?? DEFAULT_MARKUP_PERCENT;
  const job = options.job;
  const fixtureMetadata = options.fixtureMetadata;
  return useMemo(
    () => computeQuote(piece, { ...options, markupPercent: markup }),
    // The catalogue arrays are module-level constants and never change at
    // runtime; depending on `piece`, `markup`, `job`, and `fixtureMetadata`
    // is sufficient. The Map reference changes whenever usePiece commits
    // a snapshot, so this picks up cutout-profile changes correctly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [piece, markup, job, fixtureMetadata],
  );
}

// Re-exports for convenience.
export { MATERIALS, EDGE_PROFILES, FEATURES, BUILD_UP_RATES, JOIN_RATES };

// Convenience export for tests that want to drive `computeCutoutProfilingLines`
// directly without going through `computeQuote`. The function itself stays
// module-private so call sites continue to flow through the orchestrator.
export type { Feature };
