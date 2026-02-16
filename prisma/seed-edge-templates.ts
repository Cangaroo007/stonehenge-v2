import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed built-in edge profile templates.
 *
 * Edge assignments reference edge type *names* which are resolved at runtime
 * against the edge_types table (since IDs vary by environment). The seeder
 * stores the resolved edge-type IDs directly on each template row.
 */
export async function seedEdgeProfileTemplates() {
  // Resolve edge types by name
  const edgeTypes = await prisma.edge_types.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
  });

  function findEdgeId(nameFragment: string): string | null {
    const lower = nameFragment.toLowerCase();
    const et = edgeTypes.find((e) => e.name.toLowerCase().includes(lower));
    return et?.id ?? null;
  }

  const polishedId = findEdgeId('polish') ?? findEdgeId('pencil');
  const pencilRoundId = findEdgeId('pencil');

  // Use first company ID (single-tenant system)
  const company = await prisma.companies.findFirst();
  if (!company) {
    console.warn('No company found — skipping edge template seeding');
    return;
  }

  const templates = [
    {
      name: 'Standard Benchtop',
      description: 'Front edge polished, remaining edges raw',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Benchtop — Front & Sides',
      description: 'Front and both side edges polished, back raw',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Island — All Polished',
      description: 'All four edges polished for freestanding island',
      edgeTop: polishedId,
      edgeBottom: polishedId,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'ISLAND',
    },
    {
      name: 'Splashback — Top Only',
      description: 'Top edge polished for splashback',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'SPLASHBACK',
    },
    {
      name: 'Waterfall — One Side',
      description: 'Left side polished for waterfall end',
      edgeTop: null,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: null,
      suggestedPieceType: 'WATERFALL',
    },
    {
      name: 'Vanity — Front Polish',
      description: 'Front edge polished for vanity top',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'VANITY',
    },
    {
      name: 'All Raw (No Finish)',
      description: 'All edges left raw with no finish',
      edgeTop: null,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: null,
    },
    {
      name: 'All Pencil Round',
      description: 'All four edges with pencil round profile',
      edgeTop: pencilRoundId,
      edgeBottom: pencilRoundId,
      edgeLeft: pencilRoundId,
      edgeRight: pencilRoundId,
      suggestedPieceType: 'ISLAND',
    },
  ];

  for (const t of templates) {
    await prisma.edge_profile_templates.upsert({
      where: { id: `builtin-${t.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}` },
      create: {
        id: `builtin-${t.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
        companyId: company.id,
        name: t.name,
        description: t.description,
        edgeTop: t.edgeTop,
        edgeBottom: t.edgeBottom,
        edgeLeft: t.edgeLeft,
        edgeRight: t.edgeRight,
        isBuiltIn: true,
        isShared: true,
        createdById: null,
        suggestedPieceType: t.suggestedPieceType,
      },
      update: {
        name: t.name,
        description: t.description,
        edgeTop: t.edgeTop,
        edgeBottom: t.edgeBottom,
        edgeLeft: t.edgeLeft,
        edgeRight: t.edgeRight,
        suggestedPieceType: t.suggestedPieceType,
      },
    });
  }

  console.log(`Seeded ${templates.length} built-in edge profile templates`);
}

// Allow direct execution
if (require.main === module) {
  seedEdgeProfileTemplates()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
