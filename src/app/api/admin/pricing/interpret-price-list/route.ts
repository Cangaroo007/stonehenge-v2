import { NextRequest, NextResponse } from 'next/server';
import { interpretPriceList } from '@/lib/services/ai-price-interpreter';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { fileContent, fileName } = await request.json();

    if (!fileContent) {
      return NextResponse.json(
        { error: 'File content is required' },
        { status: 400 }
      );
    }

    // Call the AI interpretation service
    const result = await interpretPriceList(fileContent);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error interpreting price list:', error);
    return NextResponse.json(
      {
        error: 'Failed to interpret price list',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
