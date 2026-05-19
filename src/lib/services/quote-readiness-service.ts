/**
 * Quote Readiness Service
 *
 * Runs pre-flight checks against a quote before allowing PDF generation.
 * Returns a list of check results (pass/fail/warn) that the UI can display
 * in a readiness checker dialog.
 */

import prisma from '@/lib/db';

/* ─── Types ─── */

export type ReadinessStatus = 'pass' | 'fail' | 'warn';

export interface ReadinessCheck {
  id: string;
  label: string;
  status: ReadinessStatus;
  detail: string;
  /** Suggested fix text (only for fail/warn) */
  fix?: string;
  /** Button label for the fix action (only for fail/warn) */
  fixAction?: string;
}

export interface ReadinessResult {
  quoteId: number;
  quoteNumber: string | null;
  checks: ReadinessCheck[];
  canGenerate: boolean;
  failCount: number;
  warnCount: number;
  passCount: number;
}

/* ─── Helpers ─── */

function toNumber(val: unknown): number {
  if (typeof val === 'number') return val;
  if (val && typeof val === 'object' && 'toNumber' in val) {
    return (val as { toNumber: () => number }).toNumber();
  }
  if (typeof val === 'string') return parseFloat(val) || 0;
  return Number(val) || 0;
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 2,
  }).format(amount);
}

/* ─── Main Check Function ─── */

