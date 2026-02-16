import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'fs';
import { join } from 'path';
import { seedEdgeProfileTemplates } from './seed-edge-templates';

const prisma = new PrismaClient();

interface StarterTemplateJson {
  name: string;
  description: string;
  category: string;
  isBuiltIn: boolean;
  rooms: Array<{
    name: string;
    pieces: Array<{
      name: string;
      pieceType: string;
      lengthMm: number;
      widthMm: number;
      thicknessMm: number;
      edges: { top: string; bottom: string; left: string; right: string };
      cutouts: Array<{ type: string; quantity: number }>;
      relatedTo?: { pieceName: string; relationType: string };
    }>;
  }>;
}

/**
 * Seed piece starter templates from JSON data file.
 *
 * Uses upsert on (companyId, name) to be idempotent — safe to run multiple times.
 */
export async function seedStarterTemplates() {
  // Use first company ID (single-tenant system)
  const company = await prisma.companies.findFirst();
  if (!company) {
    console.warn('No company found — skipping starter template seeding');
    return;
  }

  const jsonPath = join(__dirname, 'data', 'piece-starter-templates.json');
  const raw = readFileSync(jsonPath, 'utf-8');
  const templates = JSON.parse(raw) as StarterTemplateJson[];

  let upsertCount = 0;
  for (const t of templates) {
    await prisma.starter_templates.upsert({
      where: {
        companyId_name: {
          companyId: company.id,
          name: t.name,
        },
      },
      create: {
        companyId: company.id,
        name: t.name,
        description: t.description,
        category: t.category,
        isBuiltIn: true,
        isShared: true,
        templateData: t as unknown as Record<string, unknown>,
      },
      update: {
        description: t.description,
        category: t.category,
        templateData: t as unknown as Record<string, unknown>,
      },
    });
    upsertCount++;
  }

  console.log(`✅ Starter templates: ${upsertCount} rows`);
}

/**
 * Run all template seeds: edge profiles + piece starter templates.
 */
async function main() {
  await seedEdgeProfileTemplates();
  await seedStarterTemplates();
}

// Allow direct execution
if (require.main === module) {
  main()
    .then(() => prisma.$disconnect())
    .catch((e) => {
      console.error(e);
      prisma.$disconnect();
      process.exit(1);
    });
}
