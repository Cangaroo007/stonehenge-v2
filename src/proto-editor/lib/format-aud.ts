// apps/web/src/lib/format-aud.ts
//
// AUD formatting for `Decimal` values. Per Phase 2A audit UNCERTAIN-12 [A]:
// custom helper, never `Number(d)` for display. Decimal.js has no
// `toLocaleString`, so we split on the dot and inject comma thousands
// separators by hand.
//
// All input Decimals are assumed to already be at cents precision (the
// pricing calculator rounds at the summary boundary).

import type { Decimal } from "decimal.js";

const NEGATIVE = "-";

/**
 * Formats a Decimal as `$1,243.00`. Negative values render as `-$1,243.00`.
 * Always two decimal places.
 */
export function formatAud(d: Decimal): string {
  const isNeg = d.isNegative();
  const fixed = d.abs().toFixed(2);
  const dotAt = fixed.indexOf(".");
  const wholePart = dotAt === -1 ? fixed : fixed.slice(0, dotAt);
  const cents = dotAt === -1 ? "00" : fixed.slice(dotAt + 1);
  const withCommas = insertThousandsCommas(wholePart);
  return `${isNeg ? NEGATIVE : ""}$${withCommas}.${cents}`;
}

/**
 * Formats a Decimal as a plain number with thousands separators and the
 * given decimal places. Used for areas (`3.00 m²`) and lineal metres
 * (`5.60 lm`).
 */
export function formatNumber(d: Decimal, decimalPlaces: number): string {
  const fixed = d.toFixed(decimalPlaces);
  const dotAt = fixed.indexOf(".");
  const wholePart = dotAt === -1 ? fixed : fixed.slice(0, dotAt);
  const fraction = dotAt === -1 ? "" : fixed.slice(dotAt);
  return insertThousandsCommas(wholePart) + fraction;
}

function insertThousandsCommas(intStr: string): string {
  // Walk right-to-left inserting a comma every three digits.
  let out = "";
  let count = 0;
  for (let i = intStr.length - 1; i >= 0; i--) {
    out = intStr[i] + out;
    count += 1;
    if (count === 3 && i > 0) {
      out = "," + out;
      count = 0;
    }
  }
  return out;
}
