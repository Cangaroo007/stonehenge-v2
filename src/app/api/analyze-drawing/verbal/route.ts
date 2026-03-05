import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth';
import prisma from '@/lib/db';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';
import { buildVerbalTakeoffPrompt } from '@/lib/prompts/extraction-rough-drawing';

function getAnthropicClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY environment variable is not set');
  }
  return new Anthropic({ apiKey });
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;

    const body = await request.json();
    const { description } = body;

    if (!description || typeof description !== 'string' || !description.trim()) {
      return NextResponse.json({ error: 'Description is required' }, { status: 400 });
    }

    // Load catalogue from DB — same as main analyze route
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

    // Call Claude with verbal takeoff prompt
    const anthropic = getAnthropicClient();
    logger.info('[VerbalTakeoff] Parsing description:', description.substring(0, 100));

    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      system: buildVerbalTakeoffPrompt(catalogue),
      messages: [{
        role: 'user',
        content: description.trim(),
      }],
    });

    // Extract text response
    const textContent = response.content.find(c => c.type === 'text');
    if (!textContent || textContent.type !== 'text') {
      throw new Error('No text response from Claude');
    }

    // Parse JSON from response
    let jsonStr = textContent.text;
    if (jsonStr.includes('```json')) {
      jsonStr = jsonStr.split('```json')[1].split('```')[0].trim();
    } else if (jsonStr.includes('```')) {
      jsonStr = jsonStr.split('```')[1].split('```')[0].trim();
    }

    const parsed = JSON.parse(jsonStr);
    const pieces = Array.isArray(parsed.pieces) ? parsed.pieces : [];
    const parseNotes = typeof parsed.parseNotes === 'string' ? parsed.parseNotes : null;

    return NextResponse.json({
      success: true,
      pieces,
      parseNotes,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
    });

  } catch (error) {
    logger.error('Verbal takeoff error:', error);

    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : undefined;

    return NextResponse.json(
      {
        error: 'Failed to parse description',
        details: errorMessage,
        stack: process.env.NODE_ENV === 'development' ? errorStack : undefined,
      },
      { status: 500 }
    );
  }
}
