/**
 * Finishes Register PDF Parser
 *
 * Uses Claude Vision API to extract unit data from Finishes Register
 * PDF documents. Follows the same calling pattern as spatial-extractor.ts.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getRegisterParserPrompt } from '@/lib/prompts/register-parser';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-5-20250929';

export interface ParsedUnit {
  unitNumber: string;
  level: number | null;
  colourScheme: string | null;
  finishLevel: string | null;
  unitTypeCode: string | null;
  saleStatus: string | null;
  buyerChangeSpec: boolean;
}

export interface ParsedRegister {
  projectName: string | null;
  buildingName: string | null;
  units: ParsedUnit[];
  confidence: number;
  notes: string | null;
}

/**
 * Parse a Finishes Register document using Claude Vision API.
 *
 * Accepts either a single base64 image/PDF or an array for multi-page documents.
 * All pages are sent in a single Claude request so it can combine data across pages.
 */
export async function parseFinishesRegister(
  imageBase64: string | string[],
  mimeType: string
): Promise<ParsedRegister> {
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const systemPrompt = getRegisterParserPrompt();

  // Build content blocks — one image block per page, then the text prompt
  const contentBlocks: Anthropic.Messages.ContentBlockParam[] = [];

  for (const imgData of images) {
    if (mimeType === 'application/pdf') {
      // PDF documents use the 'document' content type
      contentBlocks.push({
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: imgData,
        },
      } as unknown as Anthropic.Messages.ContentBlockParam);
    } else {
      contentBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: mimeType as
            | 'image/jpeg'
            | 'image/png'
            | 'image/gif'
            | 'image/webp',
          data: imgData,
        },
      });
    }
  }

  contentBlocks.push({
    type: 'text',
    text: 'Extract all unit data from this Finishes Register document. Return ONLY valid JSON.',
  });

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8192,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: contentBlocks,
      },
    ],
  });

  // Extract text from response
  const text =
    response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();

  let parsed: ParsedRegister;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse register response: ${text.substring(0, 200)}`
    );
  }

  // Validate and clean the parsed data
  parsed = validateAndClean(parsed);

  return parsed;
}

/**
 * Validate and clean parsed register data.
 * Deduplicates units, normalises strings, and ensures correct types.
 */
function validateAndClean(parsed: ParsedRegister): ParsedRegister {
  const seenUnitNumbers = new Set<string>();
  const deduped: ParsedUnit[] = [];

  for (const unit of parsed.units) {
    // Normalise unit number
    const unitNumber = String(unit.unitNumber ?? '').trim().toUpperCase();
    if (!unitNumber) continue;

    // Deduplicate by unit number
    if (seenUnitNumbers.has(unitNumber)) continue;
    seenUnitNumbers.add(unitNumber);

    deduped.push({
      unitNumber,
      level: normaliseLevel(unit.level, unitNumber),
      colourScheme: normaliseString(unit.colourScheme),
      finishLevel: normaliseString(unit.finishLevel),
      unitTypeCode: normaliseString(unit.unitTypeCode),
      saleStatus: normaliseString(unit.saleStatus),
      buyerChangeSpec: Boolean(unit.buyerChangeSpec),
    });
  }

  return {
    projectName: parsed.projectName || null,
    buildingName: parsed.buildingName || null,
    units: deduped,
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    notes: parsed.notes || null,
  };
}

/**
 * Normalise a level value. If the AI returned null, attempt to infer
 * the level from the unit number (e.g. "1101" → Level 1).
 */
function normaliseLevel(
  level: number | null | undefined,
  unitNumber: string
): number | null {
  if (typeof level === 'number' && !isNaN(level)) {
    return level;
  }

  return inferLevelFromUnitNumber(unitNumber);
}

/**
 * Infer the floor level from an Australian apartment unit number.
 *
 * Common patterns:
 * - "1101" → Level 11 (first digits before last two)
 * - "G05"  → Level 0  (ground floor)
 * - "P2"   → null     (penthouse — level varies by building)
 * - "305"  → Level 3
 */
function inferLevelFromUnitNumber(unitNumber: string): number | null {
  const upper = unitNumber.toUpperCase();

  // Ground floor
  if (upper.startsWith('G')) return 0;

  // Penthouse — can't reliably infer a numeric level
  if (upper.startsWith('P')) return null;

  // Numeric unit numbers: strip non-digit characters
  const digits = upper.replace(/\D/g, '');
  if (!digits) return null;

  if (digits.length === 4) {
    // "1101" → level = first two digits = 11
    return parseInt(digits.substring(0, 2), 10);
  }

  if (digits.length === 3) {
    // "305" → level = first digit = 3
    return parseInt(digits.substring(0, 1), 10);
  }

  if (digits.length === 2) {
    // "05" → level = 0
    return parseInt(digits.substring(0, 1), 10);
  }

  return null;
}

/**
 * Normalise a string value: uppercase, trim, replace spaces with underscores.
 */
function normaliseString(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase().replace(/\s+/g, '_');
}
