export const maxDuration = 300;

import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';
import { buildRoughDrawingSystemPrompt } from '@/lib/prompts/extraction-rough-drawing';
import { ClarificationQuestion } from '@/lib/types/drawing-analysis';
import { DRAWING_FILE_LABEL, isAllowedDrawingFile, resolveDrawingMimeType } from '@/lib/drawing-file-types';

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

// Anthropic's image size limit is 5MB, PDF limit is 32MB
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const MAX_PDF_SIZE = 32 * 1024 * 1024; // 32MB in bytes

async function compressImage(buffer: Buffer, mimeType: string): Promise<{ data: Buffer; mediaType: string }> {
  // Get image metadata to determine dimensions
  const metadata = await sharp(buffer).metadata();

  let sharpInstance = sharp(buffer);

  // Calculate target dimensions - max 4096px on longest side while maintaining aspect ratio
  const maxDimension = 4096;
  if (metadata.width && metadata.height) {
    const longestSide = Math.max(metadata.width, metadata.height);
    if (longestSide > maxDimension) {
      sharpInstance = sharpInstance.resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    }
  }

  // Convert to JPEG for better compression (unless it's a PNG with transparency we need to preserve)
  // For technical drawings, JPEG at quality 85 provides good balance
  const outputBuffer = await sharpInstance
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return {
    data: outputBuffer,
    mediaType: 'image/jpeg',
  };
}

function isPdfFile(mimeType: string): boolean {
  return mimeType === 'application/pdf';
}

function isClaudeImageMimeType(mimeType: string): mimeType is 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp' {
  return mimeType === 'image/png' || mimeType === 'image/jpeg' || mimeType === 'image/gif' || mimeType === 'image/webp';
}

async function convertImageForClaude(buffer: Buffer): Promise<{ data: Buffer; mediaType: 'image/jpeg' }> {
  const data = await sharp(buffer)
    .rotate()
    .jpeg({ quality: 85, mozjpeg: true })
    .toBuffer();

  return { data, mediaType: 'image/jpeg' };
}

interface LearningRule {
  field_name: string;
  correct_value: string;
  drawing_type: string | null;
  condition: string | null;
  correction_count: number;
}

interface LearningExample {
  source_quote_number: string | null;
  source_system: string | null;
  expected_data: unknown;
  extracted_data: unknown;
  comparison_data: unknown;
  notes: string | null;
}

function compactJson(value: unknown, maxLength = 900): string {
  if (value == null) return 'null';
  const json = JSON.stringify(value);
  return json.length > maxLength ? `${json.slice(0, maxLength)}...` : json;
}

