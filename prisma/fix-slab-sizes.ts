import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const r1 = await prisma.materials.updateMany({ where: { slab_length_mm: 3000 }, data: { slab_length_mm: 3200 } });
  const r2 = await prisma.materials.updateMany({ where: { slab_width_mm: 1400 }, data: { slab_width_mm: 1600 } });
  console.log('Updated length:', r1.count, 'width:', r2.count);
  const mats = await prisma.materials.findMany({ select: { name: true, slab_length_mm: true, slab_width_mm: true }, take: 5 });
  console.table(mats);
  await prisma.$disconnect();
}
main();
