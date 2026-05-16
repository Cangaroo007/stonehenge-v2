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
import type { ShapeConfig, LShapeConfig, UShapeConfig } from '@/lib/types/shapes';

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
    edges: number;
    cutouts: number;
    installation: number;
    oversize: number;
    cornerJoin: number;
    pieceTotal: number;
    cuttingItems?: Array<{
      kind: 'NORMAL' | 'BUILD_UP';
      side?: string;
      quantity: number;
      unit: string;
      rate: number;
      total: number;
      effectiveThicknessMm: number;
    }>;
  };
  /**
   * For L/U-shaped pieces: individual part dimensions (back, legs).
   * Undefined for rectangles and other single-shape pieces — those keep the
   * existing `lengthMm × widthMm` bounding-box display.
   */
  parts?: Array<{
    name: string;
    lengthMm: number;
    widthMm: number;
  }>;
  /**
   * Piece role: BENCHTOP / ISLAND / VANITY / SHELF / PANEL / OTHER (main
   * pieces) or WATERFALL / SPLASHBACK (attachments). Drives the NCS-style
   * additionals bullets in the room breakdown ("- 1 x Waterfall End").
   */
  pieceType: string | null;
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
  quoteNumber: string | null;
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

/**
 * For L/U-shaped pieces, extract individual part dimensions from `shape_config`
 * so the PDF renderer can list each part instead of the bounding box.
 *
 *   L_SHAPE  → 2 parts: Leg 1, Leg 2
 *   U_SHAPE  → 3 parts: Back, Left Leg, Right Leg
 *
 * Returns `undefined` for rectangles and other single-shape pieces — those
 * keep the existing `lengthMm × widthMm` bounding-box display.
 */
function buildPartsFromShapeConfig(
  shapeType: string | null | undefined,
  shapeConfig: unknown,
): QuotePdfPiece['parts'] {
  if (!shapeConfig) return undefined;
  // Prisma JSONB columns come through as plain JsonValue; double-cast to the
  // typed union (Rule 9 — Prisma JSON double cast).
  const cfg = shapeConfig as unknown as ShapeConfig;
  if (!cfg) return undefined;

  if (shapeType === 'L_SHAPE' && (cfg as LShapeConfig).shape === 'L_SHAPE') {
    const c = cfg as LShapeConfig;
    if (!c.leg1 || !c.leg2) return undefined;
    return [
      { name: 'Leg 1', lengthMm: c.leg1.length_mm, widthMm: c.leg1.width_mm },
      { name: 'Leg 2', lengthMm: c.leg2.length_mm, widthMm: c.leg2.width_mm },
    ];
  }

  if (shapeType === 'U_SHAPE' && (cfg as UShapeConfig).shape === 'U_SHAPE') {
    const c = cfg as UShapeConfig;
    if (!c.back || !c.leftLeg || !c.rightLeg) return undefined;
    return [
      { name: 'Back',      lengthMm: c.back.length_mm,     widthMm: c.back.width_mm },
      { name: 'Left Leg',  lengthMm: c.leftLeg.length_mm,  widthMm: c.leftLeg.width_mm },
      { name: 'Right Leg', lengthMm: c.rightLeg.length_mm, widthMm: c.rightLeg.width_mm },
    ];
  }

  return undefined;
}

function buildEdgeSummary(
  edges: {
    top: string | null;
    bottom: string | null;
    left: string | null;
    right: string | null;
  },
  edgeNameMap: Map<string, string>,
): string {
  const edgeMap: Record<string, string[]> = {};
  const sides: Array<{ side: string; profile: string | null }> = [
    { side: 'front', profile: edges.bottom },
    { side: 'back', profile: edges.top },
    { side: 'left', profile: edges.left },
    { side: 'right', profile: edges.right },
  ];

  for (const { side, profile } of sides) {
    if (!profile) continue;
    // piece.edge_* columns store edge_type IDs (CUIDs). Resolve to the human
    // name so edgeCode() can keyword-match correctly. Unknown IDs fall through
    // as "Unknown" rather than producing a garbage 3-letter substring.
    const name = edgeNameMap.get(profile) ?? 'Unknown';
    if (name.toLowerCase() === 'raw') continue;
    const code = edgeCode(name);
    if (code === 'RAW') continue;
    if (!edgeMap[code]) edgeMap[code] = [];
    edgeMap[code].push(side);
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

  // 2. Fetch all cutout types for resolution
  const cutoutTypes = await prisma.cutout_types.findMany({
    select: { id: true, name: true },
  });

  // 3. Fetch all edge types so piece.edge_top etc. (edge_type IDs) can be
  //    resolved to human-readable names ("Arris", "Pencil Round", "Mitered",
  //    "Beveled", "Raw") before the PDF edge summary is built. Without this
  //    lookup, the raw CUID gets passed to edgeCode() and the keyword fallback
  //    returns the first three letters — every edge displays as "CML".
  const edgeTypes = await prisma.edge_types.findMany({
    select: { id: true, name: true },
  });
  const edgeNameMap = new Map<string, string>();
  for (const et of edgeTypes) {
    edgeNameMap.set(et.id, et.name);
  }

  // 4. Always recalculate for PDF — ensures accurate client-facing document.
  //    The UI calculate route is the single canonical writer; the PDF service
  //    is read-only against the quotes table to avoid last-writer-wins drift
  //    between PDF generation and UI render.
  const calcBreakdown = await calculateQuotePrice(quoteId.toString());

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
        edges: pb?.fabrication?.edges?.reduce((sum, e) => sum + e.total, 0) ?? 0,
        cutouts: pb?.fabrication?.cutouts?.reduce((sum, c) => sum + c.total, 0) ?? 0,
        installation: pb?.fabrication?.installation?.total ?? 0,
        oversize: pb?.oversize
          ? (pb.oversize.joinCost + pb.oversize.grainMatchingSurcharge)
          : 0,
        cornerJoin: pb?.cornerJoin
          ? (pb.cornerJoin.joinCost + pb.cornerJoin.grainMatchingSurcharge)
          : 0,
        pieceTotal: pb?.pieceTotal ?? 0,
        cuttingItems: pb?.fabrication?.cutting?.items ?? [],
      };

      const parts = buildPartsFromShapeConfig(piece.shape_type, piece.shape_config);

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
        edgeSummary: buildEdgeSummary(edges, edgeNameMap),
        cutouts: resolvedCutouts,
        cutoutSummary: cutoutSummaryParts.join(', '),
        pricing,
        parts,
        pieceType: piece.piece_type ?? null,
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
      discountAmount = calcBreakdown.subtotal * (discountValue / 100);
    } else if (discountType === 'ABSOLUTE') {
      discountAmount = discountValue;
    }
  }

  // 7. Calculate totals — use fresh calculator values, not stale DB snapshot
  const subtotalExGst = calcBreakdown.subtotal;
  const gstAmount = calcBreakdown.gstAmount;
  const totalIncGst = calcBreakdown.totalIncGst;

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
    gstRate: calcBreakdown.gstRate,

    calculationBreakdown: calcBreakdown,
  };
}
