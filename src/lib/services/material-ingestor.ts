import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import prisma from '@/lib/db';

const anthropic = new Anthropic();
const MODEL = 'claude-sonnet-4-20250514';

// ─── Public types ────────────────────────────────────────────────────────────

export interface ProposedMaterial {
  /** Client-side stable ID used for reconciliation across refinements. */
  _id: string;
  productCode: string | null;
  name: string;
  /** Maps to supplier_range + collection in DB. */
  collection: string | null;
  surfaceFinish: string | null;
  /** Supplier's list price per slab (wholesale_price in DB). */
  wholesalePrice: number | null;
  /** Buyer's actual cost per slab (price_per_slab in DB). */
  costPrice: number | null;
  slabLengthMm: number | null;
  slabWidthMm: number | null;
  thicknessMm: number | null;
  isDiscontinued: boolean;
  notes: string | null;
  confidence: 'high' | 'medium' | 'low';
  /** Intended DB action for this row. */
  action: 'create' | 'update' | 'skip' | 'create_variant';
  existingMaterialId: number | null;
  matchType: 'exact_code' | 'name_match' | null;
  priceChange: {
    oldCostPrice: number | null;
    newCostPrice: number | null;
    percentChange: number | null;
  } | null;
}

export interface Uncertainty {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  question: string;
  context: string;
  relatedMaterialIds: string[];
  type: 'column_mapping' | 'range_filter' | 'price_interpretation' | 'dimension_ambiguity' | 'collision' | 'general';
  resolved: boolean;
}

export interface Proposal {
  sessionId: string;
  supplierName: string | null;
  effectiveDate: string | null;
  currency: string;
  pricesExGst: boolean;
  extractedData: ProposedMaterial[];
  uncertainties: Uncertainty[];
  commandHistory: string[];
}

// ─── Prompts ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are an expert data extraction AI for the Australian stone benchtop industry. You read supplier price lists in various formats and extract structured material/product data with high accuracy.

Domain knowledge:
- Prices are ex-GST unless stated otherwise (Australian industry standard)
- Slab dimensions expressed as length × width in mm; longer dimension is always the length
- Common thicknesses: 12mm, 20mm, 30mm
- Wholesale price = supplier's list price; cost price = buyer's actual price after any discount
- If only one price shown, use it for both wholesale and cost
- Common surface finishes: Polished, Matte, Honed, Textured, Silk
- Product codes uniquely identify a material; missing codes make future re-matching unreliable`;

function buildExtractionPrompt(existingCount: number): string {
  return `Extract EVERY material from this price list document.

Return ONLY a valid JSON object (no markdown, no commentary):
{
  "supplierName": string | null,
  "effectiveDate": "YYYY-MM-DD" | null,
  "currency": "AUD",
  "pricesExGst": true,
  "materials": [
    {
      "productCode": string | null,
      "name": string,
      "collection": string | null,
      "surfaceFinish": string | null,
      "wholesalePrice": number | null,
      "costPrice": number | null,
      "slabLengthMm": number | null,
      "slabWidthMm": number | null,
      "thicknessMm": number | null,
      "isDiscontinued": boolean,
      "notes": string | null,
      "confidence": "high" | "medium" | "low"
    }
  ],
  "uncertainties": [
    {
      "severity": "critical" | "warning" | "info",
      "question": string,
      "context": string,
      "relatedMaterialNames": string[],
      "type": "column_mapping" | "range_filter" | "price_interpretation" | "dimension_ambiguity" | "general"
    }
  ]
}

CONFIDENCE LEVELS:
- high: All fields clearly present and unambiguous
- medium: Some inference required (e.g., price derived from a discount %)
- low: Significant uncertainty (missing critical fields, ambiguous data)

RAISE AN UNCERTAINTY (and set appropriate severity) for:
- Two price columns where wholesale vs cost is unclear → critical
- Ranges that appear to be different product tiers (may need filtering) → warning
- Dimensions that appear reversed (width listed before length) → warning
- Products with no product code (makes re-matching harder) → info
- Currency other than AUD → critical
- Discontinued products mixed with active ones without clear marking → warning

