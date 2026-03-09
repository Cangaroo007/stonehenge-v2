export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ingestPriceList } from '@/lib/services/material-ingestor';

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ('error' in auth) {
    return new Response(
      JSON.stringify({ error: auth.error }),
      { status: auth.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  const supplierId = formData.get('supplierId') as string | null;

  if (!file) {
    return new Response(
      JSON.stringify({ error: 'No file provided' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const isPdf =
    file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';
  if (!isPdf) {
    return new Response(
      JSON.stringify({ error: 'Only PDF files are supported.' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = buffer.toString('base64');

  try {
    const proposal = await ingestPriceList(
      base64,
      auth.user.companyId,
      supplierId ?? undefined,
    );
    return new Response(JSON.stringify(proposal), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[AI Import Error]', error);
    const message = error instanceof Error ? error.message : 'Failed to parse price list';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
