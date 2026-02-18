import { edgeCode, cutoutLabel } from '@/lib/utils/edge-utils';

/**
 * Auto-generates a human-readable piece description from its attributes.
 *
 * Example output:
 * "2600 × 900mm 20mm Caesarstone Pure White island bench, PR on front and back, BN on left, UMS ×1, HP ×1"
 */
export function generatePieceDescription(piece: {
  name?: string;
  length_mm?: number;
  width_mm?: number;
  thickness?: number;
  material_name?: string;
  edge_top?: string | null;
  edge_bottom?: string | null;
  edge_left?: string | null;
  edge_right?: string | null;
  cutouts?: Array<{ type?: string; name?: string; cutout_type?: string; quantity?: number }>;
}): string {
  const parts: string[] = [];

  // Dimensions
  if (piece.length_mm && piece.width_mm) {
    parts.push(`${piece.length_mm} × ${piece.width_mm}mm`);
  }

  // Thickness
  if (piece.thickness) {
    parts.push(`${piece.thickness}mm`);
  }

  // Material
  if (piece.material_name) {
    parts.push(piece.material_name);
  }

  // Piece name (lowercase for natural flow)
  if (piece.name) {
    parts.push(piece.name.toLowerCase());
  }

  // Build description base
  let desc = parts.join(' ');

  // Edges — group same profiles together
  // e.g., "PR on front and back, BN on left"
  const edgeMap: Record<string, string[]> = {};
  const sides = [
    { side: 'front', profile: piece.edge_top },
    { side: 'back', profile: piece.edge_bottom },
    { side: 'left', profile: piece.edge_left },
    { side: 'right', profile: piece.edge_right },
  ];

  for (const { side, profile } of sides) {
    if (profile && profile.toLowerCase() !== 'raw') {
      const code = edgeCode(profile);
      if (code !== 'RAW') {
        if (!edgeMap[code]) edgeMap[code] = [];
        edgeMap[code].push(side);
      }
    }
  }

  const edgeParts = Object.entries(edgeMap).map(([code, edgeSides]) => {
    if (edgeSides.length === 1) return `${code} on ${edgeSides[0]}`;
    if (edgeSides.length === 2) return `${code} on ${edgeSides[0]} and ${edgeSides[1]}`;
    return `${code} on ${edgeSides.join(', ')}`;
  });

  if (edgeParts.length > 0) {
    desc += ', ' + edgeParts.join(', ');
  }

  // Cutouts
  const cutoutParts: string[] = [];
  for (const c of piece.cutouts || []) {
    const type = c.type || c.name || c.cutout_type || 'unknown';
    const label = cutoutLabel(type);
    const qty = c.quantity || 1;
    cutoutParts.push(`${label} ×${qty}`);
  }

  if (cutoutParts.length > 0) {
    desc += ', ' + cutoutParts.join(', ');
  }

  return desc;
}
