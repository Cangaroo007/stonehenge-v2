// packages/pricing/__tests__/calculator.test.ts
//
// The Gate 0 worked-example snapshot. Locks the entire pricing pipeline.
// One-cent divergence fails CI.
//
// Worked example (Gate 0 §6):
//   Area:     3.2m × 0.6m = 1.92 m² × $450/m²       = $864.00
//   Edges:    3 exposed pencil-round, total 4.4 lm × $35/lm = $154.00
//   Features: 1 undermount sink + 1 tap hole         = $225.00
//   Subtotal:                                          $1,243.00
//   Markup 15%: 1243 × 0.15                          =   $186.45
//   After markup:                                      $1,429.45
//   GST 10%:  1429.45 × 0.10 = 142.945  (round HALF_UP) = $142.95
//   Total inc GST:                                      $1,572.40
//
// Note on rounding mode:
// The Gate 0 audit §6 worked example labels the rounding as ROUND_HALF_EVEN,
// but $142.945 reconciles to $142.95 only under ROUND_HALF_UP — under
// HALF_EVEN (banker's rounding) it would land at $142.94. The implementation
// uses ROUND_HALF_UP because that is the only mode that matches the audit's
// expected total ($1,572.40), and HALF_UP is the standard Australian
// invoicing convention. This is flagged in calculator.ts and surfaced to
// Sean in the Gate 0 verification report.

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { calculateQuote } from "../src/index.js";

import {
  CAESARSTONE_5143,
  PROTO_EDGE_RATES,
  PROTO_FEATURE_RATES,
  buildWorkedExamplePiece,
} from "./_fixtures.js";

describe("calculateQuote — Gate 0 worked-example snapshot", () => {
  it("produces the contracted summary to the cent", () => {
    const piece = buildWorkedExamplePiece();
    const summary = calculateQuote({
      piece,
      materialRate: CAESARSTONE_5143,
      edgeRates: PROTO_EDGE_RATES,
      featureRates: PROTO_FEATURE_RATES,
      markupPercent: "15",
    });

    // Subtotal = 864 + 154 + 180 + 45 = 1243
    expect(summary.subtotal.toFixed(2)).toBe("1243.00");

    // Markup
    expect(summary.markupPercent.equals(new Decimal("15"))).toBe(true);
    expect(summary.markupAmount.toFixed(2)).toBe("186.45");
    expect(summary.subtotalAfterMarkup.toFixed(2)).toBe("1429.45");

    // GST and total — the contract.
    expect(summary.gstAmount.toFixed(2)).toBe("142.95");
    expect(summary.totalIncGst.toFixed(2)).toBe("1572.40");
  });

  it("records exactly four line items in the expected order", () => {
    const piece = buildWorkedExamplePiece();
    const summary = calculateQuote({
      piece,
      materialRate: CAESARSTONE_5143,
      edgeRates: PROTO_EDGE_RATES,
      featureRates: PROTO_FEATURE_RATES,
      markupPercent: "15",
    });
    expect(summary.lineItems.length).toBe(4);
    expect(summary.lineItems[0]?.unit).toBe("m²");
    expect(summary.lineItems[1]?.unit).toBe("lm");
    expect(summary.lineItems[2]?.unit).toBe("ea"); // sink
    expect(summary.lineItems[3]?.unit).toBe("ea"); // tap
  });

  it("snapshots the full numeric shape", () => {
    const piece = buildWorkedExamplePiece();
    const summary = calculateQuote({
      piece,
      materialRate: CAESARSTONE_5143,
      edgeRates: PROTO_EDGE_RATES,
      featureRates: PROTO_FEATURE_RATES,
      markupPercent: "15",
    });
    const numeric = {
      lineTotals: summary.lineItems.map((l) => l.lineTotal.toFixed(2)),
      subtotal: summary.subtotal.toFixed(2),
      markupAmount: summary.markupAmount.toFixed(2),
      subtotalAfterMarkup: summary.subtotalAfterMarkup.toFixed(2),
      gstAmount: summary.gstAmount.toFixed(2),
      totalIncGst: summary.totalIncGst.toFixed(2),
    };
    expect(numeric).toMatchInlineSnapshot(`
      {
        "gstAmount": "142.95",
        "lineTotals": [
          "864.00",
          "154.00",
          "180.00",
          "45.00",
        ],
        "markupAmount": "186.45",
        "subtotal": "1243.00",
        "subtotalAfterMarkup": "1429.45",
        "totalIncGst": "1572.40",
      }
    `);
  });
});