${existingCount > 0 ? `The company already has ${existingCount} materials in their library.` : ''}`;
}

function buildRefinementPrompt(command: string, proposal: Proposal): string {
  // Send a compact representation to keep token usage reasonable
  const compact = proposal.extractedData.map((m) => ({
    _id: m._id,
    name: m.name,
    collection: m.collection,
    productCode: m.productCode,
    wholesalePrice: m.wholesalePrice,
    costPrice: m.costPrice,
    slabLengthMm: m.slabLengthMm,
    slabWidthMm: m.slabWidthMm,
    thicknessMm: m.thicknessMm,
    isDiscontinued: m.isDiscontinued,
    action: m.action,
    confidence: m.confidence,
  }));

  const openUncertainties = proposal.uncertainties
    .filter((u) => !u.resolved)
    .map((u) => ({ id: u.id, question: u.question, severity: u.severity }));

  return `You are managing a price list import staging session.

CURRENT SESSION:
- Supplier: ${proposal.supplierName ?? 'Unknown'}
- Total materials: ${proposal.extractedData.length}
- Open uncertainties: ${openUncertainties.length}
${openUncertainties.length > 0 ? `\nOpen uncertainties:\n${JSON.stringify(openUncertainties, null, 2)}` : ''}

CURRENT MATERIALS:
${JSON.stringify(compact, null, 2)}

USER COMMAND: "${command}"

Apply the command and return ONLY a valid JSON object (no markdown):
{
  "updatedMaterials": [
    { "_id": "...", ...only the fields that changed... }
  ],
  "resolvedUncertaintyIds": ["..."],
  "newUncertainties": [
    {
      "severity": "critical" | "warning" | "info",
      "question": string,
      "context": string,
      "relatedMaterialIds": string[],
      "type": string
    }
  ],
  "commandSummary": "Brief plain-English summary of what changed"
}

COMMAND INTERPRETATION RULES:
- "Ignore/exclude/filter out [range/collection]" → set action:"skip" for matching materials
- "Factor in X% waste / add X% to prices" → multiply wholesalePrice and costPrice by (1 + X/100)
- "[Column/field] is actually [other field]" → swap/remap field values accordingly
- "Override existing" → set action:"update" for collision items
- "Create variant" → set action:"create_variant" for collision items
- "Skip all discontinued" → set action:"skip" for isDiscontinued materials
- "Set dimensions to X×Y" → update slabLengthMm/slabWidthMm for items with missing dimensions
- If the command answers an open uncertainty, include its id in resolvedUncertaintyIds

