import prisma from '@/lib/db';
import { generateQuoteNumber } from '@/lib/utils';

// ─── Status Types ──────────────────────────────────────────────────────────

export type QuoteStatusValue =
  | 'draft'
  | 'review'
  | 'sent'
  | 'accepted'
  | 'declined'
  | 'revision'
  | 'in_production'
  | 'completed'
  | 'archived';

// ─── Valid Transitions ─────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<QuoteStatusValue, QuoteStatusValue[]> = {
  draft:         ['review', 'archived'],
  review:        ['sent', 'draft', 'archived'],
  sent:          ['accepted', 'declined', 'revision', 'archived'],
  accepted:      ['in_production', 'archived'],
  declined:      ['revision', 'archived'],
  revision:      ['archived'], // revision itself creates a new draft; the old quote stays as 'revision'
  in_production: ['completed', 'archived'],
  completed:     ['archived'],
  archived:      [], // terminal
};

// ─── Status Display Metadata ───────────────────────────────────────────────

export interface StatusDisplay {
  label: string;
  colour: string;       // Tailwind badge classes
  icon: string;         // Emoji icon
  description: string;
}

const STATUS_DISPLAY: Record<QuoteStatusValue, StatusDisplay> = {
  draft: {
    label: 'Draft',
    colour: 'bg-gray-100 text-gray-800',
    icon: '\u{1F4DD}', // pencil
    description: 'Quote is being prepared',
  },
  review: {
    label: 'Review',
    colour: 'bg-yellow-100 text-yellow-800',
    icon: '\u{1F50D}', // magnifying glass
    description: 'Quote is under review',
  },
  sent: {
    label: 'Sent',
    colour: 'bg-blue-100 text-blue-800',
    icon: '\u{1F4E8}', // envelope
    description: 'Quote has been sent to customer',
  },
  accepted: {
    label: 'Accepted',
    colour: 'bg-green-100 text-green-800',
    icon: '\u2705',     // check mark
    description: 'Customer accepted the quote',
  },
  declined: {
    label: 'Declined',
    colour: 'bg-red-100 text-red-800',
    icon: '\u274C',     // cross mark
    description: 'Customer declined the quote',
  },
  revision: {
    label: 'Revision',
    colour: 'bg-purple-100 text-purple-800',
    icon: '\u{1F504}', // counterclockwise arrows
    description: 'A new revision has been created',
  },
  in_production: {
    label: 'In Production',
    colour: 'bg-orange-100 text-orange-800',
    icon: '\u{1F3ED}', // factory
    description: 'Quote is being fabricated',
  },
  completed: {
    label: 'Completed',
    colour: 'bg-emerald-100 text-emerald-800',
    icon: '\u{1F389}', // party popper
    description: 'Job has been completed',
  },
  archived: {
    label: 'Archived',
    colour: 'bg-slate-100 text-slate-500',
    icon: '\u{1F4E6}', // package
    description: 'Quote is archived',
  },
};

// ─── Public Functions ──────────────────────────────────────────────────────

/**
 * Check if a transition from currentStatus to targetStatus is valid.
 */
export function canTransition(
  currentStatus: string,
  targetStatus: string
): boolean {
  const current = currentStatus.toLowerCase() as QuoteStatusValue;
  const target = targetStatus.toLowerCase() as QuoteStatusValue;
  const allowed = VALID_TRANSITIONS[current];
  if (!allowed) return false;
  return allowed.includes(target);
}

/**
 * Get all available transitions from the current status.
 */
export function getAvailableTransitions(currentStatus: string): QuoteStatusValue[] {
  const current = currentStatus.toLowerCase() as QuoteStatusValue;
  return VALID_TRANSITIONS[current] || [];
}

/**
 * Get display metadata for a status.
 */
export function getStatusDisplay(status: string): StatusDisplay {
  const key = status.toLowerCase() as QuoteStatusValue;
  return (
    STATUS_DISPLAY[key] || {
      label: status.charAt(0).toUpperCase() + status.slice(1),
      colour: 'bg-gray-100 text-gray-800',
      icon: '\u2753',
      description: '',
    }
  );
}

/**
 * Get display metadata for all statuses.
 */
export function getAllStatusDisplays(): Record<QuoteStatusValue, StatusDisplay> {
  return STATUS_DISPLAY;
}

/**
 * Transition a quote to a new status with side effects.
 */
