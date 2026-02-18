/**
 * Shared edge and cutout utility functions.
 *
 * SINGLE SOURCE OF TRUTH — all components import from here.
 * See docs/component-inventory.md for the full list of consumers.
 *
 * When modifying these functions, check ALL consumers:
 * - RoomPieceSVG.tsx
 * - PieceVisualEditor.tsx
 * - MiniPieceEditor.tsx
 * - RoomSpatialView.tsx
 * - RoomLinearView.tsx
 * - MiniSpatialDiagram.tsx
 * - PieceRow.tsx (collapsed summary)
 * - StreamlinedAnalysisView.tsx
 */

// ── Colour map for edge profiles ─────────────────────────────────────────────

/**
 * Maps edge profile keywords to hex colours.
 * Used by edgeColour() and available for legends/badges.
 */
export const EDGE_PROFILE_COLOURS: Record<string, string> = {
  pencil: '#2563eb',
  bullnose: '#16a34a',
  ogee: '#9333ea',
  mitr: '#ea580c',
  bevel: '#0d9488',
  raw: '#9ca3af',
};

/** Default colour for unset/unrecognised edges */
const DEFAULT_EDGE_COLOUR = '#d1d5db';
/** Fallback colour when profile is set but not in the map */
const UNKNOWN_PROFILE_COLOUR = '#6b7280';

// ── edgeColour ───────────────────────────────────────────────────────────────

/** Returns hex colour for an edge profile name. Pure, stateless. */
export function edgeColour(name: string | null | undefined): string {
  if (!name) return DEFAULT_EDGE_COLOUR;
  const lower = name.toLowerCase();
  for (const [key, colour] of Object.entries(EDGE_PROFILE_COLOURS)) {
    if (lower.includes(key)) return colour;
  }
  return UNKNOWN_PROFILE_COLOUR;
}

// ── edgeCode ─────────────────────────────────────────────────────────────────

/** Returns 2-3 letter abbreviation for an edge profile. Pure, stateless. */
export function edgeCode(name: string | null | undefined): string {
  if (!name) return 'RAW';
  const lower = name.toLowerCase();
  if (lower.includes('pencil')) return 'PR';
  if (lower.includes('bullnose')) return 'BN';
  if (lower.includes('ogee')) return 'OG';
  if (lower.includes('mitr')) return 'M';
  if (lower.includes('bevel')) return 'BV';
  if (lower.includes('polish')) return 'P';
  return name.substring(0, 3).toUpperCase();
}

// ── cutoutLabel ──────────────────────────────────────────────────────────────

/** Returns short display name for a cutout type. Pure, stateless. */
export function cutoutLabel(typeName: string): string {
  const lower = typeName.toLowerCase();
  if (lower.includes('undermount')) return 'U/M Sink';
  if (lower.includes('drop')) return 'D/I Sink';
  if (lower.includes('hotplate') || lower.includes('cooktop')) return 'HP';
  if (lower.includes('tap')) return 'TH';
  if (lower.includes('gpo')) return 'GPO';
  if (lower.includes('basin')) return 'B';
  if (lower.includes('drainer') || lower.includes('groove')) return 'DG';
  if (lower.includes('flush')) return 'FC';
  return typeName.substring(0, 4);
}