export async function checkQuoteReadiness(
  quoteId: number,
  companyId: number,
): Promise<ReadinessResult> {
  const checks: ReadinessCheck[] = [];

  // Fetch quote with all relations needed for checks
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      customers: true,
      contact: {
        select: {
          id: true,
          first_name: true,
          last_name: true,
        },
      },
      quote_rooms: {
        orderBy: { sort_order: 'asc' },
        include: {
          quote_pieces: {
            orderBy: { sort_order: 'asc' },
          },
        },
      },
      custom_charges: {
        orderBy: { sort_order: 'asc' },
        select: {
          description: true,
          amount: true,
        },
      },
    },
  });

  if (!quote) {
    return {
      quoteId,
      quoteNumber: '',
      checks: [{ id: 'exists', label: 'Quote exists', status: 'fail', detail: 'Quote not found' }],
      canGenerate: false,
      failCount: 1,
      warnCount: 0,
      passCount: 0,
    };
  }

  const allPieces = quote.quote_rooms.flatMap((r) => r.quote_pieces);
  const totalPieces = allPieces.length;
  const totalRooms = quote.quote_rooms.length;
  const subtotal = toNumber(quote.subtotal);
  const customCharges = quote.custom_charges || [];
  const customChargeTotal = customCharges.reduce((sum, charge) => sum + toNumber(charge.amount), 0);
  const edgeIds = Array.from(new Set(
    allPieces
      .flatMap((p) => [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right])
      .filter((edgeId): edgeId is string => Boolean(edgeId))
  ));
  const edgeTypeMap = new Map<string, { name: string; category: string | null }>();
  if (edgeIds.length > 0) {
    const edgeTypes = await prisma.edge_types.findMany({
      where: { id: { in: edgeIds } },
      select: { id: true, name: true, category: true },
    });
    for (const edgeType of edgeTypes) {
      edgeTypeMap.set(edgeType.id, {
        name: edgeType.name,
        category: edgeType.category,
      });
    }
  }

  // ── Check 1: Quote pricing calculated ──
  if (subtotal <= 0) {
    checks.push({
      id: 'pricing',
      label: 'Quote pricing calculated',
      status: 'fail',
      detail: `Quote total is ${formatCurrency(0)} — no pricing has been calculated yet`,
      fix: 'Open the quote builder and ensure materials, edges, and cutouts are configured',
      fixAction: 'Open Builder',
    });
  } else {
    checks.push({
      id: 'pricing',
      label: 'Quote pricing calculated',
      status: 'pass',
      detail: `Total: ${formatCurrency(subtotal)} ex GST`,
    });
  }

  // ── Check 2: Material assigned to all pieces ──
  const piecesWithoutMaterial = allPieces.filter(
    (p) => !p.material_id && !p.material_name,
  );
  if (piecesWithoutMaterial.length > 0) {
    checks.push({
      id: 'material',
      label: 'Material assigned to all pieces',
      status: 'fail',
      detail: `${piecesWithoutMaterial.length} of ${totalPieces} piece${totalPieces !== 1 ? 's' : ''} ha${piecesWithoutMaterial.length !== 1 ? 've' : 's'} no material assigned`,
      fix: 'Assign a material to each piece in the quote builder',
      fixAction: 'Assign Materials',
    });
  } else if (totalPieces > 0) {
    // Summarise materials used
    const materialNames = new Set(
      allPieces.map((p) => p.material_name).filter(Boolean),
    );
    const summary =
      materialNames.size === 1
        ? Array.from(materialNames)[0]!
        : `${materialNames.size} materials across ${totalPieces} pieces`;
    checks.push({
      id: 'material',
      label: 'Material assigned to all pieces',
      status: 'pass',
      detail: summary,
    });
  }

  // ── Check 3: Catalogue material selected for slab logic ──
  const piecesWithoutCatalogueMaterial = allPieces.filter((p) => !p.material_id);
  if (piecesWithoutCatalogueMaterial.length > 0) {
    checks.push({
      id: 'material-catalogue',
      label: 'Catalogue material selected for slab logic',
      status: 'warn',
      detail: `${piecesWithoutCatalogueMaterial.length} of ${totalPieces} piece${piecesWithoutCatalogueMaterial.length !== 1 ? 's are' : ' is'} using a typed/override material instead of a selected catalogue material`,
      fix: 'Select the final material colour before relying on slab optimisation, or leave this as an intentional allowance/override',
      fixAction: 'Review Materials',
    });
  } else if (totalPieces > 0) {
    checks.push({
      id: 'material-catalogue',
      label: 'Catalogue material selected for slab logic',
      status: 'pass',
      detail: 'All pieces have selected catalogue materials for pricing and optimisation',
    });
  }

  // ── Check 4: Specific material colours confirmed ──
  const collectionOnlyPieces = allPieces.filter((p) => p.material_collection_only);
  if (collectionOnlyPieces.length > 0) {
    const collections = new Set(collectionOnlyPieces.map((p) => p.material_collection_name || p.material_name).filter(Boolean));
    checks.push({
      id: 'material-colour',
      label: 'Specific material colours confirmed',
      status: 'warn',
      detail: `${collectionOnlyPieces.length} piece${collectionOnlyPieces.length !== 1 ? 's are' : ' is'} priced from a supplier/collection instead of a final colour${collections.size ? ` (${Array.from(collections).join(', ')})` : ''}`,
      fix: 'Select final colours before issuing a firm customer quote, or leave this as an intentional generic allowance',
      fixAction: 'Review Materials',
    });
  } else if (totalPieces > 0) {
    checks.push({
      id: 'material-colour',
      label: 'Specific material colours confirmed',
      status: 'pass',
      detail: 'No pieces are using generic collection-only pricing',
    });
  }

  // ── Check 5: Customer selected ──
  if (!quote.customer_id || !quote.customers) {
    checks.push({
      id: 'customer',
      label: 'Customer selected',
      status: 'fail',
      detail: 'No customer assigned to this quote',
      fix: 'Select a customer before generating the PDF',
      fixAction: 'Select Customer',
    });
  } else {
    checks.push({
      id: 'customer',
      label: 'Customer selected',
      status: 'pass',
      detail: quote.customers.company || quote.customers.name,
    });
  }

  // ── Check 6: Quote contact assigned ──
  if (!quote.contact_id || !quote.contact) {
    checks.push({
      id: 'contact',
      label: 'Quote contact assigned',
      status: 'warn',
      detail: 'No contact selected — PDF will be addressed to the company only',
      fix: 'Optionally select a specific contact person',
      fixAction: 'Select Contact',
    });
  } else {
    checks.push({
      id: 'contact',
      label: 'Quote contact assigned',
      status: 'pass',
      detail: `${quote.contact.first_name} ${quote.contact.last_name}`,
    });
  }

  // ── Check 7: At least one piece exists ──
  if (totalPieces === 0) {
    checks.push({
      id: 'pieces',
      label: 'At least one piece exists',
      status: 'fail',
      detail: 'No pieces in this quote — nothing to include in the PDF',
      fix: 'Add pieces to the quote in the builder',
      fixAction: 'Open Builder',
    });
  } else {
    checks.push({
      id: 'pieces',
      label: 'At least one piece exists',
      status: 'pass',
      detail: `${totalPieces} piece${totalPieces !== 1 ? 's' : ''} across ${totalRooms} room${totalRooms !== 1 ? 's' : ''}`,
    });
  }

  // ── Check 8: All pieces have dimensions ──
  const piecesWithoutDimensions = allPieces.filter(
    (p) => !p.length_mm || p.length_mm <= 0 || !p.width_mm || p.width_mm <= 0,
  );
  if (piecesWithoutDimensions.length > 0) {
    checks.push({
      id: 'dimensions',
      label: 'All pieces have dimensions',
      status: 'fail',
      detail: `${piecesWithoutDimensions.length} piece${piecesWithoutDimensions.length !== 1 ? 's' : ''} missing valid length or width`,
      fix: 'Set dimensions for all pieces in the quote builder',
      fixAction: 'Fix Dimensions',
    });
  } else if (totalPieces > 0) {
    checks.push({
      id: 'dimensions',
      label: 'All pieces have dimensions',
      status: 'pass',
      detail: `All ${totalPieces} piece${totalPieces !== 1 ? 's' : ''} have valid length × width`,
    });
  }

  // ── Check 9: Edge profiles configured ──
  const isRawEdge = (edgeId: string | null) => {
    if (!edgeId) return true;
    const edgeType = edgeTypeMap.get(edgeId);
    if (!edgeType) return false;
    return edgeType.name.toLowerCase() === 'raw' || edgeType.category === 'raw';
  };
  const piecesAllRaw = allPieces.filter((p) => {
    const edges = [p.edge_top, p.edge_bottom, p.edge_left, p.edge_right];
    return edges.every(isRawEdge);
  });
  if (totalPieces > 0 && piecesAllRaw.length === totalPieces) {
    checks.push({
      id: 'edges',
      label: 'Edge profiles configured',
      status: 'warn',
      detail: 'All pieces have edges set to RAW — is this intentional?',
      fix: 'Review edge profiles if finished edges are needed',
    });
  } else if (totalPieces > 0 && piecesAllRaw.length > 0) {
    checks.push({
      id: 'edges',
      label: 'Edge profiles configured',
      status: 'warn',
      detail: `${piecesAllRaw.length} piece${piecesAllRaw.length !== 1 ? 's' : ''} ha${piecesAllRaw.length !== 1 ? 've' : 's'} all edges set to RAW — is this intentional?`,
      fix: 'Review edge profiles if finished edges are needed',
    });
  } else if (totalPieces > 0) {
    checks.push({
      id: 'edges',
      label: 'Edge profiles configured',
      status: 'pass',
      detail: 'All pieces have at least one finished edge',
    });
  }

  // ── Check 10: Installation mode confirmed ──
  if (quote.installationIncluded === false) {
    checks.push({
      id: 'installation-mode',
      label: 'Installation mode confirmed',
      status: 'pass',
      detail: 'Supply-only mode is enabled — installation labour is intentionally suppressed',
    });
  } else {
    checks.push({
      id: 'installation-mode',
      label: 'Installation mode confirmed',
      status: 'pass',
      detail: 'Install included — installation labour is included in the quote total',
    });
  }

  // ── Check 11: Manual charges and credits reviewed ──
  const hasReviewCharge = customCharges.some((charge) =>
    /travel|measure|site|setup|small|manual|commercial|adjust|credit|discount/i.test(charge.description),
  );
  const chargeOrCreditLabel = customCharges.length === 1 ? 'charge/credit' : 'charges/credits';
  const isSmallJob = totalPieces > 0 && (totalPieces <= 2 || (subtotal > 0 && subtotal < 2500));
  if (isSmallJob && !hasReviewCharge) {
    checks.push({
      id: 'manual-charges',
      label: 'Manual charges and credits reviewed',
      status: 'warn',
      detail: 'This looks like a small/simple job and has no measure, travel, setup, credit, or manual adjustment line',
      fix: 'Confirm this is intentional before issuing the quote, especially for supply-only, small vanity, regional, or special commercial jobs',
      fixAction: 'Review Adjustments',
    });
  } else if (customCharges.length > 0) {
    checks.push({
      id: 'manual-charges',
      label: 'Manual charges and credits reviewed',
      status: 'pass',
      detail: `${customCharges.length} additional ${chargeOrCreditLabel} included (${formatCurrency(customChargeTotal)} total)`,
    });
  } else {
    checks.push({
      id: 'manual-charges',
      label: 'Manual charges and credits reviewed',
      status: 'pass',
      detail: 'No manual charges or credits added',
    });
  }

  // ── Check 12: PDF template exists ──
  const template = await prisma.quote_templates.findFirst({
    where: {
      company_id: companyId,
      is_default: true,
      is_active: true,
    },
    select: { name: true },
  });

  if (!template) {
    checks.push({
      id: 'template',
      label: 'PDF template selected',
      status: 'warn',
      detail: 'No default PDF template found — built-in defaults will be used',
      fix: 'Set up a PDF template in Settings for branded quotes',
    });
  } else {
    checks.push({
      id: 'template',
      label: 'PDF template selected',
      status: 'pass',
      detail: `Using '${template.name}'`,
    });
  }

  // ── Filter out any undefined entries (belt-and-suspenders) ──
  const validChecks = checks.filter(Boolean);

  // ── Tally ──
  const failCount = validChecks.filter((c) => c.status === 'fail').length;
  const warnCount = validChecks.filter((c) => c.status === 'warn').length;
  const passCount = validChecks.filter((c) => c.status === 'pass').length;

  return {
    quoteId: quote.id,
    quoteNumber: quote.quote_number,
    checks: validChecks,
    canGenerate: failCount === 0,
    failCount,
    warnCount,
    passCount,
  };
}
