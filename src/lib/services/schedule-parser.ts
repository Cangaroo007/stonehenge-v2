/**
 * Finishes Schedule PDF Parser
 *
 * Uses Claude Vision API to extract stone-relevant material specifications
 * from Finishes Schedule documents. Follows the same calling pattern as
 * register-parser.ts.
 */

import Anthropic from '@anthropic-ai/sdk';
import { getScheduleParserPrompt } from '@/lib/prompts/schedule-parser';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-5-20250929';

export interface ParsedStoneSpec {
  application: string; // BENCHTOP, SPLASHBACK, VANITY, etc.
  productName: string; // "Caesarstone Empira White 5101"
  thickness_mm: number;
  edgeProfile: string | null; // "PENCIL_ROUND", "BULLNOSE", etc.
  notes: string | null;
}

export interface ParsedFixture {
  type: string; // UNDERMOUNT_SINK, COOKTOP, etc.
  notes: string | null;
}

export interface ParsedScheduleRoom {
  roomName: string; // KITCHEN, BATHROOM, ENSUITE, LAUNDRY
  stoneSpecs: ParsedStoneSpec[];
  fixtures: ParsedFixture[];
}

export interface ParsedSchedule {
  finishLevel: string | null;
  colourScheme: string | null;
  documentTitle: string | null;
  rooms: ParsedScheduleRoom[];
  nonStoneAreas: string[];
  confidence: number;
  notes: string | null;
}

/**
 * Parse a Finishes Schedule document using Claude Vision API.
 *
 * Accepts either a single base64 image/PDF or an array for multi-page documents.
 * All pages are sent in a single Claude request so it can combine data across pages.
 */
export async function parseFinishesSchedule(
  imageBase64: string | string[],
  mimeType: string
): Promise<ParsedSchedule> {
  const images = Array.isArray(imageBase64) ? imageBase64 : [imageBase64];
  const systemPrompt = getScheduleParserPrompt();

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
    text: 'Extract all stone/benchtop-related specifications from this Finishes Schedule document. Return ONLY valid JSON.',
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

  let parsed: ParsedSchedule;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(
      `Failed to parse schedule response: ${text.substring(0, 200)}`
    );
  }

  // Validate and clean the parsed data
  parsed = validateAndClean(parsed);

  return parsed;
}

/**
 * Validate and clean parsed schedule data.
 * Normalises strings, defaults missing values, and ensures correct types.
 */
function validateAndClean(parsed: ParsedSchedule): ParsedSchedule {
  const rooms: ParsedScheduleRoom[] = [];

  for (const room of parsed.rooms ?? []) {
    const roomName = normaliseUpperCase(room.roomName);
    if (!roomName) continue;

    const stoneSpecs: ParsedStoneSpec[] = [];
    for (const spec of room.stoneSpecs ?? []) {
      if (!spec.productName) continue;
      stoneSpecs.push({
        application: normaliseUpperCase(spec.application) || 'CUSTOM',
        productName: normaliseTitleCase(spec.productName),
        thickness_mm:
          typeof spec.thickness_mm === 'number' && spec.thickness_mm > 0
            ? spec.thickness_mm
            : 20,
        edgeProfile: normaliseEdgeProfile(spec.edgeProfile),
        notes: spec.notes || null,
      });
    }

    const fixtures: ParsedFixture[] = [];
    for (const fixture of room.fixtures ?? []) {
      if (!fixture.type) continue;
      fixtures.push({
        type: normaliseUpperCase(fixture.type) || 'CUSTOM',
        notes: fixture.notes || null,
      });
    }

    rooms.push({
      roomName,
      stoneSpecs,
      fixtures,
    });
  }

  return {
    finishLevel: normaliseUpperCase(parsed.finishLevel),
    colourScheme: normaliseUpperCase(parsed.colourScheme),
    documentTitle: parsed.documentTitle || null,
    rooms,
    nonStoneAreas: Array.isArray(parsed.nonStoneAreas)
      ? parsed.nonStoneAreas.filter(Boolean)
      : [],
    confidence: Math.max(0, Math.min(1, Number(parsed.confidence) || 0)),
    notes: parsed.notes || null,
  };
}

/**
 * Normalise a string to UPPERCASE with underscores replacing spaces.
 */
function normaliseUpperCase(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase().replace(/\s+/g, '_');
}

/**
 * Normalise a product name to Title Case.
 */
function normaliseTitleCase(value: string): string {
  return String(value)
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Normalise edge profile names to UPPERCASE with underscores.
 */
function normaliseEdgeProfile(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  return trimmed.toUpperCase().replace(/\s+/g, '_');
}
