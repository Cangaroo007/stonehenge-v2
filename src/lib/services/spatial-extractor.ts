import Anthropic from '@anthropic-ai/sdk';
import { ElevationAnalysis, StoneFace } from '@/lib/types/drawing-analysis';
import {
  ELEVATION_EXTRACTION_SYSTEM_PROMPT,
  ELEVATION_EXTRACTION_USER_PROMPT,
} from '@/lib/prompts/extraction-elevation';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-5-20250929';

/**
 * Extract stone face areas from an architectural elevation drawing.
 * Uses Claude Vision to identify stone cladding, openings, and dimensions.
 */
export async function extractElevationAreas(
  imageBase64: string,
  mimeType: string
): Promise<ElevationAnalysis> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 4096,
    system: ELEVATION_EXTRACTION_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: {
              type: 'base64',
              media_type: mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: imageBase64,
            },
          },
          { type: 'text', text: ELEVATION_EXTRACTION_USER_PROMPT },
        ],
      },
    ],
  });

  const text = response.content[0].type === 'text' ? response.content[0].text : '';
  const jsonStr = text.replace(/```json\n?|\n?```/g, '').trim();

  let parsed: ElevationAnalysis;
  try {
    parsed = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse elevation analysis response: ${text.substring(0, 200)}`);
  }

  // Validate and recalculate net areas to ensure correctness
  parsed.stoneFaces = parsed.stoneFaces.map(recalculateNetArea);

  return parsed;
}

/**
 * Recalculate net area from gross dimensions minus openings.
 * Don't trust the AI's arithmetic — verify it.
 */
function recalculateNetArea(face: StoneFace): StoneFace {
  const grossArea_sqm =
    (face.grossDimensions.width * face.grossDimensions.height) / 1_000_000;

  const totalOpeningArea_sqm = face.openings.reduce((sum, opening) => {
    return sum + (opening.dimensions.width * opening.dimensions.height) / 1_000_000;
  }, 0);

  return {
    ...face,
    netArea_sqm: Math.max(0, grossArea_sqm - totalOpeningArea_sqm),
  };
}
