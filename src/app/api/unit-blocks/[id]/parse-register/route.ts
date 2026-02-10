/**
 * POST /api/unit-blocks/[id]/parse-register
 *
 * Two-step flow for parsing a Finishes Register PDF:
 *   ?action=parse   — Upload PDF, parse with Claude Vision, return preview
 *   ?action=confirm — Accept (optionally edited) parsed data, create units
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { uploadToR2 } from '@/lib/storage/r2';
import {
  parseFinishesRegister,
  type ParsedRegister,
  type ParsedUnit,
  type DetectedProjectType,
} from '@/lib/services/register-parser';
import { UnitBlockProjectType } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const MAX_PDF_SIZE = 32 * 1024 * 1024; // 32MB
const ALLOWED_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
];

/**
 * Map AI-detected project type to Prisma enum values.
 */
function mapProjectType(detected: DetectedProjectType): UnitBlockProjectType {
  switch (detected) {
    case 'APARTMENTS':
      return 'APARTMENTS';
    case 'TOWNHOUSES':
      return 'TOWNHOUSES';
    case 'COMMERCIAL':
      return 'COMMERCIAL';
    case 'MIXED':
      return 'MIXED_USE';
    case 'VILLAS':
    case 'UNKNOWN':
    default:
      return 'OTHER';
  }
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
    console.error('[ParseRegister] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process register',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}

/**
 * Step 1: Parse the uploaded PDF and return extracted data for review.
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
      { error: `File too large. Maximum size is 32MB.` },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Upload the original file to R2
  const fileExtension = file.name.split('.').pop() || 'pdf';
  const storageKey = `unit-blocks/${projectId}/registers/${uuidv4()}.${fileExtension}`;
  await uploadToR2(storageKey, buffer, file.type);

  // Create a file record in the database
  const fileRecord = await prisma.unit_block_files.create({
    data: {
      projectId,
      fileName: file.name,
      fileType: 'FINISHES_REGISTER',
      storageKey,
      mimeType: file.type,
      fileSize: file.size,
    },
  });

  // Parse the document with Claude Vision
  const base64 = buffer.toString('base64');
  const parsed = await parseFinishesRegister(base64, file.type);

  console.log(
    `[ParseRegister] Parsed ${parsed.units.length} units from ${file.name} ` +
      `(confidence: ${parsed.confidence}, type: ${parsed.projectType})`
  );

  return NextResponse.json({
    parsed,
    fileId: fileRecord.id,
  });
}

/**
 * Step 2: Confirm parsed data and create unit records.
 * The user may have edited the parsed data to correct mistakes.
 */
async function handleConfirm(
  request: NextRequest,
  projectId: number
): Promise<NextResponse> {
  const body = await request.json();
  const { parsed, fileId } = body as {
    parsed: ParsedRegister;
    fileId: number;
  };

  if (!parsed || !parsed.units || !Array.isArray(parsed.units)) {
    return NextResponse.json(
      { error: 'Invalid parsed data' },
      { status: 400 }
    );
  }

  if (parsed.units.length === 0) {
    return NextResponse.json(
      { error: 'No units to create' },
      { status: 400 }
    );
  }

  // Verify the file record exists and belongs to this project
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

  // Check for existing units that would conflict
  const existingUnits = await prisma.unit_block_units.findMany({
    where: { projectId },
    select: { unitNumber: true },
  });
  const existingNumbers = new Set(existingUnits.map((u) => u.unitNumber));

  const unitsToCreate: ParsedUnit[] = [];
  const skipped: string[] = [];

  for (const unit of parsed.units) {
    if (existingNumbers.has(unit.unitNumber)) {
      skipped.push(unit.unitNumber);
    } else {
      unitsToCreate.push(unit);
    }
  }

  if (unitsToCreate.length === 0) {
    return NextResponse.json(
      {
        error: 'All units already exist in this project',
        skipped,
      },
      { status: 409 }
    );
  }

  // Bulk create units and update project in a transaction
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.unit_block_units.createMany({
      data: unitsToCreate.map((unit) => ({
        projectId,
        unitNumber: unit.unitNumber,
        level: unit.level,
        unitTypeCode: unit.unitTypeCode,
        finishLevel: unit.finishLevel,
        colourScheme: unit.colourScheme,
        saleStatus: unit.saleStatus,
        buyerChangeSpec: unit.buyerChangeSpec,
        status: 'PENDING' as const,
      })),
    });

    // Update totalUnits count
    await tx.unit_block_projects.update({
      where: { id: projectId },
      data: { totalUnits: { increment: created.count } },
    });

    // Link the finishes register file to the project
    if (fileId) {
      await tx.unit_block_projects.update({
        where: { id: projectId },
        data: { finishesRegisterId: fileId },
      });
    }

    // Update project type if AI detected one and project still has default
    if (parsed.projectType && parsed.projectType !== 'UNKNOWN') {
      const currentProject = await tx.unit_block_projects.findUnique({
        where: { id: projectId },
        select: { projectType: true },
      });
      if (currentProject?.projectType === 'APARTMENTS') {
        await tx.unit_block_projects.update({
          where: { id: projectId },
          data: { projectType: mapProjectType(parsed.projectType) },
        });
      }
    }

    return created;
  });

  // Auto-link to templates after creation
  const linkStats = await autoLinkTemplates(projectId);
  const mappingStats = await autoLinkFinishMappings(projectId);

  console.log(
    `[ParseRegister] Created ${result.count} units for project ${projectId}. ` +
      `Templates linked: ${linkStats.linked}. Skipped: ${skipped.length}`
  );

  return NextResponse.json({
    unitsCreated: result.count,
    projectId,
    skipped,
    templateLinking: linkStats,
    finishMappings: mappingStats,
  });
}