export async function transitionQuoteStatus(
  quoteId: number,
  targetStatus: string,
  userId: string,
  options?: { declinedReason?: string }
): Promise<{ success: boolean; error?: string; newQuoteId?: number }> {
  const quote = await prisma.quotes.findUnique({ where: { id: quoteId } });
  if (!quote) {
    return { success: false, error: 'Quote not found' };
  }

  const current = quote.status.toLowerCase() as QuoteStatusValue;
  const target = targetStatus.toLowerCase() as QuoteStatusValue;

  if (!canTransition(current, target)) {
    return {
      success: false,
      error: `Cannot transition from '${current}' to '${target}'`,
    };
  }

  // Validate declined reason
  if (target === 'declined' && !options?.declinedReason) {
    return { success: false, error: 'Declined reason is required' };
  }

  const now = new Date();

  // Build update data based on target status
  const updateData: Record<string, unknown> = {
    status: target,
    status_changed_at: now,
    status_changed_by: userId,
  };

  // Side effects per status
  if (target === 'sent') {
    updateData.sent_at = now;
  }
  if (target === 'accepted') {
    updateData.accepted_at = now;
  }
  if (target === 'declined') {
    updateData.declined_at = now;
    updateData.declined_reason = options?.declinedReason || null;
  }

  // REVISION: create a duplicate quote linked via parent_quote_id
  if (target === 'revision') {
    // First, mark the current quote as 'revision'
    await prisma.quotes.update({
      where: { id: quoteId },
      data: updateData,
    });

    // Then create a new duplicate as a revision
    const newQuote = await duplicateQuote(quoteId, userId, {
      asRevision: true,
    });

    return { success: true, newQuoteId: newQuote.id };
  }

  // Standard transition
  await prisma.quotes.update({
    where: { id: quoteId },
    data: updateData,
  });

  return { success: true };
}

// ─── Read-only statuses (edit mode disabled) ───────────────────────────────

const READ_ONLY_STATUSES: QuoteStatusValue[] = [
  'sent',
  'accepted',
  'in_production',
  'completed',
  'archived',
];

/**
 * Check if a quote with the given status should be read-only (no editing).
 */
export function isReadOnlyStatus(status: string): boolean {
  return READ_ONLY_STATUSES.includes(status.toLowerCase() as QuoteStatusValue);
}

// ─── Duplicate Quote ───────────────────────────────────────────────────────

/**
 * Deep-duplicate a quote, including all rooms, pieces, features, and relationships.
 * Returns the new quote.
 */
