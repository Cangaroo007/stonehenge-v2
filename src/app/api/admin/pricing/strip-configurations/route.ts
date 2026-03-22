import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const configs = await prisma.strip_configurations.findMany({
      where: { company_id: auth.user.companyId },
      orderBy: { stripType: 'asc' },
    });

    // If no configs exist, return seeded defaults
    if (configs.length === 0) {
      return NextResponse.json([
        {
          id: null,
          stripType: 'STANDARD',
          label: 'Standard Polish',
          stripWidthMm: 108,
          visibleWidthMm: 60,
          laminationWidthMm: 40,
          kerfLossMm: 8,
          isActive: true,
          isDefault: true,
        },
        {
          id: null,
          stripType: 'MITRE',
          label: 'Mitre',
          stripWidthMm: 48,
          visibleWidthMm: 40,
          laminationWidthMm: 40,
          kerfLossMm: 8,
          isActive: true,
          isDefault: true,
        },
        {
          id: null,
          stripType: 'WIDE',
          label: 'Wide / Waterfall',
          stripWidthMm: 348,
          visibleWidthMm: 300,
          laminationWidthMm: 40,
          kerfLossMm: 8,
          isActive: true,
          isDefault: true,
        },
      ]);
    }

    return NextResponse.json(configs);
  } catch (error) {
    console.error('Error fetching strip configurations:', error);
    return NextResponse.json(
      { error: 'Failed to fetch strip configurations' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(['ADMIN']);
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }

    const body = await request.json();
    const { stripType, label, stripWidthMm, visibleWidthMm, laminationWidthMm, kerfLossMm } = body;

    if (!stripType || !label || !stripWidthMm || !visibleWidthMm) {
      return NextResponse.json(
        { error: 'stripType, label, stripWidthMm, and visibleWidthMm are required' },
        { status: 400 }
      );
    }

    const config = await prisma.strip_configurations.upsert({
      where: {
        company_id_stripType: {
          company_id: auth.user.companyId,
          stripType,
        },
      },
      update: {
        label,
        stripWidthMm: parseInt(stripWidthMm),
        visibleWidthMm: parseInt(visibleWidthMm),
        laminationWidthMm: laminationWidthMm ? parseInt(laminationWidthMm) : 40,
        kerfLossMm: kerfLossMm ? parseInt(kerfLossMm) : 8,
        isActive: true,
      },
      create: {
        company_id: auth.user.companyId,
        stripType,
        label,
        stripWidthMm: parseInt(stripWidthMm),
        visibleWidthMm: parseInt(visibleWidthMm),
        laminationWidthMm: laminationWidthMm ? parseInt(laminationWidthMm) : 40,
        kerfLossMm: kerfLossMm ? parseInt(kerfLossMm) : 8,
      },
    });

    return NextResponse.json(config);
  } catch (error) {
    console.error('Error saving strip configuration:', error);
    return NextResponse.json(
      { error: 'Failed to save strip configuration' },
      { status: 500 }
    );
  }
}
