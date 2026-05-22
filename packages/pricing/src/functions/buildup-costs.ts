// packages/pricing/src/functions/buildup-costs.ts
//
// Round 3B — calc.buildup.strips.
//
// Each build-up child piece (Fascia / Return / Infill) is priced at a
// per-lineal-metre rate. The strip's length is the long side of the
// child piece's rectangular outer ring (matching the parent edge the
// build-up was generated for).
//
// R-LINT-014 (project hygiene from the V3 spec): this function does NOT
// call any other calc function. The orchestrator composes the line items.

import { Decimal } from "decimal.js";

import type { Piece, PieceRole } from "@stonehenge-proto/geometry";

import type { BuildUpRate, QuoteLineItem } from "../types.js";

const MM_PER_M = new Decimal("1000");

const STRIP_ROLES: ReadonlySet<PieceRole> = new Set<PieceRole>([
  "FASCIA",
  "RETURN",
  "INFILL",
]);

export function calcBuildUpCosts(
  parentPiece: Piece,
  childPieces: readonly Piece[],
  buildUpRates: readonly BuildUpRate[],
): readonly QuoteLineItem[] {
  const lines: QuoteLineItem[] = [];
  for (const child of childPieces) {
    if (child.parentPieceId !== parentPiece.id) continue;
    if (!STRIP_ROLES.has(child.pieceRole)) continue;

    const partRole = child.pieceRole as "FASCIA" | "RETURN" | "INFILL";
    const rate = buildUpRates.find(
      (r) =>
        r.partRole === partRole && r.thicknessMm === (parentPiece.thicknessMm + child.thicknessMm),
    );
    if (!rate) {
      throw new Error(
        `calcBuildUpCosts: no rate for ${partRole} at ${child.thicknessMm}mm`,
      );
    }

    const lengthMm = longestRectangleSideMm(child);
    if (lengthMm <= 0) continue;

    const lengthM = new Decimal(lengthMm.toString()).dividedBy(MM_PER_M);
    const unitRate = new Decimal(rate.ratePerLinealMetre);
    const lineTotal = lengthM.times(unitRate);

    lines.push({
      description: `Build-up — ${partRole} ${child.thicknessMm} mm (${child.name})`,
      quantity: lengthM,
      unit: "lm",
      unitRate,
      lineTotal,
    });
  }
  return lines;
}

/**
 * Return the longest edge length of `piece.outerRing`, in mm. Build-up child
 * pieces are simple rectangles, so the longest side is the run length we
 * bill against.
 */
function longestRectangleSideMm(piece: Piece): number {
  const verticesById = new Map(piece.vertices.map((v) => [v.id, v]));
  let longest = 0;
  for (const id of piece.outerRing.edges) {
    const e = piece.edges.find((x) => x.id === id);
    if (!e) continue;
    const a = verticesById.get(e.start);
    const b = verticesById.get(e.end);
    if (!a || !b) continue;
    const lengthMm = Math.hypot(b.x - a.x, b.y - a.y);
    if (lengthMm > longest) longest = lengthMm;
  }
  return longest;
}
