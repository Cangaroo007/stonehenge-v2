import { RelationshipType } from '@prisma/client';
import type { RelationshipSuggestion } from '@/lib/types/piece-relationship';

interface SuggestPiece {
  id: string;
  description: string;
  piece_type: string | null;
  length_mm: number;
  width_mm: number;
  room_name: string | null;
}

interface ExistingPair {
  parentPieceId: string;
  childPieceId: string;
}

/**
 * Checks whether a relationship already exists between two pieces (in either direction).
 */
function pairExists(
  a: string,
  b: string,
  existing: ExistingPair[]
): boolean {
  return existing.some(
    (e) =>
      (e.parentPieceId === a && e.childPieceId === b) ||
      (e.parentPieceId === b && e.childPieceId === a)
  );
}

/**
 * Guesses LEFT or RIGHT position from description keywords.
 */
function guessLeftRight(description: string): string | null {
  const lower = description.toLowerCase();
  if (lower.includes('left') || lower.includes('lhs')) return 'LEFT';
  if (lower.includes('right') || lower.includes('rhs')) return 'RIGHT';
  return null;
}

/**
 * Checks if a piece type matches one of the given types (case-insensitive).
 */
function typeIs(pieceType: string | null, ...types: string[]): boolean {
  if (!pieceType) return false;
  const upper = pieceType.toUpperCase();
  return types.some((t) => upper === t.toUpperCase());
}

/**
 * Returns true if two values are within the given tolerance.
 */
function withinTolerance(a: number, b: number, tolerance: number): boolean {
  return Math.abs(a - b) <= tolerance;
}

/**
 * Generates relationship suggestions based on piece attributes and spatial rules.
 *
 * Rules (ordered by confidence):
 * HIGH:   1. SPLASHBACK → BENCHTOP (same room)
 *         2. WATERFALL → BENCHTOP/ISLAND (same room, width match)
 * MEDIUM: 3. RETURN — two benchtops, same room, one dimension matches (±50mm)
 *         4. MITRE_JOIN — description contains 'mitre'/'miter'/'mitred'
 * LOW:    5. BUTT_JOIN — same room, no relationships, similar widths (±100mm)
 */
