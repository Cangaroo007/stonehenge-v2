// seed-templates-only.js — Standalone seed for starter_templates + edge_profile_templates
// Usage: node prisma/seed-templates-only.js
// Idempotent (upsert-based) — safe to run multiple times.

const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function seedStarterTemplates() {
  console.log('🌱 Seeding starter templates...');

  // Edge type IDs (null = raw)
  const EDGE = {
    PENCIL_ROUND: 'cmlar3etc0000znatkbilb48y',
    BULLNOSE:     'cmlar3eth0001znathwq93rbm',
    ARRIS:        'cmlar3etm0002znat72h7jnx0',
    MITERED:      'cmlar3eu20006znatmv7mbivv',
    SQUARE_EASED: 'cmlar3ety0005znatiz8ez6mu',
  };

  // Helper: standard benchtop edges (front = bottom = pencil round, rest raw)
  const benchEdges = { top: null, bottom: EDGE.PENCIL_ROUND, left: null, right: null };
  // Island edges: front + back profiled (bottom + top)
  const islandEdges = { top: EDGE.PENCIL_ROUND, bottom: EDGE.PENCIL_ROUND, left: null, right: null };
  // Vanity edges: front only
  const vanityEdges = { top: null, bottom: EDGE.PENCIL_ROUND, left: null, right: null };
  // Floating vanity: front + both returns
  const floatingEdges = { top: null, bottom: EDGE.PENCIL_ROUND, left: EDGE.PENCIL_ROUND, right: EDGE.PENCIL_ROUND };

  const templates = [
    // ── KITCHEN: Straight ──
    {
      name: 'Straight Run — Small',
      description: 'Single wall, compact kitchen. Sink undermount.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop', pieceType: 'BENCHTOP', lengthMm: 2100, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Straight Run — Standard',
      description: 'Single wall, full-size. Sink + 600mm cooktop.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop', pieceType: 'BENCHTOP', lengthMm: 2700, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }, { type: 'Cooktop/Hotplate', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Straight Run — Large',
      description: 'Extended single wall with seam.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 3200, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 1200, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Cooktop/Hotplate', quantity: 1 }] },
      ]}],
    },
    // ── KITCHEN: L-Shape ──
    {
      name: 'L-Shape — Small',
      description: 'Corner apartment kitchen.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 2400, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 1800, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [] },
      ]}],
    },
    {
      name: 'L-Shape — Standard',
      description: 'Most common residential configuration.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 3000, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 2400, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Cooktop/Hotplate', quantity: 1 }] },
      ]}],
    },
    {
      name: 'L-Shape — Large',
      description: 'Large family kitchen.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 3600, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 3000, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Cooktop/Hotplate', quantity: 1 }] },
      ]}],
    },
    // ── KITCHEN: U-Shape ──
    {
      name: 'U-Shape — Standard',
      description: 'Three-wall kitchen.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 3000, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 2400, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Cooktop/Hotplate', quantity: 1 }] },
        { name: 'Benchtop C', pieceType: 'BENCHTOP', lengthMm: 3000, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [] },
      ]}],
    },
    // ── KITCHEN: Galley ──
    {
      name: 'Galley — Standard',
      description: 'Parallel run kitchen.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 2700, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 2700, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Cooktop/Hotplate', quantity: 1 }] },
      ]}],
    },
    // ── KITCHEN: Island ──
    {
      name: 'Island — Small',
      description: 'Prep island, no sink.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Island', pieceType: 'ISLAND', lengthMm: 1600, widthMm: 900, thicknessMm: 20, edges: islandEdges, cutouts: [] },
      ]}],
    },
    {
      name: 'Island — Standard',
      description: 'Island with sink + tap hole.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Island', pieceType: 'ISLAND', lengthMm: 2200, widthMm: 1000, thicknessMm: 20, edges: islandEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }, { type: 'Tap Hole', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Island — Large',
      description: 'Full-feature island.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Island', pieceType: 'ISLAND', lengthMm: 2800, widthMm: 1100, thicknessMm: 20, edges: islandEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }, { type: 'Tap Hole', quantity: 1 }] },
      ]}],
    },
    // ── KITCHEN: Peninsula ──
    {
      name: 'Peninsula — Standard',
      description: 'L-shape + peninsula.',
      category: 'kitchen',
      rooms: [{ name: 'Kitchen', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 3000, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 2400, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Cooktop/Hotplate', quantity: 1 }] },
        { name: 'Peninsula', pieceType: 'BENCHTOP', lengthMm: 1500, widthMm: 900, thicknessMm: 20, edges: { top: null, bottom: EDGE.PENCIL_ROUND, left: EDGE.PENCIL_ROUND, right: null }, cutouts: [] },
      ]}],
    },
    // ── BATHROOM ──
    {
      name: 'Single Vanity — Compact',
      description: 'Small bathroom, 1 basin.',
      category: 'bathroom',
      rooms: [{ name: 'Bathroom', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 700, widthMm: 500, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Single Vanity — Standard',
      description: 'Family bathroom, 1 basin.',
      category: 'bathroom',
      rooms: [{ name: 'Bathroom', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 1050, widthMm: 500, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 1 }, { type: 'Tap Hole', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Single Vanity — Extended',
      description: 'Large bathroom, extra bench space.',
      category: 'bathroom',
      rooms: [{ name: 'Bathroom', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 1350, widthMm: 550, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 1 }, { type: 'Tap Hole', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Double Vanity — Standard',
      description: 'Shared bathroom, 2 basins.',
      category: 'bathroom',
      rooms: [{ name: 'Bathroom', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 1650, widthMm: 550, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 2 }, { type: 'Tap Hole', quantity: 2 }] },
      ]}],
    },
    {
      name: 'Double Vanity — Large',
      description: 'Master bathroom, 2 basins.',
      category: 'bathroom',
      rooms: [{ name: 'Bathroom', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 1950, widthMm: 550, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 2 }, { type: 'Tap Hole', quantity: 2 }] },
      ]}],
    },
    {
      name: 'Floating Shelf Vanity',
      description: 'Vessel basin, no cutout.',
      category: 'bathroom',
      rooms: [{ name: 'Bathroom', pieces: [
        { name: 'Vanity Shelf', pieceType: 'VANITY', lengthMm: 1200, widthMm: 450, thicknessMm: 20, edges: floatingEdges, cutouts: [] },
      ]}],
    },
    // ── ENSUITE ──
    {
      name: 'Ensuite Single — Compact',
      description: 'Builder-grade ensuite.',
      category: 'bathroom',
      rooms: [{ name: 'Ensuite', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 700, widthMm: 450, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Ensuite Single — Standard',
      description: 'Standard ensuite.',
      category: 'bathroom',
      rooms: [{ name: 'Ensuite', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 1050, widthMm: 475, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 1 }, { type: 'Tap Hole', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Ensuite Double — Standard',
      description: 'His & hers master ensuite.',
      category: 'bathroom',
      rooms: [{ name: 'Ensuite', pieces: [
        { name: 'Vanity Top', pieceType: 'VANITY', lengthMm: 1650, widthMm: 525, thicknessMm: 20, edges: vanityEdges, cutouts: [{ type: 'Basin', quantity: 2 }, { type: 'Tap Hole', quantity: 2 }] },
      ]}],
    },
    // ── LAUNDRY ──
    {
      name: 'Laundry — Compact',
      description: 'Over washer/dryer.',
      category: 'laundry',
      rooms: [{ name: 'Laundry', pieces: [
        { name: 'Benchtop', pieceType: 'BENCHTOP', lengthMm: 1500, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [] },
      ]}],
    },
    {
      name: 'Laundry — Standard',
      description: 'Full laundry with trough.',
      category: 'laundry',
      rooms: [{ name: 'Laundry', pieces: [
        { name: 'Benchtop', pieceType: 'BENCHTOP', lengthMm: 2100, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
      ]}],
    },
    {
      name: 'Laundry — Extended',
      description: 'Trough + folding bench.',
      category: 'laundry',
      rooms: [{ name: 'Laundry', pieces: [
        { name: 'Benchtop A', pieceType: 'BENCHTOP', lengthMm: 2400, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [{ type: 'Undermount Sink', quantity: 1 }] },
        { name: 'Benchtop B', pieceType: 'BENCHTOP', lengthMm: 1200, widthMm: 600, thicknessMm: 20, edges: benchEdges, cutouts: [] },
      ]}],
    },
  ];

  let count = 0;
  for (const tpl of templates) {
    const templateData = {
      name: tpl.name,
      description: tpl.description,
      category: tpl.category,
      isBuiltIn: true,
      rooms: tpl.rooms,
    };

    await prisma.starter_templates.upsert({
      where: {
        companyId_name: { companyId: 1, name: tpl.name },
      },
      update: {
        description: tpl.description,
        category: tpl.category,
        isBuiltIn: true,
        isShared: true,
        templateData,
        updatedAt: new Date(),
      },
      create: {
        companyId: 1,
        name: tpl.name,
        description: tpl.description,
        category: tpl.category,
        isBuiltIn: true,
        isShared: true,
        templateData,
      },
    });
    count++;
  }
  console.log(`  ✅ Starter templates: ${count} rows`);
}

async function seedEdgeProfileTemplates() {
  console.log('🌱 Seeding edge profile templates...');

  const EDGE = {
    PENCIL_ROUND: 'cmlar3etc0000znatkbilb48y',
    BULLNOSE:     'cmlar3eth0001znathwq93rbm',
    ARRIS:        'cmlar3etm0002znat72h7jnx0',
    MITERED:      'cmlar3eu20006znatmv7mbivv',
    SQUARE_EASED: 'cmlar3ety0005znatiz8ez6mu',
  };

  const profiles = [
    {
      id: 'ept-front-pencil-round',
      name: 'Front Only — Pencil Round',
      description: 'Front edge pencil round, all others raw. Standard benchtop default.',
      edgeTop: null,
      edgeBottom: EDGE.PENCIL_ROUND,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      id: 'ept-front-bullnose',
      name: 'Front Only — Bullnose',
      description: 'Front edge bullnose, all others raw.',
      edgeTop: null,
      edgeBottom: EDGE.BULLNOSE,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      id: 'ept-front-return-pencil-round',
      name: 'Front + Left Return — Pencil Round',
      description: 'Front and left return pencil round. For exposed end benchtops.',
      edgeTop: null,
      edgeBottom: EDGE.PENCIL_ROUND,
      edgeLeft: EDGE.PENCIL_ROUND,
      edgeRight: null,
      suggestedPieceType: 'BENCHTOP',
    },
    {
      id: 'ept-front-both-returns-pencil-round',
      name: 'Front + Both Returns — Pencil Round',
      description: 'Front, left, and right pencil round. Standard island configuration.',
      edgeTop: EDGE.PENCIL_ROUND,
      edgeBottom: EDGE.PENCIL_ROUND,
      edgeLeft: null,
      edgeRight: null,
      suggestedPieceType: 'ISLAND',
    },
    {
      id: 'ept-all-edges-pencil-round',
      name: 'All Edges — Pencil Round',
      description: 'All four edges pencil round. Freestanding pieces.',
      edgeTop: EDGE.PENCIL_ROUND,
      edgeBottom: EDGE.PENCIL_ROUND,
      edgeLeft: EDGE.PENCIL_ROUND,
      edgeRight: EDGE.PENCIL_ROUND,
      suggestedPieceType: 'ISLAND',
    },
    {
      id: 'ept-waterfall-mitered',
      name: 'Waterfall Mitered',
      description: 'Front mitered, sides mitered. For waterfall end returns.',
      edgeTop: null,
      edgeBottom: EDGE.MITERED,
      edgeLeft: EDGE.MITERED,
      edgeRight: EDGE.MITERED,
      suggestedPieceType: 'BENCHTOP',
    },
  ];

  let count = 0;
  for (const profile of profiles) {
    await prisma.edge_profile_templates.upsert({
      where: { id: profile.id },
      update: {
        name: profile.name,
        description: profile.description,
        edgeTop: profile.edgeTop,
        edgeBottom: profile.edgeBottom,
        edgeLeft: profile.edgeLeft,
        edgeRight: profile.edgeRight,
        isBuiltIn: true,
        isShared: true,
        suggestedPieceType: profile.suggestedPieceType,
        updatedAt: new Date(),
      },
      create: {
        id: profile.id,
        companyId: 1,
        name: profile.name,
        description: profile.description,
        edgeTop: profile.edgeTop,
        edgeBottom: profile.edgeBottom,
        edgeLeft: profile.edgeLeft,
        edgeRight: profile.edgeRight,
        isBuiltIn: true,
        isShared: true,
        suggestedPieceType: profile.suggestedPieceType,
      },
    });
    count++;
  }
  console.log(`  ✅ Edge profile templates: ${count} rows`);
}

async function main() {
  console.log('🚀 Running template-only seed...');
  await seedStarterTemplates();
  await seedEdgeProfileTemplates();
  console.log('🎉 Template seed complete!');
}

main()
  .catch((e) => {
    console.error('❌ Template seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
