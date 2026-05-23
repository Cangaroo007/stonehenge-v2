/**
 * Room Layout Engine
 *
 * Computes approximate (x, y) positions for pieces within a room
 * based on their relationships. Used by RoomSpatialView for SVG rendering.
 *
 * This is a pure function — no side effects, no API calls, no database queries.
 */
import { normaliseRectEdgeSide, type RectEdgeSide } from '@/lib/utils/edge-side';
import { isCanonicalPolygonShapeConfig } from '@/lib/types/shapes';

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PiecePosition {
  pieceId: string;
  x: number;        // SVG x coordinate
  y: number;        // SVG y coordinate
  width: number;    // Rendered width in SVG units
  height: number;   // Rendered height in SVG units
  rotation: number; // Degrees (0, 90, 180, 270)
  label: string;    // Piece name/description
}

export interface RoomLayout {
  pieces: PiecePosition[];
  viewBox: { width: number; height: number };
  scale: number;    // mm to SVG units
}

interface PieceInput {
  id: string;
  description: string;
  length_mm: number;
  width_mm: number;
  piece_type: string | null;
  shape_config?: unknown;
}

interface RelationshipInput {
  parentPieceId: string;
  childPieceId: string;
  relationshipType: string;
  joinPosition: string | null;
  positionMm?: number | null;
  positionReference?: string | null;
  coverageMm?: number | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_SVG_WIDTH = 1400;
const MAX_SVG_WIDTH = 2400;
const PADDING = 60;
const PIECE_GAP = 40;          // Gap between unrelated pieces
const SPLASHBACK_GAP = 20;     // Gap between splashback and benchtop
const UNRELATED_STACK_GAP = 30; // Vertical gap when stacking unrelated pieces

// Piece types that are considered primary surfaces in a room layout.
// Attached vertical pieces like waterfalls/splashbacks should not become the
// room anchor just because they have a larger face area than a vanity or top.
const PRIMARY_TYPES = ['BENCHTOP', 'ISLAND', 'VANITY', 'LAUNDRY', 'WINDOW_SILL'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPrimaryCandidate(pieceType: string | null, description: string): boolean {
  if (pieceType && PRIMARY_TYPES.some(t => t.toLowerCase() === pieceType.toLowerCase())) {
    return true;
  }
  const lower = description.toLowerCase();
  return lower.includes('benchtop') || lower.includes('island');
}

function pieceArea(p: PieceInput): number {
  const size = pieceLayoutSize(p);
  return size.length_mm * size.width_mm;
}

function pieceLayoutSize(p: PieceInput): { length_mm: number; width_mm: number } {
  if (isCanonicalPolygonShapeConfig(p.shape_config)) {
    return {
      length_mm: Math.max(p.shape_config.boundingBox.lengthMm, 1),
      width_mm: Math.max(p.shape_config.boundingBox.widthMm, 1),
    };
  }

  const shapeConfig = p.shape_config as Record<string, unknown> | null | undefined;
  const shape = String(shapeConfig?.shape ?? '').toUpperCase();
  if (shape === 'RADIUS_END' || shape === 'ROUNDED_RECT') {
    const length = Number(shapeConfig?.length_mm);
    const width = Number(shapeConfig?.width_mm);
    if (Number.isFinite(length) && Number.isFinite(width) && length > 0 && width > 0) {
      return { length_mm: length, width_mm: width };
    }
  }

  return {
    length_mm: Math.max(p.length_mm, 1),
    width_mm: Math.max(p.width_mm, 1),
  };
}

/**
 * Finds the primary piece in a room — the largest benchtop or island.
 * Falls back to the largest piece overall if no benchtop/island exists.
 */
function findPrimaryPiece(
  pieces: PieceInput[],
  relationships: RelationshipInput[] = []
): PieceInput | null {
  if (pieces.length === 0) return null;

  const pieceMap = new Map(pieces.map(p => [p.id, p]));
  const childIds = new Set(relationships.map(r => r.childPieceId));
  const relationshipParents = Array.from(
    new Set(relationships.map(r => r.parentPieceId))
  )
    .filter(id => !childIds.has(id))
    .map(id => pieceMap.get(id))
    .filter((p): p is PieceInput => Boolean(p));

  if (relationshipParents.length > 0) {
    return relationshipParents.reduce((largest, p) =>
      pieceArea(p) > pieceArea(largest) ? p : largest
    );
  }

  const primaryCandidates = pieces.filter(p =>
    isPrimaryCandidate(p.piece_type, p.description)
  );

  if (primaryCandidates.length > 0) {
    return primaryCandidates.reduce((largest, p) =>
      pieceArea(p) > pieceArea(largest) ? p : largest
    );
  }

  // Fallback: largest piece overall
  return pieces.reduce((largest, p) =>
    pieceArea(p) > pieceArea(largest) ? p : largest
  );
}

// ─── Layout Engine ───────────────────────────────────────────────────────────

export function calculateRoomLayout(
  pieces: PieceInput[],
  relationships: RelationshipInput[]
): RoomLayout {
  if (pieces.length === 0) {
    return { pieces: [], viewBox: { width: MIN_SVG_WIDTH, height: 200 }, scale: 1 };
  }

  const pieceMap = new Map<string, PieceInput>();
  for (const p of pieces) {
    pieceMap.set(p.id, p);
  }

  // Build parent→children relationship map
  const childToParent = new Map<string, { parentId: string; type: string; position: string | null }>();
  for (const rel of relationships) {
    childToParent.set(rel.childPieceId, {
      parentId: rel.parentPieceId,
      type: rel.relationshipType,
      position: rel.joinPosition,
    });
  }

  // Find primary piece
  const primary = findPrimaryPiece(pieces, relationships);
  if (!primary) {
    return { pieces: [], viewBox: { width: MIN_SVG_WIDTH, height: 200 }, scale: 1 };
  }

  // Position pieces in mm-space (we'll scale to SVG units later)
  interface MmPosition {
    pieceId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    rotation: number;
    label: string;
  }

  const positioned: MmPosition[] = [];
  const placedIds = new Set<string>();

  // 1. Place primary piece at origin
  positioned.push({
    pieceId: primary.id,
    x: 0,
    y: 0,
    width: pieceLayoutSize(primary).length_mm,
    height: pieceLayoutSize(primary).width_mm,
    rotation: 0,
    label: primary.description,
  });
  placedIds.add(primary.id);

  // 2. Place children of the primary piece based on relationship type
  const childrenOfPrimary = relationships.filter(r => r.parentPieceId === primary.id);
  for (const rel of childrenOfPrimary) {
    const child = pieceMap.get(rel.childPieceId);
    if (!child || placedIds.has(child.id)) continue;

    const pos = positionChild(primary, child, rel);
    positioned.push(pos);
    placedIds.add(child.id);
  }

  // 3. Place children of already-placed pieces (second-level relationships)
  const remainingRels = relationships.filter(
    r => !placedIds.has(r.childPieceId) && placedIds.has(r.parentPieceId)
  );
  for (const rel of remainingRels) {
    const parent = pieceMap.get(rel.parentPieceId);
    const child = pieceMap.get(rel.childPieceId);
    if (!parent || !child || placedIds.has(child.id)) continue;

    const parentPos = positioned.find(p => p.pieceId === parent.id);
    if (!parentPos) continue;

    const childPos = positionChild(parent, child, rel);
    // Offset by parent position
    childPos.x += parentPos.x;
    childPos.y += parentPos.y;
    positioned.push(childPos);
    placedIds.add(child.id);
  }

  // Safety pass: ensure all relationship children are placed
  for (const rel of relationships) {
    if (placedIds.has(rel.childPieceId)) continue;
    const parentPiece = pieceMap.get(rel.parentPieceId);
    const child = pieceMap.get(rel.childPieceId);
    const parentPos = positioned.find(p => p.pieceId === rel.parentPieceId);
    if (!parentPiece || !child || !parentPos) continue;

    const childPos = positionChild(parentPiece, child, rel);
    childPos.x += parentPos.x;
    childPos.y += parentPos.y;
    positioned.push(childPos);
    placedIds.add(rel.childPieceId);
  }

  // 4. Place remaining unrelated pieces
  // But first: check if any unrelated piece is a child of another placed piece
  const unplaced = pieces.filter(p => !placedIds.has(p.id));

  // Row layout state for unrelated pieces — horizontal rows, wrap at MAX_ROW_WIDTH_MM
  const MAX_ROW_WIDTH_MM = 8000;
  let unrelatedRowX = 0;
  let unrelatedRowY = -1; // -1 = not initialised yet
  let unrelatedRowMaxHeight = 0;

  for (const piece of unplaced) {
    // Check if this piece is a child of an already-placed piece
    const parentRel = relationships.find(r => r.childPieceId === piece.id);
    if (parentRel && placedIds.has(parentRel.parentPieceId)) {
      const parentPos = positioned.find(p => p.pieceId === parentRel.parentPieceId);
      if (parentPos) {
        const childPos = positionChild(
          pieceMap.get(parentRel.parentPieceId)!,
          piece,
          parentRel
        );
        childPos.x += parentPos.x;
        childPos.y += parentPos.y;
        positioned.push(childPos);
        placedIds.add(piece.id);
        continue;
      }
    }

    // Truly unrelated — arrange in horizontal rows, wrap at MAX_ROW_WIDTH_MM
    if (unrelatedRowY < 0) {
      // First unrelated piece — start below all already-placed pieces
      let maxBottom = 0;
      for (const pos of positioned) {
        const bottom = pos.y + pos.height;
        if (bottom > maxBottom) maxBottom = bottom;
      }
      unrelatedRowY = maxBottom + PIECE_GAP * 2;
      unrelatedRowX = 0;
      unrelatedRowMaxHeight = 0;
    }

    // Wrap to next row if this piece won't fit
    const pieceSize = pieceLayoutSize(piece);

    if (unrelatedRowX > 0 && unrelatedRowX + pieceSize.length_mm > MAX_ROW_WIDTH_MM) {
      unrelatedRowY += unrelatedRowMaxHeight + PIECE_GAP;
      unrelatedRowX = 0;
      unrelatedRowMaxHeight = 0;
    }

    positioned.push({
      pieceId: piece.id,
      x: unrelatedRowX,
      y: unrelatedRowY,
      width: pieceSize.length_mm,
      height: pieceSize.width_mm,
      rotation: 0,
      label: piece.description,
    });
    placedIds.add(piece.id);

    unrelatedRowX += pieceSize.length_mm + PIECE_GAP;
    if (pieceSize.width_mm > unrelatedRowMaxHeight) {
      unrelatedRowMaxHeight = pieceSize.width_mm;
    }
  }

  // 5. Calculate bounding box and scale
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const pos of positioned) {
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + pos.width);
    maxY = Math.max(maxY, pos.y + pos.height);
  }

