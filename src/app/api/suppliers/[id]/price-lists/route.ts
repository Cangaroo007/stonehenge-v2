import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { parsePriceListPdf } from '@/lib/services/price-list-parser';
import { previewPriceListUpdate } from '@/lib/services/price-list-applier';
import { uploadToR2 } from '@/lib/storage/r2';

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: supplierId } = await params;

    // Verify supplier belongs to user's company
    const supplier = await prisma.suppliers.findFirst({
      where: { id: supplierId, company_id: auth.user.companyId },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const uploads = await prisma.price_list_uploads.findMany({
      where: { supplier_id: supplierId, company_id: auth.user.companyId },
      orderBy: { uploaded_at: 'desc' },
      select: {
        id: true,
        file_name: true,
        uploaded_at: true,
        status: true,
        materials_created: true,
        materials_updated: true,
        materials_discontinued: true,
        materials_skipped: true,
        processed_at: true,
        error_message: true,
      },
    });

    return NextResponse.json(uploads);
  } catch (error) {
    console.error('Error fetching price list uploads:', error);
    return NextResponse.json({ error: 'Failed to fetch uploads' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth(['ADMIN', 'SALES_MANAGER']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const { id: supplierId } = await params;

    // Verify supplier belongs to user's company
    const supplier = await prisma.suppliers.findFirst({
      where: { id: supplierId, company_id: auth.user.companyId },
    });

    if (!supplier) {
      return NextResponse.json({ error: 'Supplier not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file || !file.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'PDF file required' }, { status: 400 });
    }

    // 1. Upload PDF to R2
    const buffer = Buffer.from(await file.arrayBuffer());
    const storageKey = `price-lists/${supplierId}/${Date.now()}-${file.name}`;
    await uploadToR2(storageKey, buffer, 'application/pdf');

    // 2. Create PriceListUpload record
    const upload = await prisma.price_list_uploads.create({
      data: {
        supplier_id: supplierId,
        company_id: auth.user.companyId,
        file_name: file.name,
        file_url: storageKey,
        status: 'PROCESSING',
      },
    });

    try {
      // 3. Send to Claude for parsing
      const base64 = buffer.toString('base64');
      const parseResult = await parsePriceListPdf(base64);

      // 4. Store extraction results
      await prisma.price_list_uploads.update({
        where: { id: upload.id },
        data: {
          extracted_data: JSON.parse(JSON.stringify(parseResult)),
          status: 'REVIEW',
        },
      });

      // 5. Preview matches against existing materials
      const preview = await previewPriceListUpdate(
        auth.user.companyId,
        supplierId,
        parseResult
      );

      return NextResponse.json({
        uploadId: upload.id,
        supplierName: parseResult.supplierName,
        effectiveDate: parseResult.effectiveDate,
        totalMaterials: parseResult.materials.length,
        preview: preview.map((m) => ({
          name: m.parsed.name,
          productCode: m.parsed.productCode,
          range: m.parsed.range,
          costPrice: m.parsed.costPrice,
          wholesalePrice: m.parsed.wholesalePrice,
          matchType: m.matchType,
          action: m.action,
          priceChange: m.priceChange,
        })),
      });
    } catch (error) {
      await prisma.price_list_uploads.update({
        where: { id: upload.id },
        data: {
          status: 'FAILED',
          error_message:
            error instanceof Error ? error.message : 'Unknown error',
        },
      });

      return NextResponse.json(
        {
          error: 'Failed to parse price list',
          details: error instanceof Error ? error.message : 'Unknown',
        },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error uploading price list:', error);
    return NextResponse.json(
      { error: 'Failed to upload price list' },
      { status: 500 }
    );
  }
}