Return ONLY changed materials in updatedMaterials (omit unchanged rows).`;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseDimensions(
  lengthMm: number | null,
  widthMm: number | null,
): [number | null, number | null] {
  if (lengthMm !== null && widthMm !== null && lengthMm < widthMm) {
    return [widthMm, lengthMm];
  }
  return [lengthMm, widthMm];
}

function parseClaudeJson(text: string): unknown {
  const clean = text.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
  return JSON.parse(clean);
}

// ─── Core service functions ───────────────────────────────────────────────────

/**
 * Parse a PDF price list with Claude and return a Proposal ready for the
 * staging area. Existing materials for the given supplier are fetched so
 * collision detection can happen immediately.
 */
export async function ingestPriceList(
  pdfBase64: string,
  companyId: number,
  supplierId?: string,
  mediaType: 'application/pdf' = 'application/pdf',
): Promise<Proposal> {
  const sessionId = uuidv4();

  // Load existing materials for collision detection
  const existingMaterials = supplierId
    ? await prisma.materials.findMany({
        where: { supplier_id: supplierId, company_id: companyId },
        select: {
          id: true,
          name: true,
          product_code: true,
          price_per_slab: true,
          wholesale_price: true,
        },
      })
    : [];

  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: buildExtractionPrompt(existingMaterials.length),
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = parseClaudeJson(textBlock.text) as any;

  // Assign stable IDs and resolve collisions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const extractedData: ProposedMaterial[] = (parsed.materials ?? []).map((m: any) => {
    const _id = uuidv4();
    const [slabLengthMm, slabWidthMm] = normaliseDimensions(
      m.slabLengthMm ?? null,
      m.slabWidthMm ?? null,
    );

    const byCode = m.productCode
      ? existingMaterials.find((e) => e.product_code === m.productCode)
      : null;
    const byName = !byCode
      ? existingMaterials.find(
          (e) => e.name.toLowerCase().trim() === m.name.toLowerCase().trim(),
        )
      : null;
    const existing = byCode ?? byName;
    const matchType: ProposedMaterial['matchType'] = byCode
      ? 'exact_code'
      : byName
        ? 'name_match'
        : null;

    const oldCost = existing?.price_per_slab ? Number(existing.price_per_slab) : null;

    return {
      _id,
      productCode: m.productCode ?? null,
      name: m.name,
      collection: m.collection ?? null,
      surfaceFinish: m.surfaceFinish ?? null,
      wholesalePrice: m.wholesalePrice ?? null,
      costPrice: m.costPrice ?? null,
      slabLengthMm,
      slabWidthMm,
      thicknessMm: m.thicknessMm ?? null,
      isDiscontinued: m.isDiscontinued ?? false,
      notes: m.notes ?? null,
      confidence: m.confidence ?? 'medium',
      action: existing ? 'update' : 'create',
      existingMaterialId: existing?.id ?? null,
      matchType,
      priceChange: existing
        ? {
            oldCostPrice: oldCost,
            newCostPrice: m.costPrice ?? null,
            percentChange:
              oldCost && oldCost > 0 && m.costPrice != null
                ? ((m.costPrice - oldCost) / oldCost) * 100
                : null,
          }
        : null,
    } satisfies ProposedMaterial;
  });

  // Build uncertainties with stable IDs
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const uncertainties: Uncertainty[] = (parsed.uncertainties ?? []).map((u: any) => {
    const relatedMaterialIds = extractedData
      .filter((m) =>
        (u.relatedMaterialNames ?? []).some((n: string) =>
          m.name.toLowerCase().includes(n.toLowerCase()),
        ),
      )
      .map((m) => m._id);

    return {
      id: uuidv4(),
      severity: u.severity,
      question: u.question,
      context: u.context,
      relatedMaterialIds,
      type: u.type ?? 'general',
      resolved: false,
    } satisfies Uncertainty;
  });

  return {
    sessionId,
    supplierName: parsed.supplierName ?? null,
    effectiveDate: parsed.effectiveDate ?? null,
    currency: parsed.currency ?? 'AUD',
    pricesExGst: parsed.pricesExGst ?? true,
    extractedData,
    uncertainties,
    commandHistory: [],
  };
}

/**
 * Apply a natural-language command to an existing Proposal and return the
 * updated version. The LLM re-evaluates extractedData without re-reading
 * the original document.
 */
export async function refineProposal(
  proposal: Proposal,
  command: string,
): Promise<Proposal> {
  const response = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 8000,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: buildRefinementPrompt(command, proposal),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('No text response from Claude');
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const parsed = parseClaudeJson(textBlock.text) as any;

  // Merge only changed materials by _id
  const updatedById = new Map<string, Partial<ProposedMaterial>>(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (parsed.updatedMaterials ?? []).map((m: any) => [m._id as string, m]),
  );

  const updatedExtractedData = proposal.extractedData.map((m) => {
    const patch = updatedById.get(m._id);
    return patch ? ({ ...m, ...patch, _id: m._id } as ProposedMaterial) : m;
  });

  // Mark resolved uncertainties
  const resolvedIds = new Set<string>(parsed.resolvedUncertaintyIds ?? []);
  const updatedUncertainties = proposal.uncertainties.map((u) => ({
    ...u,
    resolved: u.resolved || resolvedIds.has(u.id),
  }));

  // Append new uncertainties surfaced by the command
  const newUncertainties: Uncertainty[] = (parsed.newUncertainties ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (u: any) => ({
      id: uuidv4(),
      severity: u.severity,
      question: u.question,
      context: u.context,
      relatedMaterialIds: u.relatedMaterialIds ?? [],
      type: u.type ?? 'general',
      resolved: false,
    }),
  );

  return {
    ...proposal,
    extractedData: updatedExtractedData,
    uncertainties: [...updatedUncertainties, ...newUncertainties],
    commandHistory: [...proposal.commandHistory, command],
  };
}
