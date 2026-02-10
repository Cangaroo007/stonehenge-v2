/**
 * POST /api/unit-blocks/parse-register
 *
 * Top-level endpoint for parsing a Finishes Register without an existing project.
 * Parses the register and auto-creates a new unit_block_project from the metadata.
 *
 * Flow:
 *   1. Upload PDF → parse with Claude Vision
 *   2. Auto-create a project using metadata from the register
 *   3. Return { projectId, parsed, fileId }
 *   4. User confirms via /api/unit-blocks/[projectId]/parse-register?action=confirm
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { uploadToR2 } from '@/lib/storage/r2';
import {
  parseFinishesRegister,
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

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json(
        { error: authResult.error },
        { status: authResult.status }
      );
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const projectNameOverride = formData.get('projectName') as string | null;

    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
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

    // Parse the document with Claude Vision
    const base64 = buffer.toString('base64');
    const parsed = await parseFinishesRegister(base64, file.type);

    // Determine project name: override > parsed from PDF > filename
    const projectName =
      projectNameOverride?.trim() ||
      parsed.projectName ||
      file.name.replace(/\.[^.]+$/, '');

    // Auto-create the project
    const project = await prisma.unit_block_projects.create({
      data: {
        name: projectName,
        projectType: mapProjectType(parsed.projectType),
        createdById: authResult.user.id,
      },
    });

    // Upload file to R2 with the new project ID
    const fileExtension = file.name.split('.').pop() || 'pdf';
    const storageKey = `unit-blocks/${project.id}/registers/${uuidv4()}.${fileExtension}`;
    await uploadToR2(storageKey, buffer, file.type);

    // Create file record
    const fileRecord = await prisma.unit_block_files.create({
      data: {
        projectId: project.id,
        fileName: file.name,
        fileType: 'FINISHES_REGISTER',
        storageKey,
        mimeType: file.type,
        fileSize: file.size,
      },
    });

    console.log(
      `[ParseRegister] Auto-created project ${project.id} "${projectName}" ` +
        `with ${parsed.units.length} units from ${file.name} ` +
        `(confidence: ${parsed.confidence}, type: ${parsed.projectType})`
    );

    return NextResponse.json({
      projectId: project.id,
      parsed,
      fileId: fileRecord.id,
    });
  } catch (error) {
    console.error('[ParseRegister] Error:', error);
    return NextResponse.json(
      {
        error: 'Failed to parse register',
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