export function suggestRelationships(
  pieces: SuggestPiece[],
  existingRelationships: ExistingPair[]
): RelationshipSuggestion[] {
  const suggestions: RelationshipSuggestion[] = [];

  // Index pieces that already have at least one relationship
  const piecesWithRelationships = new Set<string>();
  for (const rel of existingRelationships) {
    piecesWithRelationships.add(rel.parentPieceId);
    piecesWithRelationships.add(rel.childPieceId);
  }

  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const a = pieces[i];
      const b = pieces[j];

      // Skip if not in the same room (null-guard both sides)
      if (!a.room_name || !b.room_name || a.room_name !== b.room_name) continue;

      // Skip if relationship already exists between this pair
      if (pairExists(a.id, b.id, existingRelationships)) continue;

      // ── HIGH: SPLASHBACK → BENCHTOP ────────────────────────────────
      if (typeIs(a.piece_type, 'SPLASHBACK') && typeIs(b.piece_type, 'BENCHTOP', 'ISLAND')) {
        suggestions.push({
          parentPieceId: b.id,   // benchtop is parent
          childPieceId: a.id,    // splashback is child
          suggestedType: 'SPLASHBACK' as RelationshipType,
          suggestedPosition: 'BACK',
          confidence: 'HIGH',
          reason: 'Splashback typically sits behind benchtop',
        });
      } else if (typeIs(b.piece_type, 'SPLASHBACK') && typeIs(a.piece_type, 'BENCHTOP', 'ISLAND')) {
        suggestions.push({
          parentPieceId: a.id,
          childPieceId: b.id,
          suggestedType: 'SPLASHBACK' as RelationshipType,
          suggestedPosition: 'BACK',
          confidence: 'HIGH',
          reason: 'Splashback typically sits behind benchtop',
        });
      }

      // ── HIGH: WATERFALL → BENCHTOP/ISLAND ──────────────────────────
      if (typeIs(a.piece_type, 'WATERFALL') && typeIs(b.piece_type, 'BENCHTOP', 'ISLAND')) {
        if (withinTolerance(a.width_mm, b.width_mm, 50)) {
          const position = guessLeftRight(a.description) ?? guessLeftRight(b.description);
          suggestions.push({
            parentPieceId: b.id,
            childPieceId: a.id,
            suggestedType: 'WATERFALL' as RelationshipType,
            suggestedPosition: position,
            confidence: 'HIGH',
            reason: 'Waterfall drops from benchtop edge',
          });
        }
      } else if (typeIs(b.piece_type, 'WATERFALL') && typeIs(a.piece_type, 'BENCHTOP', 'ISLAND')) {
        if (withinTolerance(b.width_mm, a.width_mm, 50)) {
          const position = guessLeftRight(b.description) ?? guessLeftRight(a.description);
          suggestions.push({
            parentPieceId: a.id,
            childPieceId: b.id,
            suggestedType: 'WATERFALL' as RelationshipType,
            suggestedPosition: position,
            confidence: 'HIGH',
            reason: 'Waterfall drops from benchtop edge',
          });
        }
      }

      // ── MEDIUM: RETURN (L-shape) ───────────────────────────────────
      if (typeIs(a.piece_type, 'BENCHTOP') && typeIs(b.piece_type, 'BENCHTOP')) {
        const dimensionMatch =
          withinTolerance(a.length_mm, b.length_mm, 50) ||
          withinTolerance(a.length_mm, b.width_mm, 50) ||
          withinTolerance(a.width_mm, b.length_mm, 50) ||
          withinTolerance(a.width_mm, b.width_mm, 50);

        if (dimensionMatch) {
          suggestions.push({
            parentPieceId: a.id,
            childPieceId: b.id,
            suggestedType: 'RETURN' as RelationshipType,
            suggestedPosition: null,
            confidence: 'MEDIUM',
            reason: 'Benchtops with matching dimension may form L-shape',
          });
        }
      }

      // ── MEDIUM: MITRE_JOIN (description keyword) ───────────────────
      const aDesc = a.description.toLowerCase();
      const bDesc = b.description.toLowerCase();
      const aMitre = /mitr[ei]d?/.test(aDesc);
      const bMitre = /mitr[ei]d?/.test(bDesc);

      if (aMitre || bMitre) {
        // Suggest join with the other piece (or the larger piece if both mention mitre)
        const parent = a.length_mm * a.width_mm >= b.length_mm * b.width_mm ? a : b;
        const child = parent === a ? b : a;
        // Avoid duplicate if we already suggested RETURN for this pair
        const alreadySuggested = suggestions.some(
          (s) =>
            (s.parentPieceId === a.id && s.childPieceId === b.id) ||
            (s.parentPieceId === b.id && s.childPieceId === a.id)
        );
        if (!alreadySuggested) {
          suggestions.push({
            parentPieceId: parent.id,
            childPieceId: child.id,
            suggestedType: 'MITRE_JOIN' as RelationshipType,
            suggestedPosition: null,
            confidence: 'MEDIUM',
            reason: 'Description mentions mitre join',
          });
        }
      }

      // ── LOW: BUTT_JOIN (fallback) ──────────────────────────────────
      const neitherHasRelationship =
        !piecesWithRelationships.has(a.id) && !piecesWithRelationships.has(b.id);
      const alreadySuggestedPair = suggestions.some(
        (s) =>
          (s.parentPieceId === a.id && s.childPieceId === b.id) ||
          (s.parentPieceId === b.id && s.childPieceId === a.id)
      );

      if (
        neitherHasRelationship &&
        !alreadySuggestedPair &&
        withinTolerance(a.width_mm, b.width_mm, 100)
      ) {
        suggestions.push({
          parentPieceId: a.id,
          childPieceId: b.id,
          suggestedType: 'BUTT_JOIN' as RelationshipType,
          suggestedPosition: null,
          confidence: 'LOW',
          reason: 'Adjacent pieces may need joining',
        });
      }
    }
  }

  // Sort by confidence: HIGH → MEDIUM → LOW
  const order: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
  suggestions.sort((a, b) => order[a.confidence] - order[b.confidence]);

  return suggestions;
}
