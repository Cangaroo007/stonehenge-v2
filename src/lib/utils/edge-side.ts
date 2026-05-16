export type RectEdgeSide = 'top' | 'bottom' | 'left' | 'right';

const RECT_EDGE_SIDES: RectEdgeSide[] = ['top', 'bottom', 'left', 'right'];

/**
 * Internal rectangle edge convention:
 * - top = back/wall side in plan view
 * - bottom = front/exposed side in plan view
 * - left/right = viewed from the front edge
 */
export function normaliseRectEdgeSide(
  side: string | null | undefined,
  fallback?: RectEdgeSide
): RectEdgeSide | null {
  const value = side?.trim().toLowerCase();
  if (!value) return fallback ?? null;

  if (value === 'front') return 'bottom';
  if (value === 'back' || value === 'rear') return 'top';
  if ((RECT_EDGE_SIDES as string[]).includes(value)) return value as RectEdgeSide;

  return fallback ?? null;
}

export function rectEdgeDisplayLabel(side: RectEdgeSide): string {
  if (side === 'top') return 'Back / wall';
  if (side === 'bottom') return 'Front / exposed';
  return side.charAt(0).toUpperCase() + side.slice(1);
}
