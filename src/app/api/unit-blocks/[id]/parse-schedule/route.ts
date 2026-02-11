/**
 * POST /api/unit-blocks/[id]/parse-schedule
 *
 * Two-step flow for parsing a Finishes Schedule PDF:
 *   ?action=parse   — Upload PDF, parse with Claude Vision, return preview with material matches
 *   ?action=confirm — Accept (optionally edited) mappings, create finish_tier_mapping records
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { uploadToR2 } from '@/lib/storage/r2';
import {
  parseFinishesSchedule,
  type ParsedSchedule,
} from '@/lib/services/schedule-parser';
import { matchParsedMaterials } from '@/lib/services/material-matcher';
import type { MaterialMatch } from '@/lib/services/material-matcher';
import { v4 as uuidv4 } from 'uuid';
import { Prisma } from '@prisma/client';
import { logger } from '@/lib/logger';

const MAX_PDF_SIZE = 32 * 1024 * 1024; // 32MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

interface ConfirmMapping {
  roomName: string;
  application: string;
  materialId: number;
  edgeProfile?: string | null;
}

interface ConfirmBody {
  finishLevel: string;
  colourScheme?: string | null;
  mappings: ConfirmMapping[];
  fileId: number;
  templateIds: number[];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const { id } = await params;
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json(
        { error: 'Invalid project ID' },
        { status: 400 }
      );
    }

    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
    });
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' },
        { status: 404 }
      );
    }

    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');

    if (action === 'parse') {
      return handleParse(request, projectId);
    }

    if (action === 'confirm') {
      return handleConfirm(request, projectId);
    }

    return NextResponse.json(
      { error: 'Invalid action. Use ?action=parse or ?action=confirm' },
      { status: 400 }
    );
  } catch (error) {
    logger.error('[ParseSchedule] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process schedule',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Step 1: Parse the uploaded PDF and return extracted data with material matches for review.
 */
