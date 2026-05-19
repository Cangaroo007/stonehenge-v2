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

## CORE PRINCIPLE — NEVER FABRICATE DATA
If you cannot clearly read a dimension, set it to null. Never guess a dimension. "I couldn't read this" is infinitely better than a wrong number.

## TENANT CATALOGUE
Use ONLY these values when generating clarification question options. Do not invent options not in this list.

### Available Materials:
${materialList || '- No materials configured yet'}

### Available Edge Types:
${edgeTypeList || '- No edge types configured yet'}

### Available Cutout Types:
${cutoutTypeList || '- No cutout types configured yet'}

## WHAT TO EXTRACT

### Job Metadata (if visible):
- Job Number
- Default Thickness (usually 20mm or 40mm)

### For Each Quote-Ready Stone Piece:
- Piece number if marked
- Room/area label
- Length in millimetres (null if unreadable)
- Width in millimetres (null if unreadable)
- Shape: RECTANGLE, L_SHAPE, U_SHAPE, or IRREGULAR
- Cutouts if marked: use abbreviations HP, U/M, BA, DI, GPO, TAP

## FABRICATION CUT-LIST RULES

You are not creating a visual summary of the drawing. You are creating quote rows for fabrication.

Northcoast-style quotes are built from physical pieces, not overall footprints:
- A kitchen drawn as an L-shape is usually two straight pieces unless the drawing explicitly labels it as one fabricated shaped piece.
- A kitchen drawn as a U-shape is usually three straight pieces unless the drawing explicitly labels it as one fabricated shaped piece.
- Islands, vanities, laundries, WIP benches, powder-room tops, waterfalls, panels, splashbacks, drop fronts, and loose returns are separate quote pieces.
- If a drawing says two or three units are the same, expand them into separate physical pieces for each unit. Do not return "x2" or grouped summary rows.
- If a run is split by joins, posts, appliances, or dimension segments, return the separate quote-ready segments shown by the drawing.
- Put each cutout on the piece that physically contains it.
- For waterfalls and splashbacks, set pieceType to WATERFALL or SPLASHBACK and include relatedTo with the parent piece name, relationshipType, and joinPosition (top, bottom, left, or right) when visible.
- A mitred/build-up edge is an edge construction detail on a parent piece, not automatically a separate WATERFALL piece.

## DIMENSION SANITY CHECKS

Before returning JSON, audit your own pieces:
- Do not use the full bounding rectangle of an L/U/kitchen footprint as one piece dimension.
- A normal wall benchtop is commonly around 500-900mm deep. If width is much larger, explain why in notes or split the shape.
- Large values such as 3000 x 2757 or 5914 x 3346 are usually footprint envelopes, not quoteable stone pieces. Split them into the visible runs if dimensions are shown.
- If you can read multiple run dimensions along one outline, each run should normally become a separate piece.
- If you cannot determine the split, return the uncertain dimensions as null and ask clarification questions rather than guessing.

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
- IMPORTANT priority: cutout type ambiguity, edge finish uncertainty,
  thickness unknown
- NICE_TO_KNOW priority: room assignment, material if not specified

For each question, populate options from the TENANT CATALOGUE above — never hardcode generic options. For dimension questions, set allowFreeText: true and omit options (user types a number).

## OUTPUT FORMAT — Return ONLY valid JSON:

{
  "success": true,
  "drawingType": "cad_professional" | "job_sheet" | "hand_drawn" | "architectural",
  "metadata": {
    "jobNumber": "string or null",
    "defaultThickness": 20
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
          "length": 3600,
          "width": 900,
          "thickness": 20,
          "cutouts": [{"type": "COOKTOP", "quantity": 1}],
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
      "unit": "mm"
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
    let mimeType = file.type || 'image/png';
    const isPdf = isPdfFile(mimeType);

    logger.info(`[Analyze] Received file: ${file.name}, size: ${buffer.length} bytes, type: ${mimeType}, isPdf: ${isPdf}`);

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
        select: { id: true, name: true, collection: true },
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

    const catalogue: DrawingCatalogue = {
      materials: rawMaterials,
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
      max_tokens: 4096,
      system: buildSystemPrompt(catalogue, learningRules, learningExamples),
      messages: [
        {
          role: 'user',
          content: [
            fileContentBlock,
            {
              type: 'text',
              text: 'Analyze this stone fabrication drawing and extract all piece specifications. Return only valid JSON.',
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
      catalogue: { materials: rawMaterials, edgeTypes: rawEdgeTypes, cutoutTypes: rawCutoutTypes },
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
