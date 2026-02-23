import { NextRequest, NextResponse } from 'next/server';
import { Decimal } from '@prisma/client/runtime/library';
import prisma from '@/lib/db';
import { requireAuth } from '@/lib/auth';

/**
 * Volume tier thresholds (matching unit-block-calculator.ts)
 */
const VOLUME_TIERS = [
  { tierId: 'SMALL', name: 'Small Project', min: 0, max: 50, discountPercent: 0 },
  { tierId: 'MEDIUM', name: 'Medium Project', min: 50, max: 200, discountPercent: 5 },
  { tierId: 'LARGE', name: 'Large Project', min: 200, max: 500, discountPercent: 10 },
  { tierId: 'ENTERPRISE', name: 'Enterprise', min: 500, max: null, discountPercent: 15 },
];

function determineVolumeTier(totalAreaSqm: number) {
  for (const tier of VOLUME_TIERS) {
    const aboveMin = totalAreaSqm >= tier.min;
    const belowMax = tier.max === null || totalAreaSqm < tier.max;
    if (aboveMin && belowMax) {
      return tier;
    }
  }
  return VOLUME_TIERS[VOLUME_TIERS.length - 1];
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authResult = await requireAuth();
    if ('error' in authResult) {
      return NextResponse.json({ error: authResult.error }, { status: authResult.status });
    }

    const { id } = await params;
    const projectId = parseInt(id, 10);
    if (isNaN(projectId)) {
      return NextResponse.json({ error: 'Invalid project ID' }, { status: 400 });
    }

    const project = await prisma.unit_block_projects.findUnique({
      where: { id: projectId },
      include: {
        units: {
          include: {
            quote: {
              include: {
                quote_rooms: {
                  include: {
                    quote_pieces: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    // Calculate total area and subtotal from linked quotes
    let totalAreaSqm = new Decimal(0);
    let subtotalExGst = new Decimal(0);

    for (const unit of project.units) {
      if (unit.quote) {
        // Sum piece areas from quote rooms
        for (const room of unit.quote.quote_rooms) {
          for (const piece of room.quote_pieces) {
            totalAreaSqm = totalAreaSqm.plus(piece.area_sqm);
          }
        }
        // Use quote subtotal
        subtotalExGst = subtotalExGst.plus(unit.quote.subtotal);
      }
    }

    // Determine volume tier
    const totalAreaNum = totalAreaSqm.toNumber();
    const tier = determineVolumeTier(totalAreaNum);

    // Calculate discount
    const discountPercent = new Decimal(tier.discountPercent);
    const discountAmount = subtotalExGst.times(discountPercent).dividedBy(100);
    const afterDiscount = subtotalExGst.minus(discountAmount);

    // GST from tenant's pricing settings (Rule 22: no hardcoded prices)
    const pricingSettings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: `company-${project.company_id}` },
    });
    const gstRate = pricingSettings?.gst_rate
      ? new Decimal(pricingSettings.gst_rate.toString())
      : new Decimal('0.10');
    const gstAmount = afterDiscount.times(gstRate);
    const grandTotal = afterDiscount.plus(gstAmount);

    // Update project with calculated values
    const updated = await prisma.unit_block_projects.update({
      where: { id: projectId },
      data: {
        totalArea_sqm: new Decimal(totalAreaSqm.toFixed(4)),
        volumeTier: tier.tierId,
        volumeDiscount: new Decimal(discountPercent.toFixed(2)),
        subtotalExGst: new Decimal(subtotalExGst.toFixed(2)),
        discountAmount: new Decimal(discountAmount.toFixed(2)),
        gstAmount: new Decimal(gstAmount.toFixed(2)),
        grandTotal: new Decimal(grandTotal.toFixed(2)),
      },
      include: {
        customer: {
          select: { id: true, name: true, company: true },
        },
        units: {
          orderBy: { unitNumber: 'asc' },
          include: {
            quote: {
              select: {
                id: true,
                quote_number: true,
                status: true,
                subtotal: true,
                total: true,
              },
            },
          },
        },
      },
    });

    return NextResponse.json({
      project: updated,
      calculation: {
        totalAreaSqm: totalAreaSqm.toFixed(4),
        volumeTier: tier,
        subtotalExGst: subtotalExGst.toFixed(2),
        discountPercent: tier.discountPercent,
        discountAmount: discountAmount.toFixed(2),
        gstAmount: gstAmount.toFixed(2),
        grandTotal: grandTotal.toFixed(2),
      },
    });
  } catch (error) {
    console.error('Error calculating unit block project:', error);
    return NextResponse.json({ error: 'Failed to calculate project' }, { status: 500 });
  }
}
