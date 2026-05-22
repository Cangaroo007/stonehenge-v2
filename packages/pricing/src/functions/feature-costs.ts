// packages/pricing/src/functions/feature-costs.ts
//
// calc.feature.fixed — flat rate per feature instance. One line item per
// feature, since fabrication books each cutout/hole as its own activity.

import { Decimal } from "decimal.js";

import type { Piece } from "@stonehenge-proto/geometry";

import type { FeatureRate, QuoteLineItem } from "../types.js";

export function calcFeatureCosts(
  piece: Piece,
  featureRates: readonly FeatureRate[],
): readonly QuoteLineItem[] {
  const rateByKind = new Map(featureRates.map((r) => [r.featureKind, r]));
  const lines: QuoteLineItem[] = [];
  for (const f of piece.features) {
    const rate = rateByKind.get(f.kind);
    if (!rate) {
      throw new Error(
        `calcFeatureCosts: no rate for feature kind ${f.kind}`,
      );
    }
    const unitRate = new Decimal(rate.flatRate);
    lines.push({
      description: rate.description,
      quantity: new Decimal("1"),
      unit: "ea",
      unitRate,
      lineTotal: unitRate,
    });
  }
  return lines;
}