export async function duplicateQuote(
  sourceQuoteId: number,
  userId: string,
  options?: { asRevision?: boolean; newTitle?: string }
): Promise<{ id: number; quote_number: string }> {
  return prisma.$transaction(async (tx) => {
    // 1. Fetch the source quote with all nested data
    const source = await tx.quotes.findUnique({
      where: { id: sourceQuoteId },
      include: {
        quote_rooms: {
          orderBy: { sort_order: 'asc' },
          include: {
            quote_pieces: {
              orderBy: { sort_order: 'asc' },
              include: {
                piece_features: true,
                sourceRelationships: true,
                targetRelationships: true,
              },
            },
          },
        },
        options: {
          include: {
            overrides: true,
          },
        },
      },
    });

    if (!source) {
      throw new Error('Source quote not found');
    }

    // 2. Generate a new quote number
    const lastQuote = await tx.quotes.findFirst({
      orderBy: { quote_number: 'desc' },
      select: { quote_number: true },
    });
    const newQuoteNumber = generateQuoteNumber(lastQuote?.quote_number || null);

    // 3. Determine project name
    const projectName = options?.newTitle
      ? options.newTitle
      : options?.asRevision
        ? source.project_name
        : source.project_name
          ? `${source.project_name} (Copy)`
          : null;

    // 4. Calculate revision number
    const revisionNumber = options?.asRevision
      ? source.revision_number + 1
      : 1;

    // 5. Create the new quote
    const newQuote = await tx.quotes.create({
      data: {
        quote_number: newQuoteNumber,
        revision: revisionNumber,
        company_id: source.company_id,
        customer_id: source.customer_id,
        contact_id: source.contact_id,
        project_name: projectName,
        project_address: source.project_address,
        status: 'draft',
        subtotal: source.subtotal,
        tax_rate: source.tax_rate,
        tax_amount: source.tax_amount,
        total: source.total,
        valid_until: source.valid_until,
        notes: source.notes,
        internal_notes: source.internal_notes,
        price_book_id: source.price_book_id,
        calculated_at: source.calculated_at,
        calculated_total: source.calculated_total,
        calculation_breakdown: source.calculation_breakdown ?? undefined,
        created_by: parseInt(userId) || null,
        slabEdgeAllowanceMm: source.slabEdgeAllowanceMm,
        deliveryCost: source.deliveryCost,
        templatingCost: source.templatingCost,
        deliveryAddress: source.deliveryAddress,
        deliveryDistanceKm: source.deliveryDistanceKm,
        templatingRequired: source.templatingRequired,
        templatingDistanceKm: source.templatingDistanceKm,
        overrideSubtotal: source.overrideSubtotal,
        overrideTotal: source.overrideTotal,
        overrideDeliveryCost: source.overrideDeliveryCost,
        overrideTemplatingCost: source.overrideTemplatingCost,
        overrideReason: source.overrideReason,
        overrideBy: source.overrideBy,
        overrideAt: source.overrideAt,
        revision_number: revisionNumber,
        parent_quote_id: options?.asRevision ? sourceQuoteId : null,
        updated_at: new Date(),
      },
    });

    // 6. Duplicate rooms and pieces, building an old→new piece ID map
    const pieceIdMap = new Map<number, number>();

    for (const room of source.quote_rooms) {
      const newRoom = await tx.quote_rooms.create({
        data: {
          quote_id: newQuote.id,
          name: room.name,
          sort_order: room.sort_order,
        },
      });

      for (const piece of room.quote_pieces) {
        const newPiece = await tx.quote_pieces.create({
          data: {
            room_id: newRoom.id,
            material_id: piece.material_id,
            material_name: piece.material_name,
            description: piece.description,
            name: piece.name,
            length_mm: piece.length_mm,
            width_mm: piece.width_mm,
            thickness_mm: piece.thickness_mm,
            area_sqm: piece.area_sqm,
            material_cost: piece.material_cost,
            features_cost: piece.features_cost,
            total_cost: piece.total_cost,
            sort_order: piece.sort_order,
            cutouts: piece.cutouts ?? undefined,
            edge_top: piece.edge_top,
            edge_bottom: piece.edge_bottom,
            edge_left: piece.edge_left,
            edge_right: piece.edge_right,
            lamination_method: piece.lamination_method,
            isOversize: piece.isOversize,
            joinCount: piece.joinCount,
            joinLengthMm: piece.joinLengthMm,
            requiresGrainMatch: piece.requiresGrainMatch,
            waterfall_height_mm: piece.waterfall_height_mm,
          },
        });

        pieceIdMap.set(piece.id, newPiece.id);

        // Duplicate piece features
        for (const feature of piece.piece_features) {
          await tx.piece_features.create({
            data: {
              piece_id: newPiece.id,
              pricing_rule_id: feature.pricing_rule_id,
              name: feature.name,
              quantity: feature.quantity,
              unit_price: feature.unit_price,
              total_price: feature.total_price,
            },
          });
        }
      }
    }

    // 7. Duplicate piece relationships using the ID map
    for (const room of source.quote_rooms) {
      for (const piece of room.quote_pieces) {
        for (const rel of piece.sourceRelationships ?? []) {
          const newSourceId = pieceIdMap.get(rel.source_piece_id);
          const newTargetId = pieceIdMap.get(rel.target_piece_id);
          if (newSourceId && newTargetId) {
            try {
              await tx.piece_relationships.create({
                data: {
                  source_piece_id: newSourceId,
                  target_piece_id: newTargetId,
                  relation_type: rel.relation_type,
                  relationship_type: rel.relationship_type,
                  side: rel.side,
                  notes: rel.notes,
                },
              });
            } catch (err) {
              console.error('Failed to create piece relationship during quote copy:', err);
              // Continue without failing the whole operation
            }
          }
        }
      }
    }

    // 8. Duplicate quote options and overrides
    for (const option of source.options) {
      const newOption = await tx.quote_options.create({
        data: {
          quoteId: newQuote.id,
          name: option.name,
          description: option.description,
          sortOrder: option.sortOrder,
          isBase: option.isBase,
          subtotal: option.subtotal,
          discountAmount: option.discountAmount,
          gstAmount: option.gstAmount,
          total: option.total,
          material_margin_adjust_percent: option.material_margin_adjust_percent,
        },
      });

      for (const override of option.overrides) {
        const newPieceId = pieceIdMap.get(override.pieceId);
        if (newPieceId) {
          await tx.quote_option_overrides.create({
            data: {
              optionId: newOption.id,
              pieceId: newPieceId,
              materialId: override.materialId,
              thicknessMm: override.thicknessMm,
              edgeTop: override.edgeTop,
              edgeBottom: override.edgeBottom,
              edgeLeft: override.edgeLeft,
              edgeRight: override.edgeRight,
              cutouts: override.cutouts ?? undefined,
              lengthMm: override.lengthMm,
              widthMm: override.widthMm,
            },
          });
        }
      }
    }

    return { id: newQuote.id, quote_number: newQuote.quote_number };
  });
}
