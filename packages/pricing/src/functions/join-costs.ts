// packages/pricing/src/functions/join-costs.ts
//
// Round 3B — calc.join.fixed.
//
// Each `Join` in the Job is billed at a per-lineal-metre rate. The join's
// length is the length of `edgeA` (the join's canonical anchor edge per the
// detector's convention). The piece referenced by `pieceA` is scanned for
// `edgeA`; if the edge isn't found the join is skipped (a stale join is a
// reducer bug, not a pricing bug — we don't crash the quote on it).
//
// R-LINT-014 (project hygiene): this function does NOT call any other calc
// function. The orchestrator composes the line items.

import { Decimal } from "decimal.js";

import type { Join, Piece } from "@stonehenge-proto/geometry";

import type { JoinRate, QuoteLineItem } from "../types.js";

const MM_PER_M = new Decimal("1000");

export function calcJoinCosts(
  joins: readonly Join[],
  pieces: readonly Piece[],
  joinRates: readonly JoinRate[],
): readonly QuoteLineItem[] {
  const piecesById = new Map(pieces.map((p) => [p.id, p]));
  const lines: QuoteLineItem[] = [];

  for (const join of joins) {
    const rate = joinRates.find((r) => r.joinKind === join.kind);
    if (!rate) {
      throw new Error(
        `calcJoinCosts: no rate for join kind ${join.kind}`,
      );
    }
    const pieceA = piecesById.get(join.pieceA);
    if (!pieceA) continue;
    const edge = pieceA.edges.find((e) => e.id === join.edgeA);
    if (!edge) continue;
    const a = pieceA.vertices.find((v) => v.id === edge.start);
    const b = pieceA.vertices.find((v) => v.id === edge.end);
    if (!a || !b) continue;
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
    if (lengthMm <= 0) continue;

    const lengthM = new Decimal(lengthMm.toString()).dividedBy(MM_PER_M);
    const unitRate = new Decimal(rate.ratePerLinealMetre);
    const lineTotal = lengthM.times(unitRate);

    lines.push({
      description: `Join — ${join.kind}`,
      quantity: lengthM,
      unit: "lm",
      unitRate,
      lineTotal,
    });
  }
  return lines;
}
