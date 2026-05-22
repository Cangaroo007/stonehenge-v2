// packages/pricing/src/functions/edge-profiling.ts
//
// calc.edge.profiling — sum exposed-edge length per profile, multiply by the
// profile's lineal-metre rate. Edges with `exposure !== "exposed"` are
// excluded. One line item per distinct profile present in the exposed set.

import { Decimal } from "decimal.js";

import type { EdgeProfile, Piece } from "@stonehenge-proto/geometry";

import type { EdgeProfileRate, QuoteLineItem } from "../types.js";

const MM_PER_M = new Decimal("1000");

export function calcEdgeProfiling(
  piece: Piece,
  edgeRates: readonly EdgeProfileRate[],
): readonly QuoteLineItem[] {
  const rateByProfile = new Map<EdgeProfile, EdgeProfileRate>();
  for (const r of edgeRates) rateByProfile.set(r.profile, r);

  // Index vertices for length computation.
  const verticesById = new Map(piece.vertices.map((v) => [v.id, v]));

  // Collect exposed-edge lengths in mm grouped by profile, kept as strings
  // (or Number for length, since geometry length is Number — but we cast to
  // Decimal at the boundary and never multiply Number × rate).
  const lengthMmByProfile = new Map<EdgeProfile, Decimal>();
  for (const id of piece.outerRing.edges) {
    const e = piece.edges.find((x) => x.id === id);
    if (!e) {
      throw new Error(`calcEdgeProfiling: edge ${String(id)} not found`);
    }
    if (e.exposure !== "exposed") continue;
    const a = verticesById.get(e.start);
    const b = verticesById.get(e.end);
    if (!a || !b) {
      throw new Error(
        `calcEdgeProfiling: edge ${String(e.id)} references unknown vertex`,
      );
    }
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
    const accum = lengthMmByProfile.get(e.profile) ?? new Decimal("0");
    lengthMmByProfile.set(
      e.profile,
      accum.plus(new Decimal(lengthMm.toString())),
    );
  }

  const lines: QuoteLineItem[] = [];
  // Iterate in deterministic order (the order rates appear in the catalogue).
  for (const r of edgeRates) {
    const lengthMm = lengthMmByProfile.get(r.profile);
    if (!lengthMm || lengthMm.isZero()) continue;
    const lengthM = lengthMm.dividedBy(MM_PER_M);
    const unitRate = new Decimal(r.ratePerLinealMetre);
    const lineTotal = lengthM.times(unitRate);
    lines.push({
      description: `Edge profiling — ${r.description}`,
      quantity: lengthM,
      unit: "lm",
      unitRate,
      lineTotal,
    });
  }
  return lines;
}
