/**
 * Room Layout Engine
 *
 * Computes approximate (x, y) positions for pieces within a room
 * based on their relationships. Used by RoomSpatialView for SVG rendering.
 *
 * This is a pure function — no side effects, no API calls, no database queries.
 */

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
}

interface RelationshipInput {
  parentPieceId: string;
  childPieceId: string;
  relationshipType: string;
  joinPosition: string | null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const TARGET_SVG_WIDTH = 800;
const PADDING = 60;
const PIECE_GAP = 40;          // Gap between unrelated pieces
const SPLASHBACK_GAP = 20;     // Gap between splashback and benchtop
const UNRELATED_STACK_GAP = 30; // Vertical gap when stacking unrelated pieces

// Piece types that are considered "primary" candidates
const PRIMARY_TYPES = ['BENCHTOP', 'ISLAND', 'benchtop', 'island'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPrimaryCandidate(pieceType: string | null, description: string): boolean {
  if (pieceType && PRIMARY_TYPES.some(t => t.toLowerCase() === pieceType.toLowerCase())) {
    return true;
  }
  const lower = description.toLowerCase();
  return lower.includes('benchtop') || lower.includes('island');
}

function pieceArea(p: PieceInput): number {
  return p.length_mm * p.width_mm;
}

/**
 * Finds the primary piece in a room — the largest benchtop or island.
 * Falls back to the largest piece overall if no benchtop/island exists.
 */
function findPrimaryPiece(pieces: PieceInput[]): PieceInput | null {
  if (pieces.length === 0) return null;

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
    return { pieces: [], viewBox: { width: TARGET_SVG_WIDTH, height: 200 }, scale: 1 };
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
  const primary = findPrimaryPiece(pieces);
  if (!primary) {
    return { pieces: [], viewBox: { width: TARGET_SVG_WIDTH, height: 200 }, scale: 1 };
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
    width: primary.length_mm,
    height: primary.width_mm,
    rotation: 0,
    label: primary.description,
  });
  placedIds.add(primary.id);

  // 2. Place children of the primary piece based on relationship type
  const childrenOfPrimary = relationships.filter(r => r.parentPieceId === primary.id);
  for (const rel of childrenOfPrimary) {
    const child = pieceMap.get(rel.childPieceId);
    if (!child || placedIds.has(child.id)) continue;

    const pos = positionChild(primary, child, rel.relationshipType, rel.joinPosition);
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

    const childPos = positionChild(parent, child, rel.relationshipType, rel.joinPosition);
    // Offset by parent position
    childPos.x += parentPos.x;
    childPos.y += parentPos.y;
    positioned.push(childPos);
    placedIds.add(child.id);
  }

  // 4. Place remaining unrelated pieces stacked below
  const unplaced = pieces.filter(p => !placedIds.has(p.id));
  if (unplaced.length > 0) {
    // Find the bottom of all currently placed pieces
    let maxY = 0;
    for (const pos of positioned) {
      const bottom = pos.y + pos.height;
      if (bottom > maxY) maxY = bottom;
    }

    let stackY = maxY + PIECE_GAP;
    for (const piece of unplaced) {
      positioned.push({
        pieceId: piece.id,
        x: 0,
        y: stackY,
        width: piece.length_mm,
        height: piece.width_mm,
        rotation: 0,
        label: piece.description,
      });
      placedIds.add(piece.id);
      stackY += piece.width_mm + UNRELATED_STACK_GAP;
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

  // Scale to fit target SVG width with padding
  const availableWidth = TARGET_SVG_WIDTH - PADDING * 2;
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
      width: TARGET_SVG_WIDTH,
      height: Math.max(svgHeight, 200),
    },
    scale,
  };
}

// ─── Child Positioning ───────────────────────────────────────────────────────

function positionChild(
  parent: PieceInput,
  child: PieceInput,
  relationshipType: string,
  joinPosition: string | null
): { pieceId: string; x: number; y: number; width: number; height: number; rotation: number; label: string } {
  const type = relationshipType.toUpperCase();

  switch (type) {
    case 'SPLASHBACK': {
      // Splashback sits behind (above in plan view) the parent benchtop
      return {
        pieceId: child.id,
        x: 0,
        y: -(child.width_mm + SPLASHBACK_GAP),
        width: child.length_mm,
        height: child.width_mm,
        rotation: 0,
        label: child.description,
      };
    }

    case 'WATERFALL': {
      // Waterfall drops from the edge of the benchtop, rotated 90 degrees
      // Width = parent's depth, length = floor-to-benchtop height
      const isRight = !joinPosition || joinPosition.toUpperCase() === 'RIGHT';
      return {
        pieceId: child.id,
        x: isRight ? parent.length_mm : -(child.width_mm),
        y: 0,
        width: child.width_mm,   // After rotation: width becomes the horizontal extent
        height: child.length_mm, // After rotation: length becomes the vertical extent
        rotation: 90,
        label: child.description,
      };
    }

    case 'RETURN': {
      // Return forms an L-shape at 90 degrees to parent
      const isRight = !joinPosition || joinPosition.toUpperCase() === 'RIGHT';
      return {
        pieceId: child.id,
        x: isRight ? parent.length_mm : -(child.length_mm),
        y: 0,
        width: child.length_mm,
        height: child.width_mm,
        rotation: 0,
        label: child.description,
      };
    }

    case 'WINDOW_SILL': {
      // Window sill placed independently — above the parent with a gap
      return {
        pieceId: child.id,
        x: 0,
        y: -(child.width_mm + PIECE_GAP),
        width: child.length_mm,
        height: child.width_mm,
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
        x: isRight ? parent.length_mm : -(child.length_mm),
        y: 0,
        width: child.length_mm,
        height: child.width_mm,
        rotation: 0,
        label: child.description,
      };
    }

    default: {
      // Unknown relationship — place below parent
      return {
        pieceId: child.id,
        x: 0,
        y: parent.width_mm + PIECE_GAP,
        width: child.length_mm,
        height: child.width_mm,
        rotation: 0,
        label: child.description,
      };
    }
  }
}
