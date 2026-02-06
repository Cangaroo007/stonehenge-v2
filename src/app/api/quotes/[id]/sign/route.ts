import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth';
import { createAuditLog, getClientIp, getUserAgent } from '@/lib/audit';
import prisma from '@/lib/db';
import crypto from 'crypto';

/**
 * POST /api/quotes/[id]/sign
 * Sign a quote electronically with legal compliance data
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const quoteId = parseInt(id);

    if (isNaN(quoteId)) {
      return NextResponse.json({ error: 'Invalid quote ID' }, { status: 400 });
    }

    // Get current user (may be customer or staff)
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the quote
    const quote = await prisma.quote.findUnique({
      where: { id: quoteId },
      include: {
        customer: true,
        signature: true,
      },
    });

    if (!quote) {
      return NextResponse.json({ error: 'Quote not found' }, { status: 404 });
    }

    // Check if quote is already signed
    if (quote.signature) {
      return NextResponse.json(
        { error: 'Quote has already been signed' },
        { status: 400 }
      );
    }

    // Parse request body
    const body = await request.json();
    const { signatureData, signatureType, signerName, signerEmail } = body;

    // Validation
    if (!signatureData || !signatureType || !signerName || !signerEmail) {
      return NextResponse.json(
        { error: 'Missing required signature fields' },
        { status: 400 }
      );
    }

    if (!['typed', 'drawn'].includes(signatureType)) {
      return NextResponse.json(
        { error: 'Invalid signature type' },
        { status: 400 }
      );
    }

    // Capture legal compliance data
    const ipAddress = getClientIp(request.headers);
    const userAgent = getUserAgent(request.headers);
    const timestamp = new Date();

    // Generate document hash (hash of quote details for verification)
    const documentContent = JSON.stringify({
      quoteNumber: quote.quoteNumber,
      customerId: quote.customerId,
      total: quote.total.toString(),
      subtotal: quote.subtotal.toString(),
      taxAmount: quote.taxAmount.toString(),
      taxRate: quote.taxRate.toString(),
    });
    const documentHash = crypto
      .createHash('sha256')
      .update(documentContent)
      .digest('hex');

    // Get quote version (could be enhanced with actual versioning)
    const quoteVersion = `v${new Date(quote.updatedAt).getTime()}`;

    // Create signature record with legal compliance data
    const signature = await prisma.quoteSignature.create({
      data: {
        quoteId,
        userId: currentUser.id,
        signatureData,
        signatureType,
        signerName,
        signerEmail,
        ipAddress,
        userAgent,
        signedAt: timestamp,
        documentHash,
        documentVersion: quoteVersion,
      },
    });

    // Update quote status to ACCEPTED
    await prisma.quote.update({
      where: { id: quoteId },
      data: {
        status: 'ACCEPTED',
      },
    });

    // Create audit log
    await createAuditLog({
      userId: currentUser.id,
      action: 'signed',
      entityType: 'quote',
      entityId: String(quoteId),
      changes: {
        status: { from: quote.status, to: 'ACCEPTED' },
        signedBy: signerName,
        signedAt: timestamp.toISOString(),
      },
      ipAddress,
      userAgent,
    });

    // TODO: Send confirmation email to customer and sales team
    // This would integrate with your email service (SendGrid, AWS SES, etc.)
    // await sendSignatureConfirmationEmail({
    //   to: signerEmail,
    //   quoteNumber: quote.quoteNumber,
    //   customerName: quote.customer?.name,
    //   totalAmount: quote.total,
    //   signedAt: timestamp,
    // });

    return NextResponse.json({
      success: true,
      signature: {
        id: signature.id,
        signedAt: signature.signedAt,
        signerName: signature.signerName,
      },
    });
  } catch (error) {
    console.error('Error signing quote:', error);
    return NextResponse.json(
      { error: 'Failed to sign quote' },
      { status: 500 }
    );
  }
}
