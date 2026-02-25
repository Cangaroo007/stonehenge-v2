/**
 * PDF Data Assembly Service
 *
 * Assembles structured data from a quote for the PDF renderer.
 * Handles all three cutout JSON shapes (wizard, template/cloner, builder)
 * using the resolveCutoutTypeName() pattern from PieceRow.tsx.
 */

import prisma from '@/lib/db';
import { edgeCode, cutoutLabel } from '@/lib/utils/edge-utils';
import type { CalculationResult, PiecePricingBreakdown } from '@/lib/types/pricing';
import { calculateQuotePrice } from '@/lib/services/pricing-calculator-v2';

// ── Types ────────────────────────────────────────────────────────────────────

export interface QuotePdfPiece {
  id: number;
  name: string;
  description: string | null;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  areaSqm: number;
  materialName: string | null;
  /** Edge labels for display (e.g., "Pencil Polish") */
  edges: {
    top: string | null;
    bottom: string | null;
    left: string | null;
    right: string | null;
  };
  /** Edge summary text e.g. "PR on front and back, BN on left" */
  edgeSummary: string;
  /** Resolved cutouts with display names and quantities */
  cutouts: Array<{ name: string; label: string; quantity: number }>;
  /** Cutout summary text e.g. "1× U/M Sink, 1× HP" */
  cutoutSummary: string;
  /** Per-piece pricing breakdown */
  pricing: {
    material: number;
    cutting: number;
    polishing: number;
    edges: number;
    cutouts: number;
    installation: number;
    lamination: number;
    oversize: number;
    pieceTotal: number;
  };
  sortOrder: number;
}

export interface QuotePdfRoom {
  id: number;
  name: string;
  pieces: QuotePdfPiece[];
  roomTotal: number;
  sortOrder: number;
}

export interface QuotePdfData {
  quoteId: number;
  quoteNumber: string;
  revision: number;
  status: string;
  /** Formatted Australian date "18 February 2026" */
  quoteDate: string;
  /** Formatted valid-until date */
  validUntil: string | null;

  customer: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;

  contact: {
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    mobile: string | null;
  } | null;

  projectName: string | null;
  projectAddress: string | null;
  notes: string | null;

  /** Primary material name (from first piece or majority) */
  materialName: string | null;

  rooms: QuotePdfRoom[];

  /** Quote-level charges */
  charges: {
    delivery: number;
    templating: number;
    installation: number;
  };

  /** Custom charges (from QA1) */
  customCharges: { description: string; amount: number }[];
  customChargesTotal: number;

  /** Quote-level discount (from QA1) */
  discountType: string | null;   // 'PERCENTAGE' | 'ABSOLUTE' | null
  discountValue: number | null;
  discountAmount: number;

  /** Totals */
  subtotalExGst: number;
  /** GST amount — hardcoded at 10% for now. TODO: read from pricing_settings after MT2 */
  gstAmount: number;
  totalIncGst: number;
  gstRate: number;

  /** Calculation breakdown (if available) */
  calculationBreakdown: CalculationResult | null;
}

// ── Cutout Resolution ────────────────────────────────────────────────────────

interface CutoutTypeRef {
  id: string;
  name: string;
}

/**
 * Resolves a cutout type name from any of the three JSON shapes:
 *   Wizard:   { name: "Undermount Sink", quantity: 1 }
 *   Template: { type: "Undermount Sink", quantity: 1 }
 *   Builder:  { id: "uuid", cutoutTypeId: "uuid-ref", quantity: 1 }
 *
 * Pattern from PieceRow.tsx crash fix (UB-AUDIT critical).
 */
function resolveCutoutTypeName(
  cutout: Record<string, unknown>,
  cutoutTypes: CutoutTypeRef[],
): string {
  // Try UUID-based lookup first (builder-created cutouts with cutoutTypeId)
  const typeId = (cutout.cutoutTypeId || cutout.typeId) as string | undefined;
  if (typeId && cutoutTypes.length > 0) {
    const ct = cutoutTypes.find(t => t.id === typeId);
    if (ct) return ct.name;
  }
  // Fallback to string-based name (wizard/template-created cutouts with type or name)
  const typeName = (cutout.type || cutout.name) as string | undefined;
  if (typeName && cutoutTypes.length > 0) {
    const ct = cutoutTypes.find(t => t.name === typeName);
    if (ct) return ct.name;
  }
  // Last resort: use whatever string we have
  return typeName || typeId || 'Unknown';
}

// ── Edge Summary ─────────────────────────────────────────────────────────────

