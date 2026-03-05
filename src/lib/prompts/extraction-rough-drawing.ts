import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';

export function buildRoughDrawingSystemPrompt(
  catalogue: DrawingCatalogue
): string {
  const materialList = catalogue.materials
    .map(m => `- ${m.name}`)
    .join('\n');

  const edgeTypeList = catalogue.edgeTypes
    .map(e => `- ${e.name}${e.code ? ` (${e.code})` : ''}`)
    .join('\n');

  return `You are reviewing a hand-drawn or rough sketch for stone benchtop fabrication. The initial extraction has already been run. Your job is to generate clarification questions for EVERY dimension on EVERY piece — not just uncertain ones.

## WHY THIS MATTERS
Hand-drawn dimensions are unreliable even when they appear clear. A dimension that looks like "600" might be "900" at a different scale. It is always better to confirm than to assume.

## RULES FOR ROUGH DRAWING QUESTIONS
- Generate a CRITICAL question for EVERY length and width, even if
  the initial extraction was HIGH confidence
- Generate an IMPORTANT question for thickness on every piece
- Generate an IMPORTANT question for material on every piece if not
  specified in the drawing
- Use ONLY these materials from the tenant catalogue:
${materialList || '- No materials configured'}
- Use ONLY these edge types from the tenant catalogue:
${edgeTypeList || '- No edge types configured'}
- Never generate duplicate questions for the same piece + field

## OPENING MESSAGE
Set a top-level field "roughDrawingMessage" in your response:
"This looks like a hand sketch — I'll ask you a few quick questions to make sure the measurements are right before we start the quote."

## OUTPUT — Return ONLY valid JSON, no other text:
{
  "roughDrawingMessage": "string",
  "clarificationQuestions": [
    {
      "id": "piece-1-length",
      "pieceId": "piece-1",
      "fieldPath": "length",
      "category": "DIMENSION",
      "priority": "CRITICAL",
      "question": "What is the length of [piece name]?",
      "aiSuggestion": "3600",
      "aiSuggestionConfidence": 0.6,
      "options": null,
      "allowFreeText": true,
      "unit": "mm"
    }
  ]
}`;
}

export function buildVerbalTakeoffPrompt(
  catalogue: DrawingCatalogue
): string {
  const materialList = catalogue.materials
    .map(m => `- ${m.name}${m.collection ? ` (${m.collection})` : ''}`)
    .join('\n');

  const edgeTypeList = catalogue.edgeTypes
    .map(e => `- ${e.name}${e.code ? ` (${e.code})` : ''}`)
    .join('\n');

  const cutoutTypeList = catalogue.cutoutTypes
    .map(c => `- ${c.name}`)
    .join('\n');

  return `You are parsing a plain-English description of a stone benchtop fabrication job into structured piece data.

## TENANT CATALOGUE
Use ONLY these materials:
${materialList || '- No materials configured'}

Use ONLY these edge types:
${edgeTypeList || '- No edge types configured'}

Use ONLY these cutout types:
${cutoutTypeList || '- No cutout types configured'}

## PARSING RULES
- Extract one piece per bench/surface mentioned
- Dimensions: look for patterns like "3600 x 600", "3.6m x 600mm",
  "3600 by 600" — always convert to millimetres
- Thickness: default 20mm unless "40mm" or "waterfall" mentioned
- Room: infer from context ("kitchen", "bathroom", "laundry") or
  default to "Kitchen"
- Edge finish: match to catalogue. Common shorthand:
  "pencil round" = match closest in catalogue
  "polished" = match closest in catalogue
  "raw" or "unfinished" = match closest in catalogue
- Cutouts: "undermount sink", "drop-in sink", "cooktop",
  "hotplate", "tap hole", "gpo" — match to catalogue
- If a value cannot be determined, set it to null

## OUTPUT — Return ONLY valid JSON:
{
  "pieces": [
    {
      "id": "piece-1",
      "pieceNumber": 1,
      "name": "Kitchen Bench",
      "shape": "RECTANGLE",
      "length": 3600,
      "width": 600,
      "thickness": 20,
      "room": "Kitchen",
      "confidence": 0.9,
      "cutouts": [{ "type": "UNDERMOUNT_SINK" }],
      "edgeSelections": {},
      "isEditing": false,
      "notes": null
    }
  ],
  "parseNotes": "Detected 1 piece. Thickness defaulted to 20mm."
}`;
}
