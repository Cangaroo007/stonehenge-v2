/**
 * Finishes Register PDF Parser
 *
 * Uses Claude Vision API to adaptively extract unit data from any
 * register-style PDF document, regardless of format or column layout.
 * Follows the same calling pattern as spatial-extractor.ts.
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
  additionalFields: Record<string, string>;
}

export type DetectedProjectType =
  | 'APARTMENTS'
  | 'TOWNHOUSES'
  | 'VILLAS'
  | 'COMMERCIAL'
  | 'MIXED'
  | 'UNKNOWN';

export interface ParsedRegister {
  projectName: string | null;
  buildingName: string | null;
  projectType: DetectedProjectType;
  detectedColumns: string[];
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

  // Build content blocks — one image/document block per page, then the text prompt
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
    text: 'Extract all unit data from this register document. Return ONLY valid JSON.',
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

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse register response: ${text.substring(0, 200)}`
    );
  }

  // Validate and clean the parsed data
  const parsed = validateAndClean(raw);

  return parsed;
}

/**
 * Validate and clean parsed register data.
 * Deduplicates units, normalises strings, and ensures correct types.
 */
function validateAndClean(raw: Record<string, unknown>): ParsedRegister {
  const rawUnits = Array.isArray(raw.units) ? raw.units : [];
  const seenUnitNumbers = new Set<string>();
  const deduped: ParsedUnit[] = [];

  for (const unit of rawUnits) {
    if (typeof unit !== 'object' || unit === null) continue;
    const u = unit as Record<string, unknown>;

    // Normalise unit number
    const unitNumber = String(u.unitNumber ?? '').trim().toUpperCase();
    if (!unitNumber) continue;

    // Deduplicate by unit number
    if (seenUnitNumbers.has(unitNumber)) continue;
    seenUnitNumbers.add(unitNumber);

    // Normalise additionalFields
    let additionalFields: Record<string, string> = {};
    if (
      typeof u.additionalFields === 'object' &&
      u.additionalFields !== null &&
      !Array.isArray(u.additionalFields)
    ) {
      const af = u.additionalFields as Record<string, unknown>;
      for (const [key, val] of Object.entries(af)) {
        if (val != null) {
          additionalFields[key] = String(val);
        }
      }
    }

    deduped.push({
      unitNumber,
      level: normaliseLevel(u.level as number | string | null | undefined, unitNumber),
      colourScheme: normaliseString(u.colourScheme as string | null | undefined),
      finishLevel: normaliseString(u.finishLevel as string | null | undefined),
      unitTypeCode: normaliseString(u.unitTypeCode as string | null | undefined),
      saleStatus: normaliseString(u.saleStatus as string | null | undefined),
      buyerChangeSpec: Boolean(u.buyerChangeSpec),
      additionalFields,
    });
  }

  // Normalise detectedColumns
  const detectedColumns = Array.isArray(raw.detectedColumns)
    ? raw.detectedColumns.map((c: unknown) => String(c))
    : [];

  // Normalise projectType
  const projectType = normaliseProjectType(
    String(raw.projectType ?? 'UNKNOWN')
  );

  return {
    projectName: typeof raw.projectName === 'string' ? raw.projectName : null,
    buildingName:
      typeof raw.buildingName === 'string' ? raw.buildingName : null,
    projectType,
    detectedColumns,
    units: deduped,
    confidence: Math.max(0, Math.min(1, Number(raw.confidence) || 0)),
    notes: typeof raw.notes === 'string' ? raw.notes : null,
  };
}

/**
 * Normalise a level value. Accepts numbers or string representations.
 * If the AI returned null, attempt to infer the level from the unit number.
 */
function normaliseLevel(
  level: number | string | null | undefined,
  unitNumber: string
): number | null {
  if (typeof level === 'number' && !isNaN(level)) {
    return level;
  }

  // Handle string levels like "Ground", "G", "B1"
  if (typeof level === 'string') {
    const upper = level.trim().toUpperCase();
    if (upper === 'GROUND' || upper === 'G') return 0;
    if (upper.startsWith('B') && /^B\d+$/.test(upper)) {
      return -parseInt(upper.substring(1), 10);
    }
    const parsed = parseInt(upper, 10);
    if (!isNaN(parsed)) return parsed;
  }

  return inferLevelFromUnitNumber(unitNumber);
}

/**
 * Infer the floor level from a unit number.
 *
 * Common patterns:
 * - "1101" → Level 11 (first digits before last two)
 * - "G05"  → Level 0  (ground floor)
 * - "P2"   → null     (penthouse — level varies by building)
 * - "305"  → Level 3
 * - "TH01" → null     (townhouse — no level)
 * - "V01"  → null     (villa — no level)
 */
function inferLevelFromUnitNumber(unitNumber: string): number | null {
  const upper = unitNumber.toUpperCase();

  // Ground floor
  if (upper.startsWith('G')) return 0;

  // Penthouse — can't reliably infer a numeric level
  if (upper.startsWith('P')) return null;

  // Townhouse / Villa / Lot — no meaningful level
  if (/^(TH|V|LOT|L|D)\d/i.test(upper)) return null;

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

/**
 * Map AI-detected project type to our supported types.
 */
function normaliseProjectType(value: string): ParsedRegister['projectType'] {
  const upper = value.toUpperCase().replace(/\s+/g, '_');
  const valid: ParsedRegister['projectType'][] = [
    'APARTMENTS',
    'TOWNHOUSES',
    'VILLAS',
    'COMMERCIAL',
    'MIXED',
    'UNKNOWN',
  ];
  if (valid.includes(upper as ParsedRegister['projectType'])) {
    return upper as ParsedRegister['projectType'];
  }
  return 'UNKNOWN';
}