/**
 * Auto-link units to matching unit type templates.
 *
 * For each unique unitTypeCode in the project's units, look for a matching
 * template — first project-specific, then global (projectId = null).
 */
async function autoLinkTemplates(projectId: number): Promise<{
  linked: number;
  unlinked: number;
  missingTemplates: string[];
}> {
  const units = await prisma.unit_block_units.findMany({
    where: { projectId, templateId: null },
    select: { id: true, unitTypeCode: true },
  });

  if (units.length === 0) {
    return { linked: 0, unlinked: 0, missingTemplates: [] };
  }

  // Get unique unit type codes (filter out nulls)
  const typeCodes = Array.from(
    new Set(
      units
        .map((u) => u.unitTypeCode)
        .filter((code): code is string => code !== null)
    )
  );

  // Load all matching templates (project-specific first, then global)
  const templates = await prisma.unit_type_templates.findMany({
    where: {
      unitTypeCode: { in: typeCodes },
      isActive: true,
      OR: [{ projectId }, { projectId: null }],
    },
    orderBy: { projectId: 'desc' }, // project-specific first (non-null)
  });

  // Build a map of unitTypeCode → best template (project-specific wins)
  const templateMap = new Map<string, number>();
  for (const template of templates) {
    // Only set if not already mapped (first match wins, project-specific first due to sort)
    if (!templateMap.has(template.unitTypeCode)) {
      templateMap.set(template.unitTypeCode, template.id);
    }
  }

  let linked = 0;
  const missingTemplates: string[] = [];

  for (const code of typeCodes) {
    const templateId = templateMap.get(code);
    if (templateId) {
      const updateResult = await prisma.unit_block_units.updateMany({
        where: { projectId, unitTypeCode: code, templateId: null },
        data: { templateId },
      });
      linked += updateResult.count;
    } else {
      missingTemplates.push(code);
    }
  }

  const unlinked = units.length - linked;

  return { linked, unlinked, missingTemplates };
}

/**
 * Check finish tier mapping coverage for units in a project.
 *
 * For each unit that has both a templateId and a finishLevel, check
 * if a finish_tier_mapping exists for that combination.
 */
async function autoLinkFinishMappings(projectId: number): Promise<{
  fullyMapped: number;
  partiallyMapped: number;
  unmapped: number;
}> {
  const units = await prisma.unit_block_units.findMany({
    where: { projectId },
    select: {
      id: true,
      templateId: true,
      finishLevel: true,
      colourScheme: true,
    },
  });

  // Load all finish tier mappings for templates used in this project
  const templateIds = Array.from(
    new Set(
      units
        .map((u) => u.templateId)
        .filter((id): id is number => id !== null)
    )
  );

  if (templateIds.length === 0) {
    return {
      fullyMapped: 0,
      partiallyMapped: 0,
      unmapped: units.length,
    };
  }

  const mappings = await prisma.finish_tier_mappings.findMany({
    where: {
      templateId: { in: templateIds },
      isActive: true,
    },
    select: {
      templateId: true,
      finishLevel: true,
      colourScheme: true,
    },
  });

  // Build a lookup set: "templateId:finishLevel:colourScheme" and "templateId:finishLevel:*"
  const mappingKeys = new Set<string>();
  for (const m of mappings) {
    mappingKeys.add(
      `${m.templateId}:${m.finishLevel}:${m.colourScheme ?? '*'}`
    );
    // Also add a wildcard key so we can check if at least a finish-level match exists
    mappingKeys.add(`${m.templateId}:${m.finishLevel}:*`);
  }

  let fullyMapped = 0;
  let partiallyMapped = 0;
  let unmapped = 0;

  for (const unit of units) {
    if (!unit.templateId || !unit.finishLevel) {
      unmapped++;
      continue;
    }

    // Check for exact match (template + finish level + colour scheme)
    const exactKey = `${unit.templateId}:${unit.finishLevel}:${unit.colourScheme ?? '*'}`;
    const wildcardKey = `${unit.templateId}:${unit.finishLevel}:*`;

    if (mappingKeys.has(exactKey)) {
      fullyMapped++;
    } else if (mappingKeys.has(wildcardKey)) {
      partiallyMapped++;
    } else {
      unmapped++;
    }
  }

  return { fullyMapped, partiallyMapped, unmapped };
}
