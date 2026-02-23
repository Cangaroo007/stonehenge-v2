import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Seed built-in edge profile templates.
 *
 * Edge assignments reference edge type *names* which are resolved at runtime
 * against the edge_types table (since IDs vary by environment). The seeder
 * stores the resolved edge-type IDs directly on each template row.
 *
 * "Raw" edges are represented as null (no edge type applied).
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

  // Standard polish = pencil round (the default polished edge in stone fabrication)
  const polishedId = findEdgeId('pencil');
  const pencilRoundId = findEdgeId('pencil');
  const bullnoseId = findEdgeId('bullnose');

  // Use first company ID (single-tenant system)
  const company = await prisma.companies.findFirst();
  if (!company) {
    console.warn('No company found — skipping edge template seeding');
    return;
  }

  const templates: Array<{
    name: string;
    description: string;
    edgeTop: string | null;
    edgeBottom: string | null;
    edgeLeft: string | null;
    edgeRight: string | null;
    suggestedPieceType: string | null;
  }> = [
    // ── Kitchen Edge Templates ──────────────────────────────────────────
    {
      name: 'Kitchen Standard',
      description: 'Front edge polished, rest against wall',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Kitchen — Front & Left Return',
      description: 'L-shaped kitchen with left return exposed',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Kitchen — Front & Right Return',
      description: 'L-shaped kitchen with right return exposed',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: polishedId,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Kitchen — Front & Both Returns',
      description: 'Peninsula with both sides exposed',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Kitchen — Pencil Round Front',
      description: 'Pencil round front edge only',
      edgeTop: pencilRoundId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      name: 'Kitchen — Bullnose Front',
      description: 'Bullnose front edge only',
      edgeTop: bullnoseId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },

    // ── Island Edge Templates ───────────────────────────────────────────
    {
      name: 'Island — All Polished',
      description: 'Freestanding island, all edges exposed',
      edgeTop: polishedId,
      edgeBottom: polishedId,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'ISLAND',
    },
    {
      name: 'Island — All Pencil Round',
      description: 'Premium island finish',
      edgeTop: pencilRoundId,
      edgeBottom: pencilRoundId,
      edgeLeft: pencilRoundId,
      edgeRight: pencilRoundId,
      suggestedPieceType: 'ISLAND',
    },
    {
      name: 'Island — All Bullnose',
      description: 'Full bullnose island',
      edgeTop: bullnoseId,
      edgeBottom: bullnoseId,
      edgeLeft: bullnoseId,
      edgeRight: bullnoseId,
      suggestedPieceType: 'ISLAND',
    },
    {
      name: 'Island — Front & Sides',
      description: 'Island against wall on one side',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'ISLAND',
    },

    // ── Bathroom & Vanity Edge Templates ────────────────────────────────
    {
      name: 'Vanity — Front Polish',
      description: 'Standard vanity, front only',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'VANITY',
    },
    {
      name: 'Vanity — Front & Left',
      description: 'Corner vanity with left exposed',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: null,
      suggestedPieceType: 'VANITY',
    },
    {
      name: 'Vanity — Front & Right',
      description: 'Corner vanity with right exposed',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: polishedId,
      suggestedPieceType: 'VANITY',
    },
    {
      name: 'Vanity — Floating (3 sides)',
      description: 'Wall-mounted floating vanity',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'VANITY',
    },

    // ── Splashback Edge Templates ───────────────────────────────────────
    {
      name: 'Splashback — Top Polish',
      description: 'Standard splashback, top edge polished',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'SPLASHBACK',
    },
    {
      name: 'Splashback — All Raw',
      description: 'Splashback with tile or wall above',
      edgeTop: null,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'SPLASHBACK',
    },
    {
      name: 'Splashback — Top & Sides',
      description: 'Freestanding splashback section',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'SPLASHBACK',
    },

    // ── Waterfall Edge Templates ────────────────────────────────────────
    {
      name: 'Waterfall — Outer Polish',
      description: 'Outer face polished',
      edgeTop: null,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: null,
      suggestedPieceType: 'WATERFALL',
    },
    {
      name: 'Waterfall — Both Sides',
      description: 'Both faces polished (rare)',
      edgeTop: null,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'WATERFALL',
    },

    // ── Utility Templates ───────────────────────────────────────────────
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
      name: 'All Polished',
      description: 'All edges polished',
      edgeTop: polishedId,
      edgeBottom: polishedId,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: null,
    },
    {
      name: 'All Pencil Round',
      description: 'All edges pencil round',
      edgeTop: pencilRoundId,
      edgeBottom: pencilRoundId,
      edgeLeft: pencilRoundId,
      edgeRight: pencilRoundId,
      suggestedPieceType: null,
    },
    {
      name: 'All Bullnose',
      description: 'All edges bullnose',
      edgeTop: bullnoseId,
      edgeBottom: bullnoseId,
      edgeLeft: bullnoseId,
      edgeRight: bullnoseId,
      suggestedPieceType: null,
    },
    {
      name: 'Window Sill — Front & Sides',
      description: 'Exposed window sill',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'WINDOW_SILL',
    },
    {
      name: 'Shelf — All Polished',
      description: 'Floating shelf, all exposed',
      edgeTop: polishedId,
      edgeBottom: polishedId,
      edgeLeft: polishedId,
      edgeRight: polishedId,
      suggestedPieceType: 'SHELF',
    },
    {
      name: 'Laundry — Front Polish',
      description: 'Standard laundry benchtop, front polished',
      edgeTop: polishedId,
      edgeBottom: null,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },

    // ── Benchtop variants (legacy names kept for backwards compat) ──────
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
  ];

  let upsertCount = 0;
  for (const t of templates) {
    const deterministicId = `builtin-${t.name.toLowerCase().replace(/[^a-z0-9]/g, '-')}`;

    await prisma.edge_profile_templates.upsert({
      where: { id: deterministicId },
      create: {
        id: deterministicId,
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
    upsertCount++;
  }

  console.log(`✅ Edge templates: ${upsertCount} rows`);
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
