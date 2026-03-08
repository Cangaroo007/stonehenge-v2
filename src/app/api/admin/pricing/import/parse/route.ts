export const maxDuration = 300;

import { NextRequest } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { ingestPriceList } from '@/lib/services/material-ingestor';

// Helper: encode a Server-Sent Event frame
function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(request: NextRequest) {
  // Auth check — preserve exactly as existing
  const auth = await requireAuth();
  if ('error' in auth) {
    // For auth errors we can still return JSON immediately (fast path)
    return new Response(
      JSON.stringify({ error: auth.error }),
      { status: auth.status, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Parse form data
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

  // Stream the response so Railway's first-byte timeout is satisfied
  // immediately, while Claude processes the PDF in the background.
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Send first heartbeat immediately — this satisfies Railway's
      // 60-second "first byte timeout" before Claude even starts.
      controller.enqueue(encoder.encode(sseEvent('heartbeat', { status: 'processing' })));

      // Send a heartbeat every 8 seconds to keep the connection alive.
      const heartbeatInterval = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(sseEvent('heartbeat', { status: 'processing' })));
        } catch {
          // Controller may already be closed if client disconnected
          clearInterval(heartbeatInterval);
        }
      }, 8000);

      try {
        const proposal = await ingestPriceList(
          base64,
          auth.user.companyId,
          supplierId ?? undefined,
        );

        clearInterval(heartbeatInterval);
        controller.enqueue(encoder.encode(sseEvent('result', proposal)));
        controller.close();
      } catch (error) {
        clearInterval(heartbeatInterval);
        console.error('[AI Import Error]', error);
        const message =
          error instanceof Error ? error.message : 'Failed to parse price list';
        controller.enqueue(encoder.encode(sseEvent('error', { error: message })));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no', // Disables nginx buffering if present
    },
  });
}
