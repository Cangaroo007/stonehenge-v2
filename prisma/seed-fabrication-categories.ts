import { PrismaClient, FabricationCategory } from '@prisma/client';

const prisma = new PrismaClient();

// Map material names/types to fabrication categories
// This is a best-effort mapping — admin can override in Materials management
const CATEGORY_KEYWORDS: Record<string, FabricationCategory> = {
  // ENGINEERED
  caesarstone: FabricationCategory.ENGINEERED,
  silestone: FabricationCategory.ENGINEERED,
  essastone: FabricationCategory.ENGINEERED,
  smartstone: FabricationCategory.ENGINEERED,
  engineered: FabricationCategory.ENGINEERED,
  quartz: FabricationCategory.ENGINEERED,
  vicostone: FabricationCategory.ENGINEERED,
  cambria: FabricationCategory.ENGINEERED,

  // NATURAL_HARD
  granite: FabricationCategory.NATURAL_HARD,

  // NATURAL_SOFT
  marble: FabricationCategory.NATURAL_SOFT,
  travertine: FabricationCategory.NATURAL_SOFT,
  limestone: FabricationCategory.NATURAL_SOFT,
  onyx: FabricationCategory.NATURAL_SOFT,

  // NATURAL_PREMIUM
  quartzite: FabricationCategory.NATURAL_PREMIUM,
  dolomite: FabricationCategory.NATURAL_PREMIUM,

  // SINTERED
  porcelain: FabricationCategory.SINTERED,
  sintered: FabricationCategory.SINTERED,
  dekton: FabricationCategory.SINTERED,
  neolith: FabricationCategory.SINTERED,
  laminam: FabricationCategory.SINTERED,
};

async function main() {
  const materials = await prisma.materials.findMany();
  console.log(`Found ${materials.length} materials to categorise`);

  let updated = 0;
  for (const material of materials) {
    const nameLower = material.name.toLowerCase();
    let category = FabricationCategory.ENGINEERED; // default

    for (const [keyword, cat] of Object.entries(CATEGORY_KEYWORDS)) {
      if (nameLower.includes(keyword)) {
        category = cat;
        break;
      }
    }

    await prisma.materials.update({
      where: { id: material.id },
      data: { fabrication_category: category },
    });
    console.log(`  ${material.name} → ${category}`);
    updated++;
  }

  console.log(`\nUpdated ${updated} materials`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