  const totalWidth = maxX - minX;
  const totalHeight = maxY - minY;

  // Dynamic SVG width based on content
  // Target: each mm = 0.3px for proportional rendering
  const MM_TO_PX = 0.3;
  const idealWidth = Math.max(
    MIN_SVG_WIDTH,
    Math.min(MAX_SVG_WIDTH, Math.ceil(totalWidth * MM_TO_PX) + PADDING * 2)
  );

  // Scale to fit dynamic SVG width with padding
  const availableWidth = idealWidth - PADDING * 2;
  const scale = totalWidth > 0 ? availableWidth / totalWidth : 1;

  // Calculate SVG height proportionally
  const svgHeight = totalHeight * scale + PADDING * 2;

  // Convert mm positions to SVG coordinates
  const svgPieces: PiecePosition[] = positioned.map(pos => ({
    pieceId: pos.pieceId,
    x: PADDING + (pos.x - minX) * scale,
    y: PADDING + (pos.y - minY) * scale,
    width: pos.width * scale,
    height: pos.height * scale,
    rotation: pos.rotation,
    label: pos.label,
  }));

  return {
    pieces: svgPieces,
    viewBox: {
      width: idealWidth,
      height: Math.max(svgHeight, 200),
    },
    scale,
  };
}

// ─── Child Positioning ───────────────────────────────────────────────────────

function positiveNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : null;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function resolveOffset(
  parentSpanMm: number,
  childSpanMm: number,
  positionMm: number | null | undefined,
  positionReference: string | null | undefined
): number {
  const maxOffset = Math.max(parentSpanMm - childSpanMm, 0);
  const position = positiveNumber(positionMm) ?? 0;
  const reference = (positionReference ?? 'LEFT').toUpperCase();

  if (reference === 'RIGHT') {
    return clamp(parentSpanMm - position - childSpanMm, 0, maxOffset);
  }
  if (reference === 'CENTRE' || reference === 'CENTER') {
    return clamp((parentSpanMm - childSpanMm) / 2 + position, 0, maxOffset);
  }
  return clamp(position, 0, maxOffset);
}

function normaliseEdgeSide(side: string | null | undefined, fallback: RectEdgeSide): RectEdgeSide {
  return normaliseRectEdgeSide(side, fallback) ?? fallback;
}

function positionChild(
  parent: PieceInput,
  child: PieceInput,
  relationship: RelationshipInput
): { pieceId: string; x: number; y: number; width: number; height: number; rotation: number; label: string } {
  const type = relationship.relationshipType.toUpperCase();
  const joinPosition = relationship.joinPosition;
  const coverageMm = positiveNumber(relationship.coverageMm) ?? null;
  const parentSize = pieceLayoutSize(parent);
  const childSize = pieceLayoutSize(child);

  switch (type) {
    case 'SPLASHBACK': {
      // side = 'top' → splashback sits behind (above in plan view) parent
      // side = 'bottom' → splashback sits in front (below in plan view) parent
      const side = normaliseEdgeSide(joinPosition, 'top');
      const alongLength = side === 'top' || side === 'bottom';
      const childSpan = coverageMm ?? childSize.length_mm;
      const parentSpan = alongLength ? parentSize.length_mm : parentSize.width_mm;
      const offset = resolveOffset(parentSpan, childSpan, relationship.positionMm, relationship.positionReference);
      const isBottom = side === 'bottom';
      const isRight = side === 'right';

      if (alongLength) {
        return {
          pieceId: child.id,
          x: offset,
          y: isBottom
            ? parentSize.width_mm + SPLASHBACK_GAP
            : -(childSize.width_mm + SPLASHBACK_GAP),
          width: childSpan,
          height: childSize.width_mm,
          rotation: 0,
          label: child.description,
        };
      }

      return {
        pieceId: child.id,
        x: isRight
          ? parentSize.length_mm + SPLASHBACK_GAP
          : -(childSize.width_mm + SPLASHBACK_GAP),
        y: offset,
        width: childSize.width_mm,
        height: childSpan,
        rotation: 0,
        label: child.description,
      };
    }

    case 'WATERFALL': {
      // Waterfall drops from the named edge of the parent.
      // In plan view: right → extends right, left → extends left,
      // top → extends above (negative y), bottom → extends below.
      const wfSide = normaliseEdgeSide(joinPosition, 'right');
      switch (wfSide) {
        case 'right': {
          const childSpan = coverageMm ?? childSize.length_mm;
          const offset = resolveOffset(parentSize.width_mm, childSpan, relationship.positionMm, relationship.positionReference);
          return {
            pieceId: child.id,
            x: parentSize.length_mm,
            y: offset,
            width: childSize.width_mm,
            height: childSpan,
            rotation: 0,
            label: child.description,
          };
        }
        case 'left': {
          const childSpan = coverageMm ?? childSize.length_mm;
          const offset = resolveOffset(parentSize.width_mm, childSpan, relationship.positionMm, relationship.positionReference);
          return {
            pieceId: child.id,
            x: -(childSize.width_mm),
            y: offset,
            width: childSize.width_mm,
            height: childSpan,
            rotation: 0,
            label: child.description,
          };
        }
        case 'top': {
          const childSpan = coverageMm ?? childSize.length_mm;
          const offset = resolveOffset(parentSize.length_mm, childSpan, relationship.positionMm, relationship.positionReference);
          return {
            pieceId: child.id,
            x: offset,
            y: -(childSize.width_mm),
            width: childSpan,
            height: childSize.width_mm,
            rotation: 0,
            label: child.description,
          };
        }
        case 'bottom': {
          const childSpan = coverageMm ?? childSize.length_mm;
          const offset = resolveOffset(parentSize.length_mm, childSpan, relationship.positionMm, relationship.positionReference);
          return {
            pieceId: child.id,
            x: offset,
            y: parentSize.width_mm,
            width: childSpan,
            height: childSize.width_mm,
            rotation: 0,
            label: child.description,
          };
        }
        default:
          return {
            pieceId: child.id,
            x: parentSize.length_mm,
            y: 0,
            width: childSize.width_mm,
            height: childSize.length_mm,
            rotation: 0,
            label: child.description,
          };
      }
    }

    case 'RETURN': {
      // Return forms an L-shape at 90 degrees to parent
      const isRight = !joinPosition || joinPosition.toUpperCase() === 'RIGHT';
      return {
        pieceId: child.id,
        x: isRight ? parentSize.length_mm : -(childSize.length_mm),
        y: 0,
        width: childSize.length_mm,
        height: childSize.width_mm,
        rotation: 0,
        label: child.description,
      };
    }

    case 'WINDOW_SILL': {
      // Window sill placed independently — above the parent with a gap
      return {
        pieceId: child.id,
        x: 0,
        y: -(childSize.width_mm + PIECE_GAP),
        width: childSize.length_mm,
        height: childSize.width_mm,
        rotation: 0,
        label: child.description,
      };
    }

    case 'MITRE_JOIN':
    case 'BUTT_JOIN': {
      // Adjacent pieces joined at the edge
      const isRight = !joinPosition || joinPosition.toUpperCase() === 'RIGHT';
      return {
        pieceId: child.id,
        x: isRight ? parentSize.length_mm : -(childSize.length_mm),
        y: 0,
        width: childSize.length_mm,
        height: childSize.width_mm,
        rotation: 0,
        label: child.description,
      };
    }

    default: {
      // Unknown relationship — place below parent
      return {
        pieceId: child.id,
        x: 0,
        y: parentSize.width_mm + PIECE_GAP,
        width: childSize.length_mm,
        height: childSize.width_mm,
        rotation: 0,
        label: child.description,
      };
    }
  }
}
