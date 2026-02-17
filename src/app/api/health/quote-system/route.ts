import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, { status: string; detail?: string }> = {};

  // 1. Database connection
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok' };
  } catch {
    checks.database = { status: 'failed', detail: 'Cannot connect to database' };
  }

  // 2. ServiceRates configured for core types
  try {
    const rates = await prisma.service_rates.findMany({
      where: { isActive: true },
    });
    const types = Array.from(new Set(rates.map((r) => r.serviceType)));
    const required = ['CUTTING', 'POLISHING', 'INSTALLATION'] as const;
    const missing = required.filter((t) => !types.includes(t));
    checks.serviceRates =
      missing.length === 0
        ? { status: 'ok', detail: `${rates.length} active rates` }
        : { status: 'missing', detail: `Missing: ${missing.join(', ')}` };
  } catch {
    checks.serviceRates = { status: 'failed', detail: 'Query failed' };
  }

  // 3. Edge types exist
  try {
    const edgeTypes = await prisma.edge_types.findMany({
      where: { isActive: true },
    });
    checks.edgeTypes =
      edgeTypes.length > 0
        ? { status: 'ok', detail: `${edgeTypes.length} active edge types` }
        : { status: 'empty', detail: 'No edge types configured' };
  } catch {
    checks.edgeTypes = { status: 'failed', detail: 'Query failed' };
  }

  // 4. Cutout types exist
  try {
    const cutoutTypes = await prisma.cutout_types.findMany({
      where: { isActive: true },
    });
    checks.cutoutTypes =
      cutoutTypes.length > 0
        ? { status: 'ok', detail: `${cutoutTypes.length} active cutout types` }
        : { status: 'warning', detail: 'No cutout types — cutout pricing will fail' };
  } catch {
    checks.cutoutTypes = { status: 'failed', detail: 'Query failed' };
  }

  // 5. Materials exist
  try {
    const materials = await prisma.materials.findMany({
      where: { is_active: true },
    });
    checks.materials =
      materials.length > 0
        ? { status: 'ok', detail: `${materials.length} active materials` }
        : { status: 'warning', detail: 'No materials — material pricing will be $0' };
  } catch {
    checks.materials = { status: 'failed', detail: 'Query failed' };
  }

  // 6. Pricing settings
  try {
    const settings = await prisma.pricing_settings.findFirst();
    checks.pricingSettings = settings
      ? { status: 'ok' }
      : { status: 'warning', detail: 'Default pricing settings not configured' };
  } catch {
    checks.pricingSettings = { status: 'failed', detail: 'Query failed' };
  }

  // 7. Customers exist (for quote creation)
  try {
    const count = await prisma.customers.count();
    checks.customers =
      count > 0
        ? { status: 'ok', detail: `${count} customers` }
        : { status: 'warning', detail: 'No customers — quotes will have no customer assigned' };
  } catch {
    checks.customers = { status: 'failed', detail: 'Query failed' };
  }

  const hasFailed = Object.values(checks).some(
    (c) => c.status === 'failed' || c.status === 'missing' || c.status === 'empty',
  );

  return NextResponse.json({
    healthy: !hasFailed,
    checks,
    timestamp: new Date().toISOString(),
  });
}
