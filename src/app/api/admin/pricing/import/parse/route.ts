import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ingestPriceList } from '@/lib/services/material-ingestor';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const supplierId = formData.get('supplierId') as string | null;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
    if (!isPdf) {
      return NextResponse.json(
        { error: 'Only PDF files are supported. Excel support coming soon.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString('base64');

    const proposal = await ingestPriceList(
      base64,
      auth.user.companyId,
      supplierId ?? undefined,
    );

    return NextResponse.json(proposal);
  } catch (error) {
    console.error('Import parse error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to parse price list' },
      { status: 500 },
    );
  }
}
