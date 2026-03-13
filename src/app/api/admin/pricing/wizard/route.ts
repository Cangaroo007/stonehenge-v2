import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ('error' in auth) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const { companyId } = auth.user;
    const organisationId = `company-${companyId}`;

    const body = await request.json();
    const { step, data } = body;

    if (step === undefined || !data) {
      return NextResponse.json(
        { error: 'Missing required fields: step, data' },
        { status: 400 }
      );
    }

    // Ensure pricing_settings exists (upsert)
    let settings = await prisma.pricing_settings.findUnique({
      where: { organisation_id: organisationId },
    });

    if (!settings) {
      settings = await prisma.pricing_settings.create({
        data: {
          id: crypto.randomUUID(),
          organisation_id: organisationId,
          updated_at: new Date(),
        },
      });
    }

    const pricingSettingsId = settings.id;

    switch (step) {
      case 1: {
        // Cutting: upsert service_rates WHERE serviceType=CUTTING, fabricationCategory=ENGINEERED
        await prisma.service_rates.upsert({
          where: {
            pricing_settings_id_serviceType_fabricationCategory: {
              pricing_settings_id: pricingSettingsId,
              serviceType: 'CUTTING',
              fabricationCategory: 'ENGINEERED',
            },
          },
          update: {
            rate20mm: data.rate20mm,
            rate40mm: data.rate40mm,
            updated_at: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            pricing_settings_id: pricingSettingsId,
            serviceType: 'CUTTING',
            fabricationCategory: 'ENGINEERED',
            name: 'Cutting',
            rate20mm: data.rate20mm,
            rate40mm: data.rate40mm,
            updated_at: new Date(),
          },
        });

        // Also save the cutting unit preference on pricing_settings
        if (data.unit) {
          await prisma.pricing_settings.update({
            where: { id: pricingSettingsId },
            data: {
              cutting_unit: data.unit,
              updated_at: new Date(),
            },
          });
        }
        break;
      }

      case 2: {
        // Edge profiles: upsert edge_type_category_rates for ENGINEERED category
        if (data.chargeExtra && Array.isArray(data.profiles)) {
          for (const profile of data.profiles) {
            // Find the edge type by name
            const edgeType = await prisma.edge_types.findFirst({
              where: { name: profile.name },
            });
            if (!edgeType) continue;

            await prisma.edge_type_category_rates.upsert({
              where: {
                edgeTypeId_fabricationCategory_pricingSettingsId: {
                  edgeTypeId: edgeType.id,
                  fabricationCategory: 'ENGINEERED',
                  pricingSettingsId: pricingSettingsId,
                },
              },
              update: {
                rate20mm: profile.rate20mm,
                rate40mm: profile.rate40mm,
              },
              create: {
                edgeTypeId: edgeType.id,
                fabricationCategory: 'ENGINEERED',
                pricingSettingsId: pricingSettingsId,
                rate20mm: profile.rate20mm,
                rate40mm: profile.rate40mm,
              },
            });
          }
        }
        break;
      }

      case 3: {
        // Material multipliers: upsert service_rates for CUTTING per fabrication category
        if (data.chargeDifferent && Array.isArray(data.multipliers)) {
          const baseRate20 = data.baseCuttingRate20mm;
          const baseRate40 = data.baseCuttingRate40mm;

          for (const m of data.multipliers) {
            const rate20 = baseRate20 * m.multiplier;
            const rate40 = baseRate40 * m.multiplier;

            await prisma.service_rates.upsert({
              where: {
                pricing_settings_id_serviceType_fabricationCategory: {
                  pricing_settings_id: pricingSettingsId,
                  serviceType: 'CUTTING',
                  fabricationCategory: m.category,
                },
              },
              update: {
                rate20mm: rate20,
                rate40mm: rate40,
                updated_at: new Date(),
              },
              create: {
                id: crypto.randomUUID(),
                pricing_settings_id: pricingSettingsId,
                serviceType: 'CUTTING',
                fabricationCategory: m.category,
                name: `Cutting - ${m.label}`,
                rate20mm: rate20,
                rate40mm: rate40,
                updated_at: new Date(),
              },
            });
          }
        }
        break;
      }

      case 4: {
        // Installation: upsert service_rates WHERE serviceType=INSTALLATION
        await prisma.service_rates.upsert({
          where: {
            pricing_settings_id_serviceType_fabricationCategory: {
              pricing_settings_id: pricingSettingsId,
              serviceType: 'INSTALLATION',
              fabricationCategory: 'ENGINEERED',
            },
          },
          update: {
            rate20mm: data.rate20mm,
            rate40mm: data.rate40mm,
            updated_at: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            pricing_settings_id: pricingSettingsId,
            serviceType: 'INSTALLATION',
            fabricationCategory: 'ENGINEERED',
            name: 'Installation',
            rate20mm: data.rate20mm,
            rate40mm: data.rate40mm,
            updated_at: new Date(),
          },
        });
        break;
      }

      case 5: {
        // Cutouts: update cutout_types.baseRate by ID (global table)
        if (Array.isArray(data)) {
          for (const cutout of data) {
            if (!cutout.id) continue;
            await prisma.cutout_types.update({
              where: { id: cutout.id },
              data: {
                baseRate: cutout.baseRate,
                updatedAt: new Date(),
              },
            });
          }
        }
        break;
      }

      case 6: {
        // Special features: WATERFALL_END, TEMPLATING, DELIVERY as service_rates
        await prisma.service_rates.upsert({
          where: {
            pricing_settings_id_serviceType_fabricationCategory: {
              pricing_settings_id: pricingSettingsId,
              serviceType: 'WATERFALL_END',
              fabricationCategory: 'ENGINEERED',
            },
          },
          update: {
            rate20mm: data.waterfall20mm,
            rate40mm: data.waterfall40mm,
            updated_at: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            pricing_settings_id: pricingSettingsId,
            serviceType: 'WATERFALL_END',
            fabricationCategory: 'ENGINEERED',
            name: 'Waterfall End',
            rate20mm: data.waterfall20mm,
            rate40mm: data.waterfall40mm,
            updated_at: new Date(),
          },
        });

        // Templating — rate stored in rate20mm (fixed fee), rate40mm=0
        await prisma.service_rates.upsert({
          where: {
            pricing_settings_id_serviceType_fabricationCategory: {
              pricing_settings_id: pricingSettingsId,
              serviceType: 'TEMPLATING',
              fabricationCategory: 'ENGINEERED',
            },
          },
          update: {
            rate20mm: data.templatingEnabled ? data.templatingFee : 0,
            rate40mm: 0,
            updated_at: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            pricing_settings_id: pricingSettingsId,
            serviceType: 'TEMPLATING',
            fabricationCategory: 'ENGINEERED',
            name: 'Templating',
            rate20mm: data.templatingEnabled ? data.templatingFee : 0,
            rate40mm: 0,
            updated_at: new Date(),
          },
        });

        // Delivery — rate per km stored in rate20mm, rate40mm=0
        await prisma.service_rates.upsert({
          where: {
            pricing_settings_id_serviceType_fabricationCategory: {
              pricing_settings_id: pricingSettingsId,
              serviceType: 'DELIVERY',
              fabricationCategory: 'ENGINEERED',
            },
          },
          update: {
            rate20mm: data.deliveryEnabled ? data.deliveryPerKm : 0,
            rate40mm: 0,
            updated_at: new Date(),
          },
          create: {
            id: crypto.randomUUID(),
            pricing_settings_id: pricingSettingsId,
            serviceType: 'DELIVERY',
            fabricationCategory: 'ENGINEERED',
            name: 'Delivery',
            rate20mm: data.deliveryEnabled ? data.deliveryPerKm : 0,
            rate40mm: 0,
            updated_at: new Date(),
          },
        });
        break;
      }

      case 7: {
        // GST: update pricing_settings.gst_rate
        const gstDecimal = data.gstRate / 100; // Convert percentage to decimal (10% → 0.10)
        await prisma.pricing_settings.update({
          where: { id: pricingSettingsId },
          data: {
            gst_rate: gstDecimal,
            updated_at: new Date(),
          },
        });
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown step: ${step}` },
          { status: 400 }
        );
    }

    return NextResponse.json({ success: true, step });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to save wizard step';
    console.error('Wizard save error:', error);
    return NextResponse.json(
      { error: message },
      { status: message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}
