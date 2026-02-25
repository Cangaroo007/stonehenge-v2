// Smart Defaults Engine — pure functions, no database, no API, no component imports

export interface PieceDefaults {
  width_mm: number;
  edges: { top: string; bottom: string; left: string; right: string };
  suggestedCutouts: string[];
  pieceType: string | null;
}

export interface RoomSuggestion {
  name: string;
  suggestedPieces: string[];
}

interface PieceDefaultEntry {
  matchTerm: string;
  width_mm: number;
  edges: { top: string; bottom: string; left: string; right: string };
  suggestedCutouts: string[];
  pieceType: string | null;
}

// Ordered most-specific first — first match wins
const PIECE_DEFAULTS: PieceDefaultEntry[] = [
  {
    matchTerm: 'island',
    width_mm: 900,
    edges: { top: 'pencil_round', bottom: 'pencil_round', left: 'pencil_round', right: 'pencil_round' },
    suggestedCutouts: ['undermount_sink', 'tap_hole', 'hotplate'],
    pieceType: 'island',
  },
  {
    matchTerm: 'vanity',
    width_mm: 500,
    edges: { top: 'arris', bottom: 'arris', left: 'arris', right: 'arris' },
    suggestedCutouts: ['basin', 'tap_hole'],
    pieceType: 'vanity',
  },
  {
    matchTerm: 'splashback',
    width_mm: 100,
    edges: { top: 'polished', bottom: 'arris', left: 'arris', right: 'arris' },
    suggestedCutouts: ['gpo'],
    pieceType: 'splashback',
  },
  {
    matchTerm: 'window_sill',
    width_mm: 200,
    edges: { top: 'arris', bottom: 'arris', left: 'arris', right: 'arris' },
    suggestedCutouts: [],
    pieceType: 'window_sill',
  },
  {
    matchTerm: 'shelf',
    width_mm: 300,
    edges: { top: 'arris', bottom: 'arris', left: 'arris', right: 'arris' },
    suggestedCutouts: [],
    pieceType: 'shelf',
  },
  {
    matchTerm: 'benchtop',
    width_mm: 600,
    edges: { top: 'arris', bottom: 'arris', left: 'arris', right: 'arris' },
    suggestedCutouts: ['undermount_sink', 'tap_hole'],
    pieceType: 'benchtop',
  },
];

// Vanity front edge = pencil_round, others = arris
// Island = pencil_round all 4
// Splashback = polished top, arris others
// Window sill / shelf / benchtop = pencil_round front (bottom), arris others
function applyFrontEdge(entry: PieceDefaultEntry): PieceDefaults {
  const { matchTerm, width_mm, suggestedCutouts, pieceType } = entry;

  if (matchTerm === 'island') {
    return {
      width_mm,
      edges: { top: 'pencil_round', bottom: 'pencil_round', left: 'pencil_round', right: 'pencil_round' },
      suggestedCutouts,
      pieceType,
    };
  }

  if (matchTerm === 'splashback') {
    return {
      width_mm,
      edges: { top: 'polished', bottom: 'arris', left: 'arris', right: 'arris' },
      suggestedCutouts,
      pieceType,
    };
  }

  // For vanity, benchtop, window_sill, shelf: front edge is pencil_round
  // "front" = bottom edge in the standard orientation
  return {
    width_mm,
    edges: { top: 'arris', bottom: 'pencil_round', left: 'arris', right: 'arris' },
    suggestedCutouts,
    pieceType,
  };
}

const UNRECOGNISED_DEFAULTS: PieceDefaults = {
  width_mm: 600,
  edges: { top: 'arris', bottom: 'arris', left: 'arris', right: 'arris' },
  suggestedCutouts: [],
  pieceType: null,
};

export function getPieceDefaults(pieceName: string): PieceDefaults {
  const normalised = pieceName.toLowerCase().replace(/[\s-]/g, '_');

  for (const entry of PIECE_DEFAULTS) {
    if (normalised.includes(entry.matchTerm)) {
      return applyFrontEdge(entry);
    }
  }

  return { ...UNRECOGNISED_DEFAULTS };
}

const ROOM_PIECE_SUGGESTIONS: Record<string, string[]> = {
  kitchen: ['Main Benchtop', 'Island Benchtop', 'Splashback'],
  bathroom: ['Vanity Top', 'Splashback'],
  ensuite: ['Vanity Top', 'Splashback'],
  laundry: ['Benchtop', 'Splashback'],
  'powder room': ['Vanity Top'],
  bar: ['Bar Top', 'Splashback'],
  outdoor: ['BBQ Benchtop'],
  butler: ['Benchtop', 'Splashback'],
};

export function getRoomPieceSuggestions(roomName: string): string[] {
  const normalised = roomName.toLowerCase().trim();

  // Exact match first
  if (ROOM_PIECE_SUGGESTIONS[normalised]) {
    return [...ROOM_PIECE_SUGGESTIONS[normalised]];
  }

  // Substring match
  for (const [key, suggestions] of Object.entries(ROOM_PIECE_SUGGESTIONS)) {
    if (normalised.includes(key) || key.includes(normalised)) {
      return [...suggestions];
    }
  }

  return [];
}

const DEFAULT_ROOM_NAMES = ['Kitchen', 'Bathroom', 'Ensuite', 'Laundry', 'Powder Room'];

export function getDefaultRoomNames(count: number): string[] {
  return DEFAULT_ROOM_NAMES.slice(0, Math.max(0, Math.min(count, DEFAULT_ROOM_NAMES.length)));
}
