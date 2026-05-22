// packages/pricing/src/types.ts
//
// Money types and rate-table interfaces. All money fields are `Decimal`
// (decimal.js); never `number`. Rate-table inputs accept `string` literals so
// the JSON catalogue under `data/` can be loaded directly without losing
// precision through Number coercion.

import type { Decimal } from "decimal.js";

import type {
  EdgeProfile,
  FeatureKind,
  JoinKind,
} from "@stonehenge-proto/geometry";

/**
 * Catalogue entry for a stone material. `ratePerM2` is AUD ex-GST as a
 * decimal string (e.g. "450.00"). The pricing pipeline constructs a `Decimal`
 * from this string at the boundary.
 */
export interface MaterialRate {
  readonly materialId: string;
  readonly name: string;
  readonly ratePerM2: string;
  readonly category: string;
}

/**
 * Catalogue entry for an edge profile. `ratePerLinealMetre` is AUD ex-GST as
 * a decimal string.
 */
export interface EdgeProfileRate {
  readonly profile: EdgeProfile;
  readonly ratePerLinealMetre: string;
  readonly description: string;
}

/**
 * Catalogue entry for a feature (sink, tap hole, etc.). `flatRate` is AUD
 * ex-GST per instance, as a decimal string.
 */
export interface FeatureRate {
  readonly featureKind: FeatureKind;
  readonly flatRate: string;
  readonly description: string;
}

/**
 * Round 3B — catalogue entry for a build-up strip (Fascia/Return/Infill).
 * Rate is AUD ex-GST per lineal metre, as a decimal string. Keyed on
 * `(partRole, thicknessMm)` so a 40 mm fascia and a 60 mm fascia carry
 * distinct rates.
 */
export interface BuildUpRate {
  readonly partRole: "FASCIA" | "RETURN" | "INFILL";
  readonly thicknessMm: number;
  readonly ratePerLinealMetre: string;
}

/**
 * Round 3B — catalogue entry for a join. Rate is AUD ex-GST per lineal
 * metre, as a decimal string. Keyed on the JoinKind vocabulary in
 * `@stonehenge-proto/geometry`.
 */
export interface JoinRate {
  readonly joinKind: JoinKind;
  readonly ratePerLinealMetre: string;
}

/**
 * One line in a quote. `quantity`, `unitRate` and `lineTotal` are `Decimal`s.
 * Line totals are computed at full precision; rounding to cents happens only
 * at the summary boundary (see calculator.ts).
 */
export interface QuoteLineItem {
  readonly description: string;
  readonly quantity: Decimal;
  readonly unit: string;
  readonly unitRate: Decimal;
  readonly lineTotal: Decimal;
}

/**
 * Final, rounded quote summary. All money fields are `Decimal`s rounded to
 * two decimal places. The summary is the authoritative shape returned to
 * downstream consumers (UI, API, PDF generators).
 */
export interface QuoteSummary {
  readonly lineItems: readonly QuoteLineItem[];
  readonly subtotal: Decimal;
  readonly markupPercent: Decimal;
  readonly markupAmount: Decimal;
  readonly subtotalAfterMarkup: Decimal;
  readonly gstAmount: Decimal;
  readonly totalIncGst: Decimal;
}
