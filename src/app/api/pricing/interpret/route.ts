import { NextRequest, NextResponse } from 'next/server';
import { processPriceListUpload } from '@/lib/services/ai-price-interpreter';

/**
 * POST /api/pricing/interpret
 * Receives a file upload (text/CSV content) and returns AI-suggested price mappings.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { fileContent, fileType } = body;

    if (!fileContent || typeof fileContent !== 'string') {
      return NextResponse.json(
        { error: 'fileContent is required and must be a string' },
        { status: 400 }
      );
    }

    if (!fileType || typeof fileType !== 'string') {
      return NextResponse.json(
        { error: 'fileType is required and must be a string (e.g., "csv", "text")' },
        { status: 400 }
      );
    }

    // Call the AI interpretation service
    const result = await processPriceListUpload(fileContent, fileType);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error in /api/pricing/interpret:', error);
    return NextResponse.json(
      {
        error: 'Failed to interpret price list',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
