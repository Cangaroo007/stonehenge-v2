// packages/geometry/src/ids.ts
//
// Branded ID factories. Uses the Web Crypto API (globalThis.crypto)
// which works in both browsers and Node 19+. No node: imports needed.

import type { EdgeId, FeatureId, JoinId, PieceId, VertexId } from "./types";

export function vertexId(): VertexId {
  return crypto.randomUUID() as VertexId;
}

export function edgeId(): EdgeId {
  return crypto.randomUUID() as EdgeId;
}

export function featureId(): FeatureId {
  return crypto.randomUUID() as FeatureId;
}

export function pieceId(): PieceId {
  return crypto.randomUUID() as PieceId;
}

export function joinId(): JoinId {
  return crypto.randomUUID() as JoinId;
}
