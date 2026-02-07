import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { uploadToR2, deleteFromR2 } from '@/lib/storage/r2';

export const dynamic = 'force-dynamic';

// POST /api/company/logo - Upload company logo to R2
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse form data
    const formData = await request.formData();
    const file = formData.get('logo') as File;

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/svg+xml'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only PNG, JPG, and SVG are allowed.' },
        { status: 400 }
      );
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 }
      );
    }

    // Get the company
    const company = await prisma.companies.findFirst();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    // Generate storage key
    const extension = file.name.split('.').pop();
    const storageKey = `company-logos/${company.id}-${Date.now()}.${extension}`;

    // Convert file to buffer
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Upload to R2
    await uploadToR2(storageKey, buffer, file.type);

    // Delete old logo if exists
    if (company.logo_storage_key) {
      try {
        await deleteFromR2(company.logo_storage_key);
      } catch (error) {
        console.error('Error deleting old logo:', error);
        // Continue even if deletion fails
      }
    }

    // Update company with new logo storage key
    const updatedCompany = await prisma.companies.update({
      where: { id: company.id },
      data: {
        logo_storage_key: storageKey,
      },
      select: {
        id: true,
        logo_storage_key: true,
        updated_at: true,
      },
    });

    return NextResponse.json({
      success: true,
      storageKey: updatedCompany.logo_storage_key,
      message: 'Logo uploaded successfully',
    });
  } catch (error) {
    console.error('Error uploading logo:', error);
    return NextResponse.json(
      { error: 'Failed to upload logo' },
      { status: 500 }
    );
  }
}

// DELETE /api/company/logo - Remove company logo
export async function DELETE() {
  try {
    const user = await getCurrentUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get the company
    const company = await prisma.companies.findFirst();

    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (!company.logo_storage_key) {
      return NextResponse.json({ error: 'No logo to delete' }, { status: 400 });
    }

    // Delete from R2
    try {
      await deleteFromR2(company.logo_storage_key);
    } catch (error) {
      console.error('Error deleting logo from R2:', error);
      // Continue to update database even if R2 deletion fails
    }

    // Update company to remove logo
    await prisma.companies.update({
      where: { id: company.id },
      data: {
        logo_storage_key: null,
      },
    });

    return NextResponse.json({
      success: true,
      message: 'Logo deleted successfully',
    });
  } catch (error) {
    console.error('Error deleting logo:', error);
    return NextResponse.json(
      { error: 'Failed to delete logo' },
      { status: 500 }
    );
  }
}
