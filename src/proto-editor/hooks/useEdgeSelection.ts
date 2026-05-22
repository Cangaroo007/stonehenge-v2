"use client";

// apps/web/src/hooks/useEdgeSelection.ts
//
// Thin helper around the `selectEdge` action. Returns the currently
// selected edge object (or null) so the EdgeProfilePanel can render its
// controls without re-walking the piece.
//
// Kept as a hook rather than inlined in EdgeProfilePanel so that future
// keyboard cycling between edges (Tab / Shift-Tab) can land here without
// touching the panel.

import { useCallback, useMemo } from "react";

import type { Edge, EdgeId, Piece } from "@stonehenge-proto/geometry";

export interface UseEdgeSelectionApi {
  readonly selectedEdge: Edge | null;
  readonly select: (edgeId: EdgeId | null) => void;
}

export interface UseEdgeSelectionInput {
  readonly piece: Piece;
  readonly selectedEdgeId: EdgeId | null;
  readonly selectEdge: (edgeId: EdgeId | null) => void;
}

export function useEdgeSelection(
  input: UseEdgeSelectionInput,
): UseEdgeSelectionApi {
  const { piece, selectedEdgeId, selectEdge } = input;

  const selectedEdge = useMemo<Edge | null>(() => {
    if (!selectedEdgeId) return null;
    return piece.edges.find((e) => e.id === selectedEdgeId) ?? null;
  }, [piece, selectedEdgeId]);

  const select = useCallback(
    (edgeId: EdgeId | null) => selectEdge(edgeId),
    [selectEdge],
  );

  return { selectedEdge, select };
}