function buildSystemPrompt(
  catalogue: DrawingCatalogue,
  learningRules: LearningRule[] = [],
  learningExamples: LearningExample[] = []
): string {
  const materialList = catalogue.materials
    .map(m => `- ${m.name}${m.collection ? ` (${m.collection})` : ''}`)
    .join('\n');

  const edgeTypeList = catalogue.edgeTypes
    .map(e => `- ${e.name}${e.code ? ` (code: ${e.code})` : ''}`)
    .join('\n');

  const cutoutTypeList = catalogue.cutoutTypes
    .map(c => `- ${c.name}`)
    .join('\n');

  return `You are an expert stone benchtop fabricator analysing drawings to extract piece specifications for quoting.

## CORE PRINCIPLE — GEOMETRY-FIRST, REVIEW-GATED
For imported drawings, create a best-supported spatial draft first, then mark uncertainty loudly. Do not invent final fabrication facts, but do make provisional geometry assumptions when the outline is visible enough to render. Any assumed dimension, room label, split, join, material, or edge finish must have confidence below 0.85 and a clarification question with sourceHint/sourceRegion where possible. "I assumed this from the drawing so the mason can correct it" is better than a blank rectangle that hides the problem.

## MANDATORY MEASUREMENT-LED GEOMETRY PASS
Before producing quote pieces, perform this reasoning pass internally and reflect the results in notes/sourceHint/pageReview:
1. Transcribe every readable dimension label in the relevant drawing region. Keep the labels attached to the edge/run they describe. Do not ignore small dimensions around angled corners.
2. Build a connected outline from those dimensions in millimetres. Prefer a coherent polygon over disconnected rectangles when the drawing shows counters joined by angled/splayed/chamfered corners.
3. Use dimension arithmetic before asking the user. If a total run and sub-runs are labelled, solve the missing segment. If a diagonal/angled connector is bounded by horizontal/vertical offsets, use the visible dimensions to create the best polygon and mark inferred vertices below 0.85.
4. Use standard benchtop depths only as anchors when the drawing supports them: kitchen wall runs are commonly 600-700mm deep, islands commonly 900mm deep, vanities 460-520mm deep. Mark these as inferred if not printed.
5. Only after the measured outline is coherent should you split it into fabrication pieces. If a split is not shown, keep the visible connected angled run as one POLYGON draft and ask where the mason wants joins.
6. Never turn an angled corner into a generic "return section" rectangle unless the drawing clearly shows a separate rectangular return piece.
7. For complex kitchens, create the whole connected benchtop assembly first in metadata.spatialAssemblies, then derive the physical fabrication pieces from it. The assembly is the finished counter footprint a mason can visually inspect; the pieces are the manufacturable parts/cut list.
8. If a wraparound counter will require several physical pieces, preserve suggested cut/join lines in metadata.spatialAssemblies.cutLines. Do this even when the quote rows below are split into separate pieces.

For Law-style kitchens and similar hand-marked angled runs:
- Treat labels such as 2350, 2197, 1920, 725, 620, 600 around an angled bay as source dimensions for one connected polygon, not as separate unrelated rectangles.
- A splayed sink/cooktop bay with two angled sides must be represented as a POLYGON with the angled vertices visible in shapeConfig.
- The upstairs/downstairs Law pattern is not an L-shape: it is a connected assembly with angled/chamfered bays and separate straight/irregular fabrication pieces. Build the connected footprint first, then split at visible or best-practice joins.
- If the exact diagonal length is not labelled but surrounding offsets are readable, infer the diagonal using the surrounding geometry, set confidence below 0.85, and ask the user to confirm in the spatial geometry editor.
- If the model cannot reconcile dimensions into a closed polygon, return the closest closed polygon and a CRITICAL clarification question saying which edge or angle failed to reconcile.

## TENANT CATALOGUE
Use ONLY these values when generating clarification question options. Do not invent options not in this list.

### Available Materials:
${materialList || '- No materials configured yet'}

### Available Edge Types:
${edgeTypeList || '- No edge types configured yet'}

### Available Cutout Types:
${cutoutTypeList || '- No cutout types configured yet'}

## WHAT TO EXTRACT

### File coverage:
- Treat the current uploaded file as a source drawing that must be accounted for, even when it is part of a multi-file quote package.
- If the file contains any stone-relevant plan, sketch, elevation, marked-up page, or schedule, return the pieces/specs from that file. Do not assume another uploaded file will cover it.
- If you genuinely find zero quote-ready stone pieces, return a warning explaining exactly why, e.g. "No stone pieces found: this page is cabinetry elevations only" or "No tops found: file is colour selection only".
- If a file contains multiple drawings/pages, inspect each page and mention every page in metadata.pageReview. A page with no extracted pieces still needs a pageReview reason.

### Page-by-page source review:
- Inspect every page in the uploaded document before extracting pieces.
- Treat specification/scope pages as equal priority to drawings. They often contain material, thickness, finish, apron/build-up and exclusion notes that are not repeated on plan pages.
- Return pageReview notes in metadata or warnings summarising what each page contributed, especially when a page changes material/thickness/finish assumptions.
- Do not stop after finding a floor plan. If later pages contain joinery notes, colour legends, finish schedules or marked-up screenshots, apply those details to the pieces.

### Job Metadata (if visible):
- Job Number
- Default Thickness (usually 20mm or 40mm)
- Drawing scale, if visible, such as 1:100 or 1:50
- Colour legend or scope legend, if visible, such as blue = stone and orange = laminate

### For Each Quote-Ready Stone Piece:
- Piece number if marked
- Room/area label
- Length in millimetres (null if unreadable)
- Width in millimetres (null if unreadable)
- Shape: RECTANGLE, L_SHAPE, U_SHAPE, RADIUS_END, ROUNDED_RECT, FULL_CIRCLE, CONCAVE_ARC, POLYGON, or IRREGULAR
- Shape config when non-rectangular or imported from a drawing:
  - RADIUS_END: shapeConfig = { "shape": "RADIUS_END", "length_mm": number, "width_mm": number, "radius_mm": number, "curved_ends": "ONE" | "BOTH" }
  - ROUNDED_RECT: shapeConfig = { "shape": "ROUNDED_RECT", "length_mm": number, "width_mm": number, "corner_radius_mm": number, "individual_corners": false }
  - L_SHAPE/U_SHAPE: use only for a true one-piece 90-degree L/U countertop with readable leg dimensions. Include leg dimensions. Never use L_SHAPE for two separate straight counters that meet at an angle.
  - POLYGON: use when the drawing has an angled/splayed/notched outline, window recess, post notch, chamfered join, or wraparound run. Use shapeConfig type "canonical-polygon" with mm coordinates, stable vertex IDs, stable edge IDs, outerRing edges, features, areaSqm, perimeterMm, edgeLengths, and boundingBox. If some dimensions are inferred from scale/context, still render the best-supported polygon, mark confidence below 0.85, and ask for confirmation.
  - For POLYGON pieces, set length and width to the polygon bounding box only as summary fields; the priced geometry must come from shapeConfig area, perimeter and edgeLengths.
- Material/materialName if shown by specification, legend, colour coding, finish schedule, or room-specific notes
- Cutouts if marked: use abbreviations HP, U/M, BA, DI, GPO, TAP
- Edge finish by side when visible: use top, bottom, left, right. Return null when not marked or against a wall.
- Curved/radius edge finish when visible: use edgeArcConfig, e.g. { "arc_end": "Pencil Round" } for a one-ended radius piece.
- Build-up/drop-edge/mitred construction by side when visible. This is separate from visible edge profile.

## FABRICATION CUT-LIST RULES

You are not creating a visual summary of the drawing. You are creating quote rows for fabrication.

Northcoast-style quotes are built from physical pieces, not overall footprints:
- A kitchen drawn as an L-shape is usually two straight pieces unless the drawing explicitly labels it as one fabricated shaped piece.
- A kitchen drawn as a U-shape is usually three straight pieces unless the drawing explicitly labels it as one fabricated shaped piece.
- Islands, vanities, laundries, WIP benches, powder-room tops, waterfalls, panels, splashbacks, drop fronts, and loose returns are separate quote pieces.
- If a drawing says two or three units are the same, expand them into separate physical pieces for each unit. Do not return "x2" or grouped summary rows.
- If a drawing says x4 or similar, create four physical pieces, but ask whether cutouts and edge finishes repeat on every piece.
- If a run is split by joins, posts, appliances, or dimension segments, return the separate quote-ready segments shown by the drawing.
- Put each cutout on the piece that physically contains it.
- For waterfalls and splashbacks, set pieceType to WATERFALL or SPLASHBACK and include relatedTo with the parent piece name, relationshipType, and joinPosition (top, bottom, left, or right) when visible.
- A mitred/build-up edge is an edge construction detail on a parent piece, not automatically a separate WATERFALL piece.
- Do not use "mitred" as a decorative edge profile. If a side is marked M, MIT, mitred, apron, drop edge, build-up, 40mm, or 60mm, record that side in edgeBuildups and keep the visible profile separate.
- Only mark noStripEdges for true wall/concealed sides. Do not mark a waterfall/splashback join as a wall edge; the relationship handles that separately.
- Exclude cabinetry-only or laminate-only items from quote-ready stone pieces unless the document explicitly says that top is stone. Mention excluded joinery/laminate items in warnings or metadata.

## SPECIAL GEOMETRY AND POLYGON RULES

Never silently flatten special geometry into a rectangle.
- Rounded or semicircular terminal ends are RADIUS_END pieces, not rectangles. If the end is clearly semicircular and no radius is labelled, infer radius as half the piece width, mark confidence below 0.85, and ask the user to confirm.
- Rounded ends, curved bars, radius corners, posts, notches, angled returns, bow fronts, and irregular outlines affect cutting, edge finishing, slab yield, and visual review.
- If the exact geometry is visible but not dimensioned, return the best supported shape plus clarification questions. Do not hide the issue in notes only.
- Angled corners joining counters are splayed/chamfered polygon geometry, not L_SHAPE. A run with a 45-degree/angled/chamfered corner, a diagonal connector, a splayed sink/cooktop bay, or a counter that bends through a non-90-degree angle must be POLYGON when dimensions are sufficient.
- If an angled return or splayed piece has enough labelled dimensions to model, return shape POLYGON with canonical-polygon shapeConfig so the quote can render and price the actual outline. Do not downgrade it to RECTANGLE or L_SHAPE.
- "Enough labelled dimensions" does not require every single edge to be printed. If the surrounding labelled dimensions allow a plausible closed outline, create the polygon and mark inferred edge lengths/vertices with lower confidence in notes and clarificationQuestions.
- If two separate straight counters meet at an angled join, return two separate rectangular quote pieces plus a join/relationship note. Do not merge them into one L_SHAPE.
- Only return L_SHAPE when the physical stone piece itself has a 90-degree inside corner and the two leg dimensions are clearly readable. If the drawing shows angled/chamfered joins, splayed corners, or multiple separate runs, L_SHAPE is wrong.
- If a post cutout/notch is shown, include it as a cutout/feature and ask for post size, set-out, and whether notch edges are polished.
- If a piece has angled or irregular runs, produce the best-supported POLYGON shapeConfig whenever the visible outline can be approximated. Mark every inferred vertex/dimension below 0.85 and ask the mason to confirm/adjust in the spatial geometry editor.
- For any RADIUS_END piece, put straight edge profiles in edgeTop/edgeBottom/edgeLeft/edgeRight and curved edge profile in edgeArcConfig.arc_end.
- Do not label a piece Laundry unless the drawing explicitly says laundry/l'dry/laundry bench, tub, WM, dryer, or laundry cabinetry. If the note says entry, entryway, hall, robe, desk, or bench near entry, preserve that exact room/name instead of inventing Laundry.
- If you are unsure whether a drawn run is a simple rectangle, mark confidence below 0.85 and add a clarification question with sourceHint/sourceRegion so the UI can spotlight it for the mason.

## SCOPE FLAGS THAT CHANGE PRICING

Look for these words and preserve them as explicit notes/questions:
- "separate price" means preserve as a separate quote line or option.
- "supply only" means installation should be suppressed or explicitly flagged.
- "offcut rack" means material is not final until the offcut colour/slab is selected.
- "40mm" is ambiguous: ask whether it means 40mm mitred build-up on a 20mm slab, selected-edge build-up, or actual 40mm material.
- Fixture labels without models/templates are provisional only. Fabrication requires templates and positions.

## MATERIAL AND FINISH RULES

Materials can vary by room and by piece. Never assume every extracted piece uses the same material.
- Apply material from the most specific source available: piece label > room note > colour legend > specification page > project default.
- If the document says "20mm Stone Ambassador with 40mm mitred apron", set thickness to 20 and set exposed front/visible apron sides in edgeBuildups with depth 40.
- If the document says a coloured area is "STONE 20MM", only apply stone material/thickness to that colour group.
- If another coloured area is laminate, melamine, polytec, carcass, robe, linen, doors, drawers, shelves or cabinetry, do not create stone quote pieces for it unless a stone top is explicitly called out.
- If a room has stone but the exact catalogue material is not visible, set materialName to the visible generic text such as "20mm Stone" or "Stone Ambassador" and ask a material clarification question for that piece or room.
- Ask material questions per piece/room when materials differ. Do not ask "What material should be used for all benchtops?" unless the document explicitly states one material for all stone pieces.

## SCALE AND DIMENSION RULES

Architectural drawings are often to scale. Use this carefully:
- If a scale is visible, record it in metadata.drawingScale.
- Prefer printed dimension strings over measuring from the page.
- If printed dimensions are not available but scale is visible and the piece outline is clear, estimate dimensions from the scaled drawing only when you can anchor against a known nearby dimension or standard cabinet depth. Mark confidence below 0.85 and include the source in notes.
- When a dimension is inferred from scale, say so in notes. Do not present it as a directly read dimension.
- If the plan only shows room dimensions, do not use the full room size as benchtop size. Use room dimensions only as context for scale and placement.
- If there are enough local dimensions to infer an angled corner, use local dimensions before page-scale measurement. Page-scale measurement is the fallback, not the first choice.
- Do not ask the user for a dimension that is already printed next to the relevant edge unless the label is ambiguous or conflicts with another label. Instead, use the printed value and ask a confirmation question only if needed.

## DIMENSION SANITY CHECKS

Before returning JSON, audit your own pieces:
- Do not use the full bounding rectangle of an L/U/kitchen footprint as one piece dimension.
- Do not use a rectangular placeholder or L_SHAPE placeholder for a visible curve, radius end, angled return, splayed/chamfered corner, post notch, or irregular piece. Use supported shapeConfig or ask for polygon/spatial trace review.
- A normal wall benchtop is commonly around 500-900mm deep. If width is much larger, explain why in notes or split the shape.
- Large values such as 3000 x 2757 or 5914 x 3346 are usually footprint envelopes, not quoteable stone pieces. Split them into the visible runs if dimensions are shown.
- If you can read multiple run dimensions along one outline, each run should normally become a separate piece.
- If you cannot determine the split, return the uncertain dimensions as null and ask clarification questions rather than guessing.
- If a piece name says L-Shape but the visible corner is angled/splayed, rename or model it as a polygon. The shape label should describe the geometry, not force it into an L_SHAPE.
- A polygon with only four right-angle vertices is probably a missed angled/chamfered detail. Re-check the source before returning it for any piece whose drawing shows angled joins, diagonal connectors, or handwritten angle arcs.
- If the current file has visible benchtops but your output has zero pieces, your extraction is incomplete. Re-read the file and produce at least a provisional spatial draft with clarification questions.

### Confidence Scoring:
- 0.9–1.0: Clear dimension line, no ambiguity
- 0.7–0.89: Visible but some ambiguity
- 0.5–0.69: Inferred from context
- Below 0.5: Cannot determine — set dimension to null

## CLARIFICATION QUESTIONS

Generate a clarificationQuestions array for ANY value with confidence below 0.85.

Rules for questions:
- CRITICAL priority: missing or null dimensions (length, width), piece count
  uncertainty
- CRITICAL priority: visible special geometry that was inferred or cannot be represented confidently, including radius ends, post cutouts, angled runs, waterfalls, and joins.
- IMPORTANT priority: cutout type ambiguity, edge finish uncertainty,
  thickness unknown
- NICE_TO_KNOW priority: room assignment, material if not specified

For each question, populate options from the TENANT CATALOGUE above — never hardcode generic options. For dimension questions, set allowFreeText: true and omit options (user types a number).
For each question, include sourcePage and sourceHint whenever possible. sourceHint must point the user to the exact drawing area, e.g. "kitchen plan lower left return", "island sink note on page 2", or "right-hand rounded peninsula end". If you can identify a page region, include sourceRegion as normalised page coordinates 0-1: { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.15 }. These source fields are used by the UI to open and highlight the relevant drawing context.
For every piece with missing dimensions, uncertain room/name, uncertain material, visible angled geometry, a radius/curved end, post/notch, or inferred shape, include a clarification question with pieceId, fieldPath, sourceHint, and sourceRegion where defensible. The UI uses these to put a spotlight on the exact drawing area.

## OUTPUT FORMAT — Return ONLY valid JSON:

{
  "success": true,
  "drawingType": "cad_professional" | "job_sheet" | "hand_drawn" | "architectural",
  "metadata": {
    "jobNumber": "string or null",
    "defaultThickness": 20,
    "drawingScale": "1:100 or null",
    "pageReview": ["Page 1: floor plan and colour-coded stone/laminate legend", "Page 2: joinery scope with material/thickness/apron notes"],
    "measurementLedger": ["Kitchen angled bay: read 2350 top run, 1920 inner run, 600 depth, 620/725 angled bay offsets; modelled as polygon with inferred diagonal edge"],
    "spatialAssemblies": [
      {
        "id": "assembly-kitchen-1",
        "room": "Kitchen",
        "name": "Kitchen connected benchtop footprint",
        "sourcePage": 1,
        "sourceHint": "main kitchen plan",
        "shapeConfig": { "type": "canonical-polygon" },
        "childPieceNames": ["Main kitchen run", "Angled sink bay", "Return run"],
        "cutLines": [
          { "label": "Suggested join", "from": { "x": 1200, "y": 0 }, "to": { "x": 1200, "y": 600 }, "reason": "visible break or best-practice slab join" }
        ],
        "confidence": 0.78,
        "notes": "Use for spatial review; quote rows below remain physical fabrication pieces."
      }
    ]
  },
  "rooms": [
    {
      "name": "Kitchen",
      "pieces": [
        {
          "pieceNumber": 1,
          "name": "Island Bench",
          "pieceType": "ISLAND",
          "shape": "RECTANGLE",
          "shapeConfig": null,
          "materialName": "Stone Ambassador",
          "length": 3600,
          "width": 900,
          "thickness": 20,
          "cutouts": [{"type": "COOKTOP", "quantity": 1}],
          "edges": {
            "top": null,
            "bottom": "Arris",
            "left": null,
            "right": null
          },
          "edgeTop": null,
          "edgeBottom": "Arris",
          "edgeLeft": null,
          "edgeRight": null,
          "edgeArcConfig": null,
          "edgeBuildups": {
            "bottom": { "depth": 40, "exposed": true, "chargeCut": true, "chargePolish": true }
          },
          "noStripEdges": ["top"],
          "relatedTo": null,
          "confidence": 0.9,
          "notes": "meaningful notes only — nothing generic"
        }
      ]
    }
  ],
  "clarificationQuestions": [
    {
      "id": "piece-1-width",
      "pieceId": "piece-1",
      "fieldPath": "width",
      "category": "DIMENSION",
      "priority": "CRITICAL",
      "question": "What is the width of the Island Bench?",
      "aiSuggestion": null,
      "aiSuggestionConfidence": null,
      "options": null,
      "allowFreeText": true,
      "unit": "mm",
      "sourcePage": 1,
      "sourceHint": "island bench dimension line near the lower centre of the sketch",
      "sourceRegion": { "x": 0.25, "y": 0.55, "width": 0.45, "height": 0.25 }
    },
    {
      "id": "piece-1-material",
      "pieceId": "piece-1",
      "fieldPath": "material",
      "category": "MATERIAL",
      "priority": "IMPORTANT",
      "question": "What material is the Island Bench?",
      "aiSuggestion": "Caesarstone Calacatta Nuvo",
      "aiSuggestionConfidence": 0.6,
      "options": ["list from tenant catalogue only"],
      "allowFreeText": false,
      "unit": null
    }
  ],
  "warnings": []
}` + (learningRules.length > 0 ? `

## LEARNED CORRECTIONS (apply these rules — they come from real user feedback)

${learningRules.map(r =>
  `- ${r.field_name}: always use "${r.correct_value}"` +
  (r.drawing_type ? ` (for ${r.drawing_type} drawings)` : '') +
  (r.condition ? ` when ${r.condition}` : '') +
  ` [based on ${r.correction_count} corrections]`
).join('\n')}` : '') + (learningExamples.length > 0 ? `

## REVIEWED TAKEOFF EXAMPLES (use these as calibration, not as copied project data)

${learningExamples.map((example, index) => {
  const label = example.source_quote_number ?? `example-${index + 1}`;
  return `### ${label}${example.source_system ? ` (${example.source_system})` : ''}
Expected quote-ready takeoff:
${compactJson(example.expected_data)}
AI extraction/comparison notes:
${compactJson(example.comparison_data ?? example.extracted_data ?? example.notes)}`;
}).join('\n\n')}` : '');
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Convert file to buffer
    const bytes = await file.arrayBuffer();
    let buffer: Buffer = Buffer.from(bytes);
    const resolvedMimeType = resolveDrawingMimeType(file.name, file.type);

    logger.info(`[Analyze] Received file: ${file.name}, size: ${buffer.length} bytes, type: ${resolvedMimeType || 'unknown'}`);

    if (!isAllowedDrawingFile(file.name, resolvedMimeType)) {
      return NextResponse.json(
        {
          error: 'Invalid file type',
          details: `Please upload one of these drawing formats: ${DRAWING_FILE_LABEL}.`,
        },
        { status: 400 }
      );
    }

    let mimeType = resolvedMimeType || 'image/png';
    const isPdf = isPdfFile(mimeType);

    // Build the content block for Claude based on file type
    let fileContentBlock: Anthropic.Messages.ContentBlockParam;

    if (isPdf) {
      // PDFs are sent as document type — Claude supports PDFs natively
      if (buffer.length > MAX_PDF_SIZE) {
        return NextResponse.json(
          {
            error: 'PDF too large',
            details: `PDF size: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Maximum allowed: 32MB.`,
          },
          { status: 400 }
        );
      }

      logger.info(`[Analyze] Sending PDF to Claude as document type (${buffer.length} bytes)`);
      const base64Pdf = buffer.toString('base64');
      fileContentBlock = {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: base64Pdf,
        },
      } as unknown as Anthropic.Messages.ContentBlockParam;
    } else {
      // Images: convert formats Claude cannot consume directly, then compress if needed.
      if (!isClaudeImageMimeType(mimeType)) {
        logger.info(`[Analyze] Converting ${mimeType} to JPEG for Claude image input`);
        try {
          const converted = await convertImageForClaude(buffer);
          buffer = converted.data;
          mimeType = converted.mediaType;
          logger.info(`[Analyze] Converted image to ${mimeType}, ${buffer.length} bytes`);
        } catch (conversionError) {
          logger.error('[Analyze] Image conversion failed:', conversionError);
          return NextResponse.json(
            {
              error: 'Image format could not be converted',
              details: `This file type is accepted for upload, but could not be prepared for AI analysis. Try exporting it as JPG, PNG, GIF, or WebP.`,
            },
            { status: 400 }
          );
        }
      }

      // Images: compress if needed, then send as image type
      if (buffer.length > MAX_IMAGE_SIZE * 0.8) {
        logger.info(`[Analyze] Image size ${buffer.length} bytes exceeds threshold, compressing...`);
        try {
          const compressed = await compressImage(buffer, mimeType);
          buffer = compressed.data;
          mimeType = compressed.mediaType;
          logger.info(`[Analyze] Compressed to ${buffer.length} bytes`);
        } catch (compressionError) {
          logger.error('[Analyze] Image compression failed:', compressionError);
          return NextResponse.json(
            {
              error: 'Image too large and compression failed',
              details: `Original size: ${(bytes.byteLength / 1024 / 1024).toFixed(1)}MB. Maximum allowed: 5MB. Please upload a smaller image or compress it before uploading.`,
            },
            { status: 400 }
          );
        }
      }

      // Final size check after compression
      if (buffer.length > MAX_IMAGE_SIZE) {
        return NextResponse.json(
          {
            error: 'Image still too large after compression',
            details: `Compressed size: ${(buffer.length / 1024 / 1024).toFixed(1)}MB. Maximum allowed: 5MB. Please upload a lower resolution image.`,
          },
          { status: 400 }
        );
      }

      logger.info(`[Analyze] Sending image to Claude as image type (${buffer.length} bytes, ${mimeType})`);
      const base64Image = buffer.toString('base64');
      const mediaType = mimeType as 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp';
      fileContentBlock = {
        type: 'image',
        source: {
          type: 'base64',
          media_type: mediaType,
          data: base64Image,
        },
      };
    }

    // Load catalogue from DB — exact field names confirmed from schema
    const [rawMaterials, rawEdgeTypes, rawCutoutTypes] = await Promise.all([
      prisma.materials.findMany({
        where: { is_active: true, company_id: companyId },
        select: {
          id: true,
          name: true,
          collection: true,
          price_per_sqm: true,
          price_per_slab: true,
          supplier: { select: { id: true, name: true } },
        },
        orderBy: { name: 'asc' },
        take: 50,
      }),
      prisma.edge_types.findMany({
        where: { isActive: true },
        select: { id: true, name: true, code: true },
        orderBy: { name: 'asc' },
      }),
      prisma.cutout_types.findMany({
        where: { isActive: true },
        select: { id: true, name: true },
        orderBy: { name: 'asc' },
      }),
    ]);

    const catalogueMaterials = rawMaterials.map(material => ({
      id: material.id,
      name: material.name,
      collection: material.collection,
      pricePerSqm: Number(material.price_per_sqm || 0),
      pricePerSlab: material.price_per_slab == null ? null : Number(material.price_per_slab),
      supplier: material.supplier,
    }));

    const catalogue: DrawingCatalogue = {
      materials: catalogueMaterials,
      edgeTypes: rawEdgeTypes,
      cutoutTypes: rawCutoutTypes,
    };

    // Load active learning rules and reviewed examples for this company.
    // Rules are compact defaults; examples calibrate quote-ready piece modelling.
    const [learningRules, learningExamples] = await Promise.all([
      prisma.drawing_learning_rules.findMany({
        where: { company_id: companyId, is_active: true },
        orderBy: { correction_count: 'desc' },
        take: 20,
        select: {
          field_name: true,
          correct_value: true,
          drawing_type: true,
          condition: true,
          correction_count: true,
        },
      }),
      prisma.ai_quote_learning_examples.findMany({
        where: {
          company_id: companyId,
          status: { in: ['APPROVED', 'READY_FOR_TRAINING'] },
        },
        orderBy: { updated_at: 'desc' },
        take: 8,
        select: {
          source_quote_number: true,
          source_system: true,
          expected_data: true,
          extracted_data: true,
          comparison_data: true,
          notes: true,
        },
      }),
    ]);

    // Call Claude API
    const anthropic = getAnthropicClient();
    logger.info('[Analyze] Calling Claude API...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      system: buildSystemPrompt(catalogue, learningRules, learningExamples),
      messages: [
        {
          role: 'user',
          content: [
            fileContentBlock,
            {
              type: 'text',
              text: 'Analyze this complete multi-page stone/joinery document. First inspect every page, including floor plans, marked-up colour legends, specifications and scope notes. Then do a measurement-led geometry pass: transcribe local dimension labels, build connected polygon outlines for angled/splayed/curved/notched pieces, and only then split into quote-ready fabrication pieces. Use scale and visible dimensions where defensible, mark inferred dimensions clearly, include sourceHint/sourceRegion for uncertainty, and return only valid JSON.',
            },
          ],
        },
      ],
    });

    // Extract text response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response (handle markdown code blocks)
    let jsonStr = textContent.text;
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const analysis = JSON.parse(jsonStr);

    // Rough drawing detection — drawingType is the sole trigger
    const isRoughDrawing = analysis.drawingType === 'hand_drawn';
    let roughDrawingMessage: string | null = null;

    if (isRoughDrawing) {
      logger.info('[Analyze] Rough drawing detected — running second pass for aggressive questioning');
      try {
        const roughResponse = await anthropic.messages.create({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          system: buildRoughDrawingSystemPrompt(catalogue),
          messages: [
            {
              role: 'user',
              content: [
                fileContentBlock,
                {
                  type: 'text',
                  text: `The initial extraction produced these pieces: ${JSON.stringify(analysis.rooms ?? analysis.pieces)}.
Generate clarification questions for EVERY dimension on EVERY piece.
Return ONLY a JSON object with "roughDrawingMessage" and "clarificationQuestions" array. No other text.`,
                },
              ],
            },
          ],
        });

        // Parse rough drawing response
        const roughTextContent = roughResponse.content.find(c => c.type === 'text');
        if (roughTextContent && roughTextContent.type === 'text') {
          let roughJsonStr = roughTextContent.text;
          if (roughJsonStr.includes('```json')) {
            roughJsonStr = roughJsonStr.split('```json')[1].split('```')[0].trim();
          } else if (roughJsonStr.includes('```')) {
            roughJsonStr = roughJsonStr.split('```')[1].split('```')[0].trim();
          }

          const roughParsed = JSON.parse(roughJsonStr);
          const roughQuestions: ClarificationQuestion[] = Array.isArray(roughParsed.clarificationQuestions)
            ? roughParsed.clarificationQuestions
            : Array.isArray(roughParsed) ? roughParsed : [];

          if (roughQuestions.length > 0) {
            analysis.clarificationQuestions = roughQuestions;
          }

          if (typeof roughParsed.roughDrawingMessage === 'string' && roughParsed.roughDrawingMessage.length > 0) {
            roughDrawingMessage = roughParsed.roughDrawingMessage;
          }
        }
      } catch (roughErr) {
        logger.error('[Analyze] Rough drawing second pass failed (non-fatal):', roughErr);
      }

      // Default message if parsing didn't produce one
      if (!roughDrawingMessage) {
        roughDrawingMessage = "This looks like a hand sketch — I'll ask a few quick questions to make sure the measurements are right.";
      }
    }

    return NextResponse.json({
      success: true,
      analysis,
      clarificationQuestions: analysis.clarificationQuestions ?? [],
      requiresReview: (analysis.clarificationQuestions ?? []).some(
        (q: { priority: string }) => q.priority === 'CRITICAL'
      ),
      isRoughDrawing,
      roughDrawingMessage,
      catalogue,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    });

  } catch (error) {
    logger.error('Drawing analysis error:', error);

    // More detailed error response
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: 'Failed to analyze drawing',
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined
      },
      { status: 500 }
    );
  }
}
