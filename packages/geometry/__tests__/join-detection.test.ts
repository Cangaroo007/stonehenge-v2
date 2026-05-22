// packages/geometry/__tests__/join-detection.test.ts
//
// Round 3B — `detectAllJoins` / `detectJoinsForPiece` heuristics.

import { describe, expect, it } from "vitest";

import {
  detectAllJoins,
  detectJoinsForPiece,
} from "../src/index.js";
import type { Job, Piece } from "../src/types";
import { RECTANGLE_3200X600, buildSimplePiece } from "./_fixtures.js";

function withRole(piece: Piece, role: Piece["pieceRole"]): Piece {
  return { ...piece, pieceRole: role };
}

describe("join-detection — Round 3B", () => {
  const benchtop = withRole(
    buildSimplePiece({ name: "benchtop", coords: RECTANGLE_3200X600 }).piece,
    "BENCHTOP",
  );
  const waterfall = withRole(
    buildSimplePiece({
      name: "waterfall",
      coords: [
        [0, 0],
        [20, 0],
        [20, 870],
        [0, 870],
      ],
    }).piece,
    "WATERFALL_END",
  );
  const splashback = withRole(
    buildSimplePiece({
      name: "splashback",
      coords: [
        [0, 0],
        [3200, 0],
        [3200, 600],
        [0, 600],
      ],
    }).piece,
    "SPLASHBACK_FULL",
  );

  it("detects a MITRE join between a benchtop and a waterfall end", () => {
    const job: Job = {
      pieces: [benchtop, waterfall],
      joins: [],
    };
    const joins = detectAllJoins(job);
    expect(joins).toHaveLength(1);
    expect(joins[0]!.kind).toBe("MITRE");
    expect(joins[0]!.reason).toBe("WATERFALL_ATTACHMENT");
    expect(joins[0]!.pieceA).toBe(benchtop.id);
    expect(joins[0]!.pieceB).toBe(waterfall.id);
  });

  it("detects a BUTT join between a benchtop and a full splashback", () => {
    const job: Job = {
      pieces: [benchtop, splashback],
      joins: [],
    };
    const joins = detectAllJoins(job);
    expect(joins).toHaveLength(1);
    expect(joins[0]!.kind).toBe("BUTT");
    expect(joins[0]!.reason).toBe("SPLASHBACK_ATTACHMENT");
  });

  it("detects no join for an isolated benchtop", () => {
    const job: Job = { pieces: [benchtop], joins: [] };
    expect(detectAllJoins(job)).toEqual([]);
  });

  it("detectJoinsForPiece skips build-up children", () => {
    const child: Piece = {
      ...waterfall,
      parentPieceId: benchtop.id,
      pieceRole: "FASCIA",
    };
    const job: Job = { pieces: [benchtop, child], joins: [] };
    expect(detectJoinsForPiece(job, benchtop.id)).toEqual([]);
  });
});
