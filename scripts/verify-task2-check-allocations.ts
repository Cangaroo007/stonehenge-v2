import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function run() {
  const quote = await prisma.quotes.findUnique({
    where: { id: 55 },
    select: {
      subtotal: true,
      tax_amount: true,
      total: true,
      calculation_breakdown: true,
    },
  });

  const breakdown = quote!.calculation_breakdown as any;
  const pieces = breakdown?.breakdown?.pieces ?? [];

  console.log('=== QUOTE 55 VERIFICATION ===');
  console.log('Subtotal (must be 5275.11):    ', Number(quote!.subtotal).toFixed(2));
  console.log('Total inc GST (must be 5802.62):', Number(quote!.total).toFixed(2));
  console.log('');

  let totalMaterial = 0;
  let totalInstallation = 0;

  for (const piece of pieces) {
    const mat = piece.materials?.total ?? 0;
    const inst = piece.fabrication?.installation?.total ?? 0;
    const pieceTotal = piece.pieceTotal ?? 0;
    totalMaterial += mat;
    totalInstallation += inst;

    console.log('Piece:', piece.pieceName);
    console.log('  materials.total:    ', mat.toFixed(2));
    console.log('  installation.total: ', inst.toFixed(2));
    console.log('  pieceTotal:         ', pieceTotal.toFixed(2));
    console.log('');
  }

  console.log('=== ALLOCATION SUMS ===');
  console.log('Sum material allocations (must be ~3192.00): ', totalMaterial.toFixed(2));
  console.log('Sum installation allocations (must be ~714.12):', totalInstallation.toFixed(2));
  console.log('');

  const materialOk = Math.abs(totalMaterial - 3192) < 0.05;
  const installationOk = Math.abs(totalInstallation - 714.12) < 0.05;
  const subtotalOk = Math.abs(Number(quote!.subtotal) - 5275.11) < 0.05;
  const noWholeSlab = pieces.every((p: any) => (p.materials?.total ?? 0) < 1596);

  console.log('=== CHECKS ===');
  console.log('Material sums to 3192:            ', materialOk ? 'PASS' : 'FAIL');
  console.log('Installation sums to 714.12:      ', installationOk ? 'PASS' : 'FAIL');
  console.log('Subtotal unchanged at 5275.11:    ', subtotalOk ? 'PASS' : 'FAIL');
  console.log('No piece has full slab (>= 1596): ', noWholeSlab ? 'PASS' : 'FAIL - fix not applied');

  await prisma.$disconnect();
}

run().catch(console.error);
