/**
 * Linear Layout Engine
 *
 * Computes horizontal left-to-right piece positions for print layout.
 * Pieces are arranged in rows, normalised to consistent height,
 * optimised for A4 landscape printing.
 *
 * This is a pure function — no side effects, no API calls, no database queries.
 */

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface LinearPiecePosition {
  pieceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

export interface LinearRoomLayout {
  pieces: LinearPiecePosition[];
  viewBox: { width: number; height: number };
  scale: number;
  rows: number;
}

interface PieceInput {
  id: string;
  description: string;
  length_mm: number;
  width_mm: number;
  piece_type: string | null;
}

interface LayoutOptions {
  maxRowWidth?: number;
  pieceGap?: number;
  rowGap?: number;
  maxPieceHeight?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_ROW_WIDTH = 1000;
const DEFAULT_PIECE_GAP = 40;
const DEFAULT_ROW_GAP = 80;
const DEFAULT_MAX_PIECE_HEIGHT = 120;
const PADDING = 30;

const PRIMARY_TYPES = ['BENCHTOP', 'ISLAND'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isPrimaryType(pieceType: string | null): boolean {
  if (!pieceType) return false;
  return PRIMARY_TYPES.includes(pieceType.toUpperCase());
}

function pieceArea(p: PieceInput): number {
  return p.length_mm * p.width_mm;
}

// ─── Layout Engine ───────────────────────────────────────────────────────────

export function calculateLinearLayout(
  pieces: Array<{
    id: string;
    description: string;
    length_mm: number;
    width_mm: number;
    piece_type: string | null;
  }>,
  options?: LayoutOptions
): LinearRoomLayout {
  if (pieces.length === 0) {
    return {
      pieces: [],
      viewBox: { width: DEFAULT_MAX_ROW_WIDTH, height: 200 },
      scale: 1,
      rows: 0,
    };
  }

  const maxRowWidth = options?.maxRowWidth ?? DEFAULT_MAX_ROW_WIDTH;
  const pieceGap = options?.pieceGap ?? DEFAULT_PIECE_GAP;
  const rowGap = options?.rowGap ?? DEFAULT_ROW_GAP;
  const maxPieceHeight = options?.maxPieceHeight ?? DEFAULT_MAX_PIECE_HEIGHT;

  // 1. Sort: BENCHTOP/ISLAND first, then by area (largest first)
  const sorted = [...pieces].sort((a, b) => {
    const aIsPrimary = isPrimaryType(a.piece_type);
    const bIsPrimary = isPrimaryType(b.piece_type);
    if (aIsPrimary && !bIsPrimary) return -1;
    if (!aIsPrimary && bIsPrimary) return 1;
    return pieceArea(b) - pieceArea(a);
  });

  // 2. Normalise all pieces to the same height (based on the tallest piece's width_mm)
  const tallest = Math.max(...sorted.map(p => p.width_mm));
  const scale = tallest > 0 ? maxPieceHeight / tallest : 1;

  // 3. Place left-to-right, wrapping to next row if exceeding maxRowWidth
  const positioned: LinearPiecePosition[] = [];
  let currentX = PADDING;
  let currentY = PADDING;
  let rowCount = 1;

  for (const piece of sorted) {
    const scaledWidth = piece.length_mm * scale;
    const scaledHeight = piece.width_mm * scale;

    // Wrap to next row if this piece would exceed maxRowWidth
    if (currentX + scaledWidth > maxRowWidth - PADDING && currentX > PADDING) {
      currentX = PADDING;
      currentY += maxPieceHeight + rowGap;
      rowCount++;
    }

    positioned.push({
      pieceId: piece.id,
      x: currentX,
      y: currentY,
      width: scaledWidth,
      height: scaledHeight,
      label: piece.description,
    });

    currentX += scaledWidth + pieceGap;
  }

  // 4. Calculate viewBox
  const maxX = Math.max(...positioned.map(p => p.x + p.width)) + PADDING;
  const maxY = Math.max(...positioned.map(p => p.y + p.height)) + PADDING;

  return {
    pieces: positioned,
    viewBox: {
      width: Math.max(maxX, maxRowWidth),
      height: Math.max(maxY, 200),
    },
    scale,
    rows: rowCount,
  };
}
