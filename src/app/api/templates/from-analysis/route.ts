/**
 * POST /api/templates/from-analysis
 *
 * Converts drawing analysis results into a unit type template.
 * Uses the analysis-to-template adapter to map extracted pieces,
 * edges, and cutouts into TemplateData format with confidence
 * filtering and warning generation.
 *
 * Accepts either:
 * - analysisId: loads full DrawingAnalysisResult from DB
 * - analysisData: simplified data from the DrawingImport review step
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import type { Prisma } from '@prisma/client';
import type { DrawingAnalysisResult } from '@/lib/types/drawing-analysis';
import {
  convertAnalysisToTemplate,
  convertSimplifiedToTemplate,
  type SimplifiedAnalysisData,
  type AdapterOptions,
} from '@/lib/services/analysis-to-template-adapter';

export async function POST(request: NextRequest) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const body = await request.json();
    const { analysisId, analysisData, name, unitTypeCode, projectId, description } = body;

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 });
    }
    if (!unitTypeCode || typeof unitTypeCode !== 'string' || unitTypeCode.trim().length === 0) {
      return NextResponse.json({ error: 'unitTypeCode is required' }, { status: 400 });
    }

    const adapterOptions: AdapterOptions = {
      unitTypeCode: unitTypeCode.trim(),
      name: name.trim(),
      description: description || undefined,
      projectId: projectId ? parseInt(projectId, 10) : undefined,
      analysisId: analysisId ? parseInt(analysisId, 10) : undefined,
      skipLowConfidence: true,
    };

    let result;

    if (analysisId) {
      // Load full analysis result from database
      const analysis = await prisma.quote_drawing_analyses.findUnique({
        where: { id: parseInt(analysisId, 10) },
      });

      if (!analysis) {
        return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      }

      const fullResult = analysis.raw_results as unknown as DrawingAnalysisResult;

      if (!fullResult.pieces || fullResult.pieces.length === 0) {
        return NextResponse.json(
          { error: 'Analysis contains no extracted pieces' },
          { status: 400 }
        );
      }

      result = convertAnalysisToTemplate(fullResult, adapterOptions);
    } else if (analysisData) {
      // Use simplified data from the UI
      const simplified = analysisData as SimplifiedAnalysisData;

      if (!simplified.rooms || simplified.rooms.length === 0) {
        return NextResponse.json(
          { error: 'Analysis contains no rooms or pieces' },
          { status: 400 }
        );
      }

      result = convertSimplifiedToTemplate(simplified, adapterOptions);
    } else {
      return NextResponse.json(
        { error: 'Either analysisId or analysisData is required' },
        { status: 400 }
      );
    }

    if (result.piecesConverted === 0) {
      return NextResponse.json(
        { error: 'No valid pieces found in analysis results', warnings: result.warnings },
        { status: 400 }
      );
    }

    // Create template record
    const template = await prisma.unit_type_templates.create({
      data: {
        name: name.trim(),
        unitTypeCode: unitTypeCode.trim(),
        description:
          description ||
          `Created from drawing analysis${analysisId ? ` (analysis #${analysisId})` : ''}`,
        projectId: projectId ? parseInt(projectId, 10) : null,
        sourceDrawingId: analysisId ? parseInt(analysisId, 10) : null,
        templateData: result.templateData as unknown as Prisma.InputJsonValue,
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
      },
    });

    return NextResponse.json(
      {
        templateId: template.id,
        name: template.name,
        unitTypeCode: template.unitTypeCode,
        projectId: template.projectId,
        project: template.project,
        templateData: result.templateData,
        piecesConverted: result.piecesConverted,
        piecesSkipped: result.piecesSkipped,
        warnings: result.warnings,
        roomCount: result.templateData.rooms.length,
        estimatedArea_sqm: result.templateData.estimatedArea_sqm,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating template from analysis:', error);

    // Handle unique constraint violation (duplicate unitTypeCode+projectId)
    if (
      error instanceof Error &&
      error.message.includes('Unique constraint')
    ) {
      return NextResponse.json(
        { error: 'A template already exists for this unit type code in this project' },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create template from analysis' },
      { status: 500 }
    );
  }
}
