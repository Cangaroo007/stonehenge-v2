import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';

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

function buildSystemPrompt(catalogue: DrawingCatalogue): string {
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

### For Each Stone Piece:
- Piece number if marked
- Room/area label
- Length in millimetres (null if unreadable)
- Width in millimetres (null if unreadable)
- Shape: RECTANGLE, L_SHAPE, U_SHAPE, or IRREGULAR
- Cutouts if marked: use abbreviations HP, U/M, BA, DI, GPO, TAP

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
          "shape": "RECTANGLE",
          "length": 3600,
          "width": 900,
          "thickness": 20,
          "cutouts": [{"type": "COOKTOP", "quantity": 1}],
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
}`;
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

    // Call Claude API
    const anthropic = getAnthropicClient();
    logger.info('[Analyze] Calling Claude API...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: buildSystemPrompt(catalogue),
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

    return NextResponse.json({
      success: true,
      analysis,
      clarificationQuestions: analysis.clarificationQuestions ?? [],
      requiresReview: (analysis.clarificationQuestions ?? []).some(
        (q: { priority: string }) => q.priority === 'CRITICAL'
      ),
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