function buildEdgeSummary(edges: {
  top: string | null;
  bottom: string | null;
  left: string | null;
  right: string | null;
}): string {
  const edgeMap: Record<string, string[]> = {};
  const sides: Array<{ side: string; profile: string | null }> = [
    { side: 'front', profile: edges.top },
    { side: 'back', profile: edges.bottom },
    { side: 'left', profile: edges.left },
    { side: 'right', profile: edges.right },
  ];

  for (const { side, profile } of sides) {
    if (profile && profile.toLowerCase() !== 'raw') {
      const code = edgeCode(profile);
      if (code !== 'RAW') {
        if (!edgeMap[code]) edgeMap[code] = [];
        edgeMap[code].push(side);
      }
    }
  }

  return Object.entries(edgeMap)
    .map(([code, edgeSides]) => {
      if (edgeSides.length === 1) return `${code} on ${edgeSides[0]}`;
      if (edgeSides.length === 2) return `${code} on ${edgeSides[0]} and ${edgeSides[1]}`;
      return `${code} on ${edgeSides.join(', ')}`;
    })
    .join(', ');
}

// ── Currency helper ──────────────────────────────────────────────────────────

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  if (typeof val === 'string') return parseFloat(val) || 0;
  return Number(val) || 0;
}

// ── Main Assembly Function ───────────────────────────────────────────────────