async function handleParse(
  request: NextRequest,
  projectId: number
): Promise<NextResponse> {
  const formData = await request.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: 'Invalid file type. Allowed: PDF, PNG, JPG' },
      { status: 400 }
    );
  }

  if (file.size > MAX_PDF_SIZE) {
    return NextResponse.json(
      { error: 'File too large. Maximum size is 32MB.' },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload the original file to R2
  const fileExtension = file.name.split('.').pop() || 'pdf';
  const storageKey = `unit-blocks/${projectId}/schedules/${uuidv4()}.${fileExtension}`;
  await uploadToR2(storageKey, buffer, file.type);

  // Create a file record in the database
  const fileRecord = await prisma.unit_block_files.create({
    data: {
      projectId,
      fileName: file.name,
      fileType: 'FINISHES_SCHEDULE',
      storageKey,
      mimeType: file.type,
      fileSize: file.size,
    },
  });

  // Parse the document with Claude Vision
  const base64 = buffer.toString('base64');
  let parsed: ParsedSchedule;

  if (file.type === 'application/pdf') {
    parsed = await parseFinishesSchedule(base64, 'application/pdf');
  } else {
    parsed = await parseFinishesSchedule(base64, file.type);
  }

  // Collect all stone specs across rooms for material matching
  const allSpecs = parsed.rooms.flatMap((room) => room.stoneSpecs);

  // Run material matcher
  let materialMatches: MaterialMatch[] = [];
  if (allSpecs.length > 0) {
    materialMatches = await matchParsedMaterials(allSpecs);
  }

  logger.info(
    `[ParseSchedule] Parsed ${parsed.rooms.length} rooms with ${allSpecs.length} stone specs from ${file.name} (confidence: ${parsed.confidence})`
  );

  return NextResponse.json({
    parsed,
    materialMatches,
    fileId: fileRecord.id,
  });
}

/**
 * Step 2: Confirm mappings and create finish_tier_mapping records.
 * The user has reviewed and optionally edited the AI-suggested mappings.
 */
async function handleConfirm(
  request: NextRequest,
  projectId: number
): Promise<NextResponse> {
  const body = (await request.json()) as ConfirmBody;
  const { finishLevel, colourScheme, mappings, fileId, templateIds } = body;

  if (!finishLevel || typeof finishLevel !== 'string') {
    return NextResponse.json(
      { error: 'finishLevel is required' },
      { status: 400 }
    );
  }

  if (!mappings || !Array.isArray(mappings) || mappings.length === 0) {
    return NextResponse.json(
      { error: 'At least one mapping is required' },
      { status: 400 }
    );
  }

  if (!templateIds || !Array.isArray(templateIds) || templateIds.length === 0) {
    return NextResponse.json(
      { error: 'At least one template must be selected' },
      { status: 400 }
    );
  }

  // Verify file record belongs to this project
  if (fileId) {
    const fileRecord = await prisma.unit_block_files.findFirst({
      where: { id: fileId, projectId },
    });
    if (!fileRecord) {
      return NextResponse.json(
        { error: 'File record not found for this project' },
        { status: 404 }
      );
    }
  }

  // Verify templates belong to this project
  const templates = await prisma.unit_type_templates.findMany({
    where: {
      id: { in: templateIds },
      OR: [{ projectId }, { projectId: null }],
      isActive: true,
    },
    select: { id: true },
  });

  if (templates.length === 0) {
    return NextResponse.json(
      { error: 'No valid templates found for this project' },
      { status: 404 }
    );
  }

  const validTemplateIds = templates.map((t) => t.id);

  // Normalise the finish level
  const normalisedFinishLevel = finishLevel
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_');
  const normalisedColourScheme = colourScheme
    ? colourScheme.trim().toUpperCase().replace(/\s+/g, '_')
    : null;

  // Build materialAssignments JSON: { "APPLICATION_ROOM": materialId }
  // and edgeOverrides JSON if edge profiles are specified
  const materialAssignments: Record<string, number> = {};
  const edgeOverrides: Record<
    string,
    { edges: Record<string, { finish: string }> }
  > = {};

  for (const mapping of mappings) {
    const key = `${mapping.application}_${mapping.roomName}`
      .toUpperCase()
      .replace(/\s+/g, '_');
    materialAssignments[key] = mapping.materialId;

    if (mapping.edgeProfile) {
      edgeOverrides[key] = {
        edges: {
          front: { finish: mapping.edgeProfile.toUpperCase().replace(/\s+/g, '_') },
        },
      };
    }
  }

  // Create finish_tier_mapping records for each template
  const result = await prisma.$transaction(async (tx) => {
    let mappingsCreated = 0;

    for (const templateId of validTemplateIds) {
      // Check if a mapping already exists for this template + finish level + colour scheme
      const existing = await tx.finish_tier_mappings.findFirst({
        where: {
          templateId,
          finishLevel: normalisedFinishLevel,
          colourScheme: normalisedColourScheme,
        },
      });

      if (existing) {
        // Update existing mapping
        await tx.finish_tier_mappings.update({
          where: { id: existing.id },
          data: {
            materialAssignments:
              materialAssignments as unknown as Prisma.InputJsonValue,
            edgeOverrides:
              Object.keys(edgeOverrides).length > 0
                ? (edgeOverrides as unknown as Prisma.InputJsonValue)
                : undefined,
          },
        });
      } else {
        // Create new mapping
        await tx.finish_tier_mappings.create({
          data: {
            templateId,
            finishLevel: normalisedFinishLevel,
            colourScheme: normalisedColourScheme,
            materialAssignments:
              materialAssignments as unknown as Prisma.InputJsonValue,
            edgeOverrides:
              Object.keys(edgeOverrides).length > 0
                ? (edgeOverrides as unknown as Prisma.InputJsonValue)
                : Prisma.DbNull,
          },
        });
      }

      mappingsCreated++;
    }

    return { mappingsCreated };
  });

  logger.info(
    `[ParseSchedule] Created/updated ${result.mappingsCreated} finish tier mappings for project ${projectId} (${normalisedFinishLevel})`
  );

  return NextResponse.json({
    mappingsCreated: result.mappingsCreated,
    finishLevel: normalisedFinishLevel,
    colourScheme: normalisedColourScheme,
    projectId,
  });
}
