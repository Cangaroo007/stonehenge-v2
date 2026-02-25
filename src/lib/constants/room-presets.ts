/**
 * Room Type Presets for Manual Quote Creation (J3)
 *
 * Pre-populated room configurations based on Northcoast defaults
 * and Jay's real quote patterns. These are STARTING POINTS — every
 * dimension is fully editable after quote creation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresetPiece {
  name: string;
  length: number;           // mm
  width: number;            // mm
  thickness: number;        // mm (20 default)
  defaultEdges: {
    top: string;            // e.g. "pencil_round" or "raw"
    bottom: string;
    left: string;
    right: string;
  };
  defaultCutouts: Array<{
    type: string;           // e.g. "Undermount Sink", "Tap Hole"
    quantity: number;
  }>;
}

export interface RoomPreset {
  roomType: string;         // "Kitchen", "Bathroom", etc.
  label: string;            // Display name
  icon: string;             // Lucide icon name
  description: string;
  pieces: PresetPiece[];
}

// ---------------------------------------------------------------------------
// Preset Data — Northcoast defaults + Jay's common configurations
// ---------------------------------------------------------------------------

export const ROOM_PRESETS: RoomPreset[] = [
  {
    roomType: 'Kitchen',
    label: 'Standard Kitchen',
    icon: 'ChefHat',
    description: 'Benchtop with undermount sink and tap hole',
    pieces: [
      {
        name: 'Benchtop',
        length: 2400,
        width: 600,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'arris',
          left: 'arris',
          right: 'arris',
        },
        defaultCutouts: [
          { type: 'Undermount Sink', quantity: 1 },
          { type: 'Tap Hole', quantity: 1 },
        ],
      },
    ],
  },
  {
    roomType: 'Kitchen',
    label: 'Kitchen + Island',
    icon: 'ChefHat',
    description: 'Benchtop and island with standard edges',
    pieces: [
      {
        name: 'Benchtop',
        length: 2400,
        width: 600,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'arris',
          left: 'arris',
          right: 'arris',
        },
        defaultCutouts: [
          { type: 'Undermount Sink', quantity: 1 },
          { type: 'Tap Hole', quantity: 1 },
        ],
      },
      {
        name: 'Island',
        length: 1800,
        width: 900,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'pencil_round',
          left: 'pencil_round',
          right: 'pencil_round',
        },
        defaultCutouts: [],
      },
    ],
  },
  {
    roomType: 'Bathroom',
    label: 'Bathroom',
    icon: 'Bath',
    description: 'Vanity top with basin and tap hole',
    pieces: [
      {
        name: 'Vanity Top',
        length: 1200,
        width: 500,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'arris',
          left: 'arris',
          right: 'arris',
        },
        defaultCutouts: [
          { type: 'Basin', quantity: 1 },
          { type: 'Tap Hole', quantity: 1 },
        ],
      },
    ],
  },
  {
    roomType: 'Ensuite',
    label: 'Ensuite',
    icon: 'Droplets',
    description: 'Vanity top with basin and tap hole',
    pieces: [
      {
        name: 'Vanity Top',
        length: 900,
        width: 500,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'arris',
          left: 'arris',
          right: 'arris',
        },
        defaultCutouts: [
          { type: 'Basin', quantity: 1 },
          { type: 'Tap Hole', quantity: 1 },
        ],
      },
    ],
  },
  {
    roomType: 'Laundry',
    label: 'Laundry',
    icon: 'WashingMachine',
    description: 'Benchtop with drop-in sink and tap hole',
    pieces: [
      {
        name: 'Benchtop',
        length: 1200,
        width: 600,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'arris',
          left: 'arris',
          right: 'arris',
        },
        defaultCutouts: [
          { type: 'Drop-in Sink', quantity: 1 },
          { type: 'Tap Hole', quantity: 1 },
        ],
      },
    ],
  },
  {
    roomType: "Butler's Pantry",
    label: "Butler's Pantry",
    icon: 'Wine',
    description: 'Benchtop with undermount sink and tap hole',
    pieces: [
      {
        name: 'Benchtop',
        length: 1800,
        width: 600,
        thickness: 20,
        defaultEdges: {
          top: 'pencil_round',
          bottom: 'arris',
          left: 'arris',
          right: 'arris',
        },
        defaultCutouts: [
          { type: 'Undermount Sink', quantity: 1 },
          { type: 'Tap Hole', quantity: 1 },
        ],
      },
    ],
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count total pieces across selected presets */
export function countPresetPieces(presets: RoomPreset[]): number {
  return presets.reduce((sum, preset) => sum + preset.pieces.length, 0);
}

/** Convert preset pieces to the batch-create API format */
export function presetToApiPayload(
  presets: RoomPreset[],
  projectName?: string,
  customerId?: number | null,
): {
  projectName: string | null;
  customerId: number | null;
  rooms: Array<{
    name: string;
    pieces: Array<{
      name: string;
      lengthMm: number;
      widthMm: number;
      thicknessMm: number;
      edgeTop: string;
      edgeBottom: string;
      edgeLeft: string;
      edgeRight: string;
      cutouts: Array<{ name: string; quantity: number }>;
    }>;
  }>;
} {
  return {
    projectName: projectName?.trim() || null,
    customerId: customerId ?? null,
    rooms: presets.map((preset) => ({
      name: preset.roomType,
      pieces: preset.pieces.map((piece) => ({
        name: piece.name,
        lengthMm: piece.length,
        widthMm: piece.width,
        thicknessMm: piece.thickness,
        edgeTop: piece.defaultEdges.top,
        edgeBottom: piece.defaultEdges.bottom,
        edgeLeft: piece.defaultEdges.left,
        edgeRight: piece.defaultEdges.right,
        cutouts: piece.defaultCutouts.map((c) => ({
          name: c.type,
          quantity: c.quantity,
        })),
      })),
    })),
  };
}
