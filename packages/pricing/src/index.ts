// packages/pricing/src/index.ts
//
// Public API for @stonehenge-proto/pricing.

export type {
  BuildUpRate,
  EdgeProfileRate,
  FeatureRate,
  JoinRate,
  MaterialRate,
  QuoteLineItem,
  QuoteSummary,
} from "./types.js";

export { calcAreaMaterial } from "./functions/area-material.js";
export { calcEdgeProfiling } from "./functions/edge-profiling.js";
export { calcFeatureCosts } from "./functions/feature-costs.js";
export { calcBuildUpCosts } from "./functions/buildup-costs.js";
export { calcJoinCosts } from "./functions/join-costs.js";

export { calculateQuote } from "./calculator.js";
export type { CalculateQuoteInput } from "./calculator.js";
