import prisma from '@/lib/db';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PresetPieceConfig {
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  edges: {
    top: string;
    bottom: string;
    left: string;
    right: string;
  };
  cutouts: Array<{
    type: string;
    quantity: number;
  }>;
}

export interface CustomRoomPreset {
  id: string;
  company_id: number;
  name: string;
  icon: string | null;
  description: string | null;
  piece_config: PresetPieceConfig[];
  usage_count: number;
  last_used_at: Date;
  created_at: Date;
  updated_at: Date;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Normalise room name: trim whitespace and convert to title case */
function normaliseName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

/** Generate a description from piece names: "3 pieces — benchtop, corner, return" */
function generateDescription(pieces: PresetPieceConfig[]): string {
  const count = pieces.length;
  const names = pieces.map((p) => p.name).join(', ');
  return `${count} ${count === 1 ? 'piece' : 'pieces'} — ${names}`;
}

/** Check if a room name is generic (e.g. "Room 1", "Room 2") */
function isGenericName(name: string): boolean {
  const trimmed = name.trim();
  if (trimmed.length < 3) return true;
  return /^Room\s+\d+$/i.test(trimmed);
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

/**
 * Save a room configuration as a custom preset.
 * Called automatically when a quote is created.
 *
 * - If a preset with this name already exists for the company:
 *   increment usage_count, update last_used_at, optionally update
 *   piece_config if the new version has more pieces.
 * - If new: create with usage_count 1.
 */
export async function saveRoomAsPreset(
  companyId: number,
  roomName: string,
  pieces: PresetPieceConfig[],
): Promise<void> {
  // Don't save generic names or rooms with zero pieces
  if (isGenericName(roomName) || pieces.length === 0) return;

  const normalised = normaliseName(roomName);
  const description = generateDescription(pieces);

  // Check if a preset with this name already exists for the company
  const existing = await prisma.custom_room_presets.findFirst({
    where: {
      company_id: companyId,
      name: normalised,
    },
  });

  if (existing) {
    // Prefer the richer configuration (more pieces)
    const existingPieces = existing.piece_config as unknown as PresetPieceConfig[];
    const shouldUpdateConfig = pieces.length > existingPieces.length;

    await prisma.custom_room_presets.update({
      where: { id: existing.id },
      data: {
        usage_count: { increment: 1 },
        last_used_at: new Date(),
        ...(shouldUpdateConfig
          ? {
              piece_config: pieces as unknown as Parameters<typeof prisma.custom_room_presets.update>[0]['data']['piece_config'],
              description,
            }
          : {}),
      },
    });
  } else {
    await prisma.custom_room_presets.create({
      data: {
        company_id: companyId,
        name: normalised,
        description,
        piece_config: pieces as unknown as Parameters<typeof prisma.custom_room_presets.create>[0]['data']['piece_config'],
        usage_count: 1,
        last_used_at: new Date(),
      },
    });
  }
}

/**
 * Get the most popular custom presets for a company, sorted by usage_count desc.
 */
export async function getPopularPresets(
  companyId: number,
  limit = 6,
): Promise<CustomRoomPreset[]> {
  const rows = await prisma.custom_room_presets.findMany({
    where: { company_id: companyId },
    orderBy: { usage_count: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    ...r,
    piece_config: r.piece_config as unknown as PresetPieceConfig[],
  }));
}

/**
 * Search custom presets by name (case-insensitive contains).
 */
export async function searchPresets(
  companyId: number,
  query: string,
  limit = 10,
): Promise<CustomRoomPreset[]> {
  const trimmed = query.trim();
  if (!trimmed) return getPopularPresets(companyId, limit);

  const rows = await prisma.custom_room_presets.findMany({
    where: {
      company_id: companyId,
      name: { contains: trimmed, mode: 'insensitive' },
    },
    orderBy: { usage_count: 'desc' },
    take: limit,
  });

  return rows.map((r) => ({
    ...r,
    piece_config: r.piece_config as unknown as PresetPieceConfig[],
  }));
}

/**
 * Delete a custom preset (company-scoped).
 */
export async function deletePreset(
  companyId: number,
  presetId: string,
): Promise<boolean> {
  const preset = await prisma.custom_room_presets.findFirst({
    where: { id: presetId, company_id: companyId },
  });
  if (!preset) return false;

  await prisma.custom_room_presets.delete({ where: { id: presetId } });
  return true;
}

/**
 * Extract piece configs from a batch-create room payload.
 * Maps the API's camelCase field names to PresetPieceConfig format.
 */
export function extractPieceConfigs(
  pieces: Array<{
    name: string;
    length_mm: number;
    width_mm: number;
    thickness_mm: number;
    edge_top?: string | null;
    edge_bottom?: string | null;
    edge_left?: string | null;
    edge_right?: string | null;
    cutouts?: unknown;
  }>,
): PresetPieceConfig[] {
  return pieces.map((p) => ({
    name: p.name,
    length_mm: p.length_mm,
    width_mm: p.width_mm,
    thickness_mm: p.thickness_mm,
    edges: {
      top: p.edge_top || 'raw',
      bottom: p.edge_bottom || 'raw',
      left: p.edge_left || 'raw',
      right: p.edge_right || 'raw',
    },
    cutouts: Array.isArray(p.cutouts)
      ? (p.cutouts as Array<{ name?: string; type?: string; quantity?: number }>).map((c) => ({
          type: c.name || c.type || '',
          quantity: c.quantity ?? 1,
        }))
      : [],
  }));
}

/**
 * Get the total count of custom presets for a company.
 */
export async function getPresetCount(companyId: number): Promise<number> {
  return prisma.custom_room_presets.count({
    where: { company_id: companyId },
  });
}
