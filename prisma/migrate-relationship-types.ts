import { PrismaClient, RelationshipType } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Maps existing string relation_type values to the new enum.
 * Includes all values from VALID_RELATION_TYPES in the existing API route
 * plus common casing variants.
 */
const TYPE_MAP: Record<string, RelationshipType> = {
  'WATERFALL': RelationshipType.WATERFALL,
  'waterfall': RelationshipType.WATERFALL,
  'SPLASHBACK': RelationshipType.SPLASHBACK,
  'splashback': RelationshipType.SPLASHBACK,
  'RETURN': RelationshipType.RETURN,
  'return': RelationshipType.RETURN,
  'RETURN_END': RelationshipType.RETURN,
  'return_end': RelationshipType.RETURN,
  'WINDOW_SILL': RelationshipType.WINDOW_SILL,
  'window_sill': RelationshipType.WINDOW_SILL,
  'MITRE_JOIN': RelationshipType.MITRE_JOIN,
  'mitre_join': RelationshipType.MITRE_JOIN,
  'mitre': RelationshipType.MITRE_JOIN,
  'BUTT_JOIN': RelationshipType.BUTT_JOIN,
  'butt_join': RelationshipType.BUTT_JOIN,
  'butt': RelationshipType.BUTT_JOIN,
};

async function main() {
  // 1. Check what string values currently exist
  const existing = await prisma.piece_relationships.findMany({
    select: { id: true, relation_type: true },
  });

  console.log(`Found ${existing.length} existing relationships`);

  if (existing.length === 0) {
    console.log('No existing relationships to migrate.');
    return;
  }

  // 2. Log any unmapped values
  const unmapped = existing.filter(r => !TYPE_MAP[r.relation_type]);
  if (unmapped.length > 0) {
    console.warn('Unmapped relation_type values:');
    unmapped.forEach(r => console.warn(`  id=${r.id}: "${r.relation_type}"`));
    console.warn('These will default to BUTT_JOIN as the safest fallback.');
  }

  // 3. Migrate each record
  let migrated = 0;
  for (const record of existing) {
    const mappedType = TYPE_MAP[record.relation_type] ?? RelationshipType.BUTT_JOIN;
    await prisma.piece_relationships.update({
      where: { id: record.id },
      data: { relationship_type: mappedType },
    });
    migrated++;
  }

  console.log(`Migrated ${migrated} relationships to enum type`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
