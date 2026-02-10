/**
 * Material Matcher Service
 *
 * Matches product names extracted from Finishes Schedule documents to
 * materials in the database. Handles discrepancies like "Caesarstone
 * Empira White 5101" vs "Caesarstone - Empira White" in the DB.
 */

import prisma from '@/lib/db';
import type { ParsedStoneSpec } from '@/lib/services/schedule-parser';

export interface MaterialMatch {
  parsedProductName: string; // "Caesarstone Empira White 5101"
  matchedMaterialId: number | null;
  matchedMaterialName: string | null;
  confidence: 'EXACT' | 'PARTIAL' | 'NONE';
}

/**
 * Match parsed stone specs to materials in the database.
 *
 * For each parsed product name:
 *  1. Try exact match (case-insensitive)
 *  2. Try partial match (contains key words)
 *  3. Try matching by brand + product code
 *
 * Returns an array of matches with confidence levels.
 */
export async function matchParsedMaterials(
  parsedSpecs: ParsedStoneSpec[]
): Promise<MaterialMatch[]> {
  // Load all active materials once
  const allMaterials = await prisma.materials.findMany({
    where: { is_active: true },
    select: { id: true, name: true, collection: true },
  });

  // Deduplicate parsed product names to avoid redundant matching
  const uniqueNames = Array.from(
    new Set(parsedSpecs.map((s) => s.productName))
  );

  const results: MaterialMatch[] = [];

  for (const productName of uniqueNames) {
    const match = findBestMatch(productName, allMaterials);
    results.push(match);
  }

  return results;
}

/**
 * Find the best material match for a parsed product name.
 */
function findBestMatch(
  productName: string,
  materials: Array<{ id: number; name: string; collection: string | null }>
): MaterialMatch {
  const normalised = normalise(productName);

  // 1. Exact match (case-insensitive, whitespace-normalised)
  for (const mat of materials) {
    if (normalise(mat.name) === normalised) {
      return {
        parsedProductName: productName,
        matchedMaterialId: mat.id,
        matchedMaterialName: mat.name,
        confidence: 'EXACT',
      };
    }
  }

  // 2. Try matching after stripping common separators (dashes, codes)
  const strippedParsed = stripSeparatorsAndCodes(normalised);
  for (const mat of materials) {
    if (stripSeparatorsAndCodes(normalise(mat.name)) === strippedParsed) {
      return {
        parsedProductName: productName,
        matchedMaterialId: mat.id,
        matchedMaterialName: mat.name,
        confidence: 'EXACT',
      };
    }
  }

  // 3. Partial match — check if all significant words from parsed name appear in material name
  const parsedWords = extractSignificantWords(normalised);
  let bestPartial: {
    id: number;
    name: string;
    score: number;
  } | null = null;

  for (const mat of materials) {
    const matWords = extractSignificantWords(normalise(mat.name));
    // Count how many parsed words appear in the material name
    let matchCount = 0;
    for (const word of parsedWords) {
      if (matWords.includes(word)) {
        matchCount++;
      }
    }

    if (parsedWords.length > 0 && matchCount > 0) {
      const score = matchCount / parsedWords.length;
      if (score >= 0.5 && (!bestPartial || score > bestPartial.score)) {
        bestPartial = { id: mat.id, name: mat.name, score };
      }
    }
  }

  if (bestPartial) {
    return {
      parsedProductName: productName,
      matchedMaterialId: bestPartial.id,
      matchedMaterialName: bestPartial.name,
      confidence: 'PARTIAL',
    };
  }

  // 4. Try matching by collection + any overlapping words
  for (const mat of materials) {
    if (mat.collection) {
      const collNorm = normalise(mat.collection);
      if (normalised.includes(collNorm) || collNorm.includes(normalised)) {
        return {
          parsedProductName: productName,
          matchedMaterialId: mat.id,
          matchedMaterialName: mat.name,
          confidence: 'PARTIAL',
        };
      }
    }
  }

  // No match found
  return {
    parsedProductName: productName,
    matchedMaterialId: null,
    matchedMaterialName: null,
    confidence: 'NONE',
  };
}

/**
 * Normalise a string for comparison: lowercase, collapse whitespace.
 */
function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Strip common separators (dashes, em-dashes, numeric product codes)
 * for fuzzy comparison.
 * e.g. "caesarstone - empira white" → "caesarstone empira white"
 * e.g. "caesarstone empira white 5101" → "caesarstone empira white"
 */
function stripSeparatorsAndCodes(value: string): string {
  return value
    .replace(/[-–—]/g, ' ') // strip dashes
    .replace(/\b\d{3,5}\b/g, '') // strip 3-5 digit product codes
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extract significant words from a string, filtering out short/common words.
 */
function extractSignificantWords(value: string): string[] {
  return value
    .replace(/[-–—]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 3)
    .filter(
      (w) =>
        !['the', 'and', 'for', 'with', 'stone', 'series'].includes(w)
    );
}
