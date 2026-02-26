import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import sharp from 'sharp';
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth';

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

const SYSTEM_PROMPT = `You are an expert stone benchtop fabricator analyzing drawings to extract piece specifications for quoting.

DRAWING TYPES YOU MAY RECEIVE:
1. Professional CAD Drawings - Clean technical drawings with precise dimension lines
2. FileMaker Job Sheets - Form-style pages with CAD drawings, site photos, and metadata fields (Job No., Thickness, etc.)
3. Hand-Drawn Sketches - Rough sketches with handwritten measurements
4. Architectural Plans - Building floor plans with stone areas marked

WHAT TO EXTRACT:

Job Metadata (if visible):
- Job Number
- Default Thickness (usually 20mm or 40mm)
- Default Overhang (usually 10mm)
- Material/Color if specified

For Each Stone Piece:
- Piece number if marked (circled numbers like 1, 2, 3)
- Room/area label (Kitchen, Bathroom, Pantry, Laundry, TV Unit, Island, etc.)
- Length in millimeters (typically 1500-4000mm for benchtops)
- Width in millimeters (typically 400-900mm for benchtops)
- Shape: rectangular, L-shaped, U-shaped, or irregular
- Cutouts if marked: HP/hotplate, UMS/undermount sink, SR/drop-in sink, tap holes

CONFIDENCE SCORING:
- 0.9-1.0: Clear CAD with measurement lines
- 0.7-0.89: Visible but some ambiguity
- 0.5-0.69: Estimated from context
- Below 0.5: Flag for manual verification

OUTPUT FORMAT - Return ONLY valid JSON:
{
  "success": true,
  "drawingType": "cad_professional" or "job_sheet" or "hand_drawn" or "architectural",
  "metadata": {
    "jobNumber": "string or null",
    "defaultThickness": 20,
    "defaultOverhang": 10
  },
  "rooms": [
    {
      "name": "Kitchen",
      "pieces": [
        {
          "pieceNumber": 1,
          "name": "Island Bench",
          "pieceType": "benchtop",
          "shape": "rectangular",
          "length": 3600,
          "width": 900,
          "thickness": 20,
          "cutouts": [{"type": "hotplate"}, {"type": "sink"}],
          "notes": "any observations",
          "confidence": 0.85
        }
      ]
    }
  ],
  "warnings": ["list any issues"],
  "questionsForUser": ["questions needing clarification"]
}`;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

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

    // Call Claude API
    const anthropic = getAnthropicClient();
    logger.info('[Analyze] Calling Claude API...');
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
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