export async function assembleQuotePdfData(quoteId: number): Promise<QuotePdfData> {
  // 1. Fetch quote with all relations
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      customers: true,
      contact: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
          email: true,
          phone: true,
          mobile: true,
        },
      },
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
            include: {
              piece_features: true,
              materials: true,
            },
          },
        },
      },
      custom_charges: {
        orderBy: { sort_order: 'asc' },
      },
    },
  });

  if (!quote) {
    throw new Error('QUOTE_NOT_FOUND');
  }

  // 2. Read subtotal (readiness checker validates pricing client-side)
  const subtotal = toNumber(quote.subtotal);

  // 3. Fetch all cutout types for resolution
  const cutoutTypes = await prisma.cutout_types.findMany({
    select: { id: true, name: true },
  });

  // 4. Parse calculation breakdown for per-piece pricing
  let calcBreakdown = quote.calculation_breakdown as unknown as CalculationResult | null;
  // Fallback: if no stored breakdown, run calculate live so PDF always has correct data
  if (!calcBreakdown?.breakdown?.pieces) {
    try {
      calcBreakdown = await calculateQuotePrice(quoteId.toString());
    } catch (e) {
      console.error('[pdf-service] Failed to run fallback calculate:', e);
    }
  }
  const pieceBreakdownMap = new Map<number, PiecePricingBreakdown>();
  if (calcBreakdown?.breakdown?.pieces) {
    for (const pb of calcBreakdown.breakdown.pieces) {
      pieceBreakdownMap.set(pb.pieceId, pb);
    }
  }

  // Build pieceTotal lookup from breakdown for room totals
  const pieceTotalMap = new Map<number, number>();
  if (calcBreakdown?.breakdown?.pieces) {
    for (const p of calcBreakdown.breakdown.pieces) {
      pieceTotalMap.set(p.pieceId, p.pieceTotal ?? 0);
    }
  }

  // 5. Assemble rooms with pieces
  const rooms: QuotePdfRoom[] = [];

  for (const room of quote.quote_rooms) {
    // Skip rooms with no pieces
    if (!room.quote_pieces || room.quote_pieces.length === 0) continue;

    const pdfPieces: QuotePdfPiece[] = [];

    for (const piece of room.quote_pieces) {
      // Parse cutouts JSON (handles all 3 shapes)
      const rawCutouts = (piece.cutouts as unknown as Record<string, unknown>[]) || [];
      const resolvedCutouts = rawCutouts.map(c => {
        const name = resolveCutoutTypeName(c, cutoutTypes);
        return {
          name,
          label: cutoutLabel(name),
          quantity: (c.quantity as number) || 1,
        };
      });

      const cutoutSummaryParts = resolvedCutouts.map(
        c => `${c.quantity}× ${c.label}`
      );

      // Build edge info
      const edges = {
        top: piece.edge_top,
        bottom: piece.edge_bottom,
        left: piece.edge_left,
        right: piece.edge_right,
      };

      // Get per-piece pricing from calculation breakdown
      const pb = pieceBreakdownMap.get(piece.id);
      const pricing = {
        material: pb?.materials?.total ?? 0,
        cutting: pb?.fabrication?.cutting?.total ?? 0,
        polishing: pb?.fabrication?.polishing?.total ?? 0,
        edges: pb?.fabrication?.edges?.reduce((sum, e) => sum + e.total, 0) ?? 0,
        cutouts: pb?.fabrication?.cutouts?.reduce((sum, c) => sum + c.total, 0) ?? 0,
        installation: pb?.fabrication?.installation?.total ?? 0,
        lamination: pb?.fabrication?.lamination?.total ?? 0,
        oversize: pb?.oversize
          ? (pb.oversize.joinCost + pb.oversize.grainMatchingSurcharge)
          : 0,
        pieceTotal: pb?.pieceTotal ?? 0,
      };

      pdfPieces.push({
        id: piece.id,
        name: piece.name,
        description: piece.description,
        lengthMm: piece.length_mm,
        widthMm: piece.width_mm,
        thicknessMm: piece.thickness_mm,
        areaSqm: toNumber(piece.area_sqm),
        materialName: piece.material_name,
        edges,
        edgeSummary: buildEdgeSummary(edges),
        cutouts: resolvedCutouts,
        cutoutSummary: cutoutSummaryParts.join(', '),
        pricing,
        sortOrder: piece.sort_order,
      });
    }

    // Room total from calculation_breakdown only (no stale DB fallback)
    const roomTotal = room.quote_pieces.reduce((sum: number, piece: { id: number }) => {
      return sum + (pieceTotalMap.get(piece.id) ?? 0);
    }, 0);

    // Skip $0.00 rooms from PDF output
    if (roomTotal === 0) continue;

    rooms.push({
      id: room.id,
      name: room.name,
      pieces: pdfPieces,
      roomTotal,
      sortOrder: room.sort_order,
    });
  }

  // 6. Extract delivery/templating charges
  const deliveryCost = toNumber(quote.overrideDeliveryCost) || toNumber(quote.deliveryCost) || 0;
  const templatingCost = toNumber(quote.overrideTemplatingCost) || toNumber(quote.templatingCost) || 0;

  // Installation cost from calculation breakdown
  let installationCost = 0;
  if (calcBreakdown?.breakdown?.services?.items) {
    for (const svc of calcBreakdown.breakdown.services.items) {
      if (svc.serviceType === 'INSTALLATION') {
        installationCost += svc.subtotal;
      }
    }
  }

  // 6b. Custom charges (QA1)
  const customCharges = (quote.custom_charges || []).map(cc => ({
    description: cc.description,
    amount: toNumber(cc.amount),
  }));
  const customChargesTotal = customCharges.reduce((sum, cc) => sum + cc.amount, 0);

  // 6c. Quote-level discount (QA1)
  const discountType = quote.discount_type ?? null;
  const discountValue = quote.discount_value ? toNumber(quote.discount_value) : null;
  // Calculate discount amount from the stored values
  let discountAmount = 0;
  if (discountType && discountValue) {
    if (discountType === 'PERCENTAGE') {
      discountAmount = subtotal * (discountValue / 100);
    } else if (discountType === 'ABSOLUTE') {
      discountAmount = discountValue;
    }
  }

  // 7. Calculate totals
  // GST hardcoded at 10% for now. TODO: read from pricing_settings after MT2
  const GST_RATE = 0.10;
  const subtotalExGst = subtotal;
  const gstAmount = toNumber(quote.tax_amount) || subtotalExGst * GST_RATE;
  const totalIncGst = toNumber(quote.total) || subtotalExGst + gstAmount;

  // 8. Format dates as Australian (en-AU: "18 February 2026")
  const formatAustralianDate = (date: Date | null | undefined): string | null => {
    if (!date) return null;
    return new Date(date).toLocaleDateString('en-AU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  };

  // 9. Determine primary material name
  const allPieces = rooms.flatMap(r => r.pieces);
  const materialCounts = new Map<string, number>();
  for (const p of allPieces) {
    if (p.materialName) {
      materialCounts.set(p.materialName, (materialCounts.get(p.materialName) || 0) + 1);
    }
  }
  let materialName: string | null = null;
  let maxCount = 0;
  materialCounts.forEach((count, name) => {
    if (count > maxCount) {
      materialName = name;
      maxCount = count;
    }
  });

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    revision: quote.revision,
    status: quote.status,
    quoteDate: formatAustralianDate(quote.created_at) || '',
    validUntil: formatAustralianDate(quote.valid_until),

    customer: quote.customers
      ? {
          name: quote.customers.name,
          company: quote.customers.company,
          email: quote.customers.email,
          phone: quote.customers.phone,
          address: quote.customers.address,
        }
      : null,

    contact: quote.contact
      ? {
          firstName: quote.contact.first_name,
          lastName: quote.contact.last_name,
          email: quote.contact.email,
          phone: quote.contact.phone,
          mobile: quote.contact.mobile,
        }
      : null,

    projectName: quote.project_name,
    projectAddress: quote.project_address,
    notes: quote.notes,
    materialName,

    rooms,

    charges: {
      delivery: deliveryCost,
      templating: templatingCost,
      installation: installationCost,
    },

    customCharges,
    customChargesTotal,
    discountType,
    discountValue,
    discountAmount,

    subtotalExGst,
    gstAmount,
    totalIncGst,
    gstRate: GST_RATE,

    calculationBreakdown: calcBreakdown,
  };
}
