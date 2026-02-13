import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';

// QuoteChangeType is not yet in Prisma schema - define locally
export type QuoteChangeType = 'CREATED' | 'UPDATED' | 'ROLLED_BACK' | 'SENT_TO_CLIENT' | 'CLIENT_APPROVED' | 'CLIENT_REJECTED' | 'CLIENT_VIEWED' | 'PRICING_RECALCULATED' | 'STATUS_CHANGED';

// Fields that exist in the database but are not yet in the Prisma schema.
// Used for double-cast pattern: `quote as unknown as QuoteExtendedFields`
interface QuoteExtendedFields {
  deliveryCost: number | null;
  templatingCost: number | null;
  overrideSubtotal: number | null;
  overrideTotal: number | null;
  overrideDeliveryCost: number | null;
  overrideTemplatingCost: number | null;
  overrideReason: string | null;
  deliveryAddress: string | null;
  deliveryDistanceKm: number | null;
  templatingRequired: boolean;
  templatingDistanceKm: number | null;
}

// quote_versions model is not yet in the Prisma schema.
// This interface types the prisma client extension for that model.
interface PrismaWithQuoteVersions {
  $transaction: typeof prisma.$transaction;
  quote_versions: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: number }>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: number;
      snapshotData: unknown;
      version: number;
    } | null>;
  };
}

// Type for the snapshot data structure
export interface QuoteSnapshot {
  // Quote header info
  quote_number: string;
  status: string;
  client_types: string | null;
  client_tiers: string | null;
  
  // Customer info
  customer: {
    id: number;
    name: string;
    email: string | null;
    phone: string | null;
  } | null;
  
  // Material info (if there's a common material)
  materials: {
    id: number;
    name: string;
    pricePerSqm: number;
  } | null;
  
  // Rooms and pieces
  rooms: Array<{
    id: number;
    name: string;
    sortOrder: number;
    pieces: Array<{
      id: number;
      name: string;
      widthMm: number;
      lengthMm: number;
      thicknessMm: number;
      areaSqm: number;
      materialId: number | null;
      materialName: string | null;
      edgeTop: string | null;
      edgeBottom: string | null;
      edgeLeft: string | null;
      edgeRight: string | null;
      cutouts: unknown;
      piece_features: Array<{
        id: number;
        name: string;
        quantity: number;
        unitPrice: number;
        totalPrice: number;
      }>;
    }>;
  }>;
  
  // Pricing breakdown
  pricing: {
    subtotal: number;
    tax_rate: number;
    tax_amount: number;
    total: number;
    calculated_total: number | null;
    deliveryCost: number | null;
    templatingCost: number | null;
    
    // Any overrides
    overrides: {
      overrideSubtotal: number | null;
      overrideTotal: number | null;
      overrideDeliveryCost: number | null;
      overrideTemplatingCost: number | null;
      overrideReason: string | null;
    };
  };
  
  // Delivery info
  delivery: {
    deliveryAddress: string | null;
    deliveryDistanceKm: number | null;
    templatingRequired: boolean;
    templatingDistanceKm: number | null;
  };
  
  // Metadata
  notes: string | null;
  internal_notes: string | null;
  valid_until: string | null;
  project_name: string | null;
  project_address: string | null;
}

/**
 * Creates a complete snapshot of a quote's current state
 */
export async function createQuoteSnapshot(quoteId: number): Promise<QuoteSnapshot> {
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    include: {
      customers: {
        include: {
          client_types: true,
          client_tiers: true,
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
    },
  });

  if (!quote) {
    throw new Error(`Quote ${quoteId} not found`);
  }

  // Get the most common material if there is one
  let commonMaterial: { id: number; name: string; pricePerSqm: number } | null = null;
  const allMaterials = quote.quote_rooms.flatMap(r => r.quote_pieces.map(p => p.materials).filter(Boolean));
  if (allMaterials.length > 0) {
    const firstMaterial = allMaterials[0];
    if (firstMaterial) {
      commonMaterial = {
        id: firstMaterial.id,
        name: firstMaterial.name,
        pricePerSqm: Number(firstMaterial.price_per_sqm),
      };
    }
  }

  // Double-cast to access fields not yet in Prisma schema
  const ext = quote as unknown as QuoteExtendedFields;

  return {
    quote_number: quote.quote_number,
    status: quote.status,
    client_types: quote.customers?.client_types?.name ?? null,
    client_tiers: quote.customers?.client_tiers?.name ?? null,

    customer: quote.customers ? {
      id: quote.customers.id,
      name: quote.customers.name,
      email: quote.customers.email,
      phone: quote.customers.phone,
    } : null,
    
    materials: commonMaterial,
    
    rooms: quote.quote_rooms.map((room) => ({
      id: room.id,
      name: room.name,
      sortOrder: room.sort_order,
      pieces: room.quote_pieces.map((piece) => ({
        id: piece.id,
        name: piece.name,
        widthMm: piece.width_mm,
        lengthMm: piece.length_mm,
        thicknessMm: piece.thickness_mm,
        areaSqm: Number(piece.area_sqm),
        materialId: piece.material_id,
        materialName: piece.material_name,
        materialCost: Number(piece.material_cost),
        featuresCost: Number(piece.features_cost),
        totalCost: Number(piece.total_cost),
        edgeTop: piece.edge_top,
        edgeBottom: piece.edge_bottom,
        edgeLeft: piece.edge_left,
        edgeRight: piece.edge_right,
        cutouts: piece.cutouts,
        piece_features: piece.piece_features.map((f) => ({
          id: f.id,
          name: f.name,
          quantity: f.quantity,
          unitPrice: Number(f.unit_price),
          totalPrice: Number(f.total_price),
        })),
      })),
    })),
    
    pricing: {
      subtotal: Number(quote.subtotal),
      tax_rate: Number(quote.tax_rate),
      tax_amount: Number(quote.tax_amount),
      total: Number(quote.total),
      calculated_total: quote.calculated_total ? Number(quote.calculated_total) : null,
      // These fields exist in DB but not yet in Prisma schema — double-cast to access
      deliveryCost: ext.deliveryCost ? Number(ext.deliveryCost) : null,
      templatingCost: ext.templatingCost ? Number(ext.templatingCost) : null,
      overrides: {
        overrideSubtotal: ext.overrideSubtotal ? Number(ext.overrideSubtotal) : null,
        overrideTotal: ext.overrideTotal ? Number(ext.overrideTotal) : null,
        overrideDeliveryCost: ext.overrideDeliveryCost ? Number(ext.overrideDeliveryCost) : null,
        overrideTemplatingCost: ext.overrideTemplatingCost ? Number(ext.overrideTemplatingCost) : null,
        overrideReason: ext.overrideReason,
      },
    },

    delivery: {
      deliveryAddress: ext.deliveryAddress,
      deliveryDistanceKm: ext.deliveryDistanceKm ? Number(ext.deliveryDistanceKm) : null,
      templatingRequired: ext.templatingRequired,
      templatingDistanceKm: ext.templatingDistanceKm ? Number(ext.templatingDistanceKm) : null,
    },
    
    notes: quote.notes,
    internal_notes: quote.internal_notes,
    valid_until: quote.valid_until?.toISOString() ?? null,
    project_name: quote.project_name,
    project_address: quote.project_address,
  };
}

/**
 * Compares two snapshots and returns the differences
 */
export function compareSnapshots(
  oldSnapshot: QuoteSnapshot,
  newSnapshot: QuoteSnapshot
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};

  // Compare top-level fields
  const topLevelFields = ['status', 'client_types', 'client_tiers', 'notes', 'project_name', 'project_address'] as const;
  for (const field of topLevelFields) {
    if (oldSnapshot[field] !== newSnapshot[field]) {
      changes[field] = { old: oldSnapshot[field], new: newSnapshot[field] };
    }
  }

  // Compare customer
  if (oldSnapshot.customer?.id !== newSnapshot.customer?.id) {
    changes['customer'] = { 
      old: oldSnapshot.customer?.name ?? null, 
      new: newSnapshot.customer?.name ?? null 
    };
  }

  // Compare material
  if (oldSnapshot.materials?.id !== newSnapshot.materials?.id) {
    changes['material'] = {
      old: oldSnapshot.materials?.name ?? null,
      new: newSnapshot.materials?.name ?? null
    };
  }

  // Compare pricing
  const pricingFields = ['subtotal', 'tax_amount', 'total'] as const;
  for (const field of pricingFields) {
    if (oldSnapshot.pricing[field] !== newSnapshot.pricing[field]) {
      changes[`pricing.${field}`] = { 
        old: oldSnapshot.pricing[field], 
        new: newSnapshot.pricing[field] 
      };
    }
  }

  // Compare piece counts
  const oldPieceCount = oldSnapshot.rooms.reduce(
    (sum, r) => sum + r.pieces.length, 0
  );
  const newPieceCount = newSnapshot.rooms.reduce(
    (sum, r) => sum + r.pieces.length, 0
  );
  if (oldPieceCount !== newPieceCount) {
    changes['pieceCount'] = { old: oldPieceCount, new: newPieceCount };
  }

  // Compare room counts
  if (oldSnapshot.rooms.length !== newSnapshot.rooms.length) {
    changes['roomCount'] = { 
      old: oldSnapshot.rooms.length, 
      new: newSnapshot.rooms.length 
    };
  }

  // Compare delivery
  if (oldSnapshot.delivery.deliveryAddress !== newSnapshot.delivery.deliveryAddress) {
    changes['deliveryAddress'] = { 
      old: oldSnapshot.delivery.deliveryAddress, 
      new: newSnapshot.delivery.deliveryAddress 
    };
  }

  if (oldSnapshot.delivery.templatingRequired !== newSnapshot.delivery.templatingRequired) {
    changes['templatingRequired'] = { 
      old: oldSnapshot.delivery.templatingRequired, 
      new: newSnapshot.delivery.templatingRequired 
    };
  }

  return changes;
}

/**
 * Generates a human-readable summary of changes
 */
export function generateChangeSummary(
  changes: Record<string, { old: unknown; new: unknown }>,
  changeType: QuoteChangeType
): string {
  const parts: string[] = [];

  // Handle specific change types
  switch (changeType) {
    case 'CREATED':
      return 'Quote created';
    case 'ROLLED_BACK':
      return 'Restored from previous version';
    case 'SENT_TO_CLIENT':
      return 'Quote sent to client';
    case 'CLIENT_APPROVED':
      return 'Client approved and signed';
    case 'CLIENT_REJECTED':
      return 'Client declined';
    case 'CLIENT_VIEWED':
      return 'Client viewed quote';
  }

  // Build summary from changes
  if (changes['pieceCount']) {
    const diff = (changes['pieceCount'].new as number) - (changes['pieceCount'].old as number);
    if (diff > 0) {
      parts.push(`${diff} piece(s) added`);
    } else {
      parts.push(`${Math.abs(diff)} piece(s) removed`);
    }
  }

  if (changes['pricing.total']) {
    const oldTotal = changes['pricing.total'].old as number;
    const newTotal = changes['pricing.total'].new as number;
    const diff = newTotal - oldTotal;
    const sign = diff >= 0 ? '+' : '';
    parts.push(`Total ${sign}$${diff.toFixed(2)}`);
  }

  if (changes['status']) {
    parts.push(`Status: ${changes['status'].old} → ${changes['status'].new}`);
  }

  if (changes['material']) {
    parts.push(`Material changed to ${changes['material'].new}`);
  }

  if (changes['customer']) {
    parts.push(`Customer changed to ${changes['customer'].new}`);
  }

  if (changes['deliveryAddress']) {
    parts.push('Delivery address updated');
  }

  if (changes['templatingRequired']) {
    const required = changes['templatingRequired'].new as boolean;
    parts.push(required ? 'Templating added' : 'Templating removed');
  }

  return parts.length > 0 ? parts.join(', ') : 'Minor changes';
}

// --- Detailed Change Summary types and function ---

export interface FieldChange {
  field: string;
  label: string;
  oldValue: unknown;
  newValue: unknown;
}

export interface ChangeSummary {
  fieldChanges: FieldChange[];
  piecesAdded: Array<{ name: string; quote_rooms: string; dimensions: string }>;
  piecesRemoved: Array<{ name: string; quote_rooms: string; dimensions: string }>;
  piecesModified: Array<{ name: string; quote_rooms: string; changes: string[] }>;
  description: string;
}

/**
 * Generates a detailed change summary comparing two snapshots
 */
export function generateDetailedChangeSummary(
  oldSnapshot: QuoteSnapshot,
  newSnapshot: QuoteSnapshot
): ChangeSummary {
  const fieldChanges: FieldChange[] = [];
  const piecesAdded: ChangeSummary['piecesAdded'] = [];
  const piecesRemoved: ChangeSummary['piecesRemoved'] = [];
  const piecesModified: ChangeSummary['piecesModified'] = [];

  // Compare top-level fields
  const fieldMap: Array<{ key: keyof QuoteSnapshot; label: string }> = [
    { key: 'status', label: 'Status' },
    { key: 'client_types', label: 'Client Type' },
    { key: 'client_tiers', label: 'Client Tier' },
    { key: 'notes', label: 'Notes' },
    { key: 'project_name', label: 'Project Name' },
    { key: 'project_address', label: 'Project Address' },
  ];

  for (const { key, label } of fieldMap) {
    if (oldSnapshot[key] !== newSnapshot[key]) {
      fieldChanges.push({ field: key, label, oldValue: oldSnapshot[key], newValue: newSnapshot[key] });
    }
  }

  // Compare customer
  if (oldSnapshot.customer?.id !== newSnapshot.customer?.id) {
    fieldChanges.push({
      field: 'customer',
      label: 'Customer',
      oldValue: oldSnapshot.customer?.name ?? '(none)',
      newValue: newSnapshot.customer?.name ?? '(none)',
    });
  }

  // Compare material
  if (oldSnapshot.materials?.id !== newSnapshot.materials?.id) {
    fieldChanges.push({
      field: 'material',
      label: 'Material',
      oldValue: oldSnapshot.materials?.name ?? '(none)',
      newValue: newSnapshot.materials?.name ?? '(none)',
    });
  }

  // Compare pricing
  const pricingFields: Array<{ key: keyof QuoteSnapshot['pricing']; label: string }> = [
    { key: 'subtotal', label: 'Subtotal' },
    { key: 'tax_amount', label: 'Tax Amount' },
    { key: 'total', label: 'Total' },
    { key: 'deliveryCost', label: 'Delivery Cost' },
    { key: 'templatingCost', label: 'Templating Cost' },
  ];

  for (const { key, label } of pricingFields) {
    if (oldSnapshot.pricing[key] !== newSnapshot.pricing[key]) {
      fieldChanges.push({
        field: `pricing.${key}`,
        label,
        oldValue: oldSnapshot.pricing[key],
        newValue: newSnapshot.pricing[key],
      });
    }
  }

  // Compare delivery
  if (oldSnapshot.delivery.deliveryAddress !== newSnapshot.delivery.deliveryAddress) {
    fieldChanges.push({
      field: 'delivery.deliveryAddress',
      label: 'Delivery Address',
      oldValue: oldSnapshot.delivery.deliveryAddress ?? '(none)',
      newValue: newSnapshot.delivery.deliveryAddress ?? '(none)',
    });
  }

  if (oldSnapshot.delivery.templatingRequired !== newSnapshot.delivery.templatingRequired) {
    fieldChanges.push({
      field: 'delivery.templatingRequired',
      label: 'Templating Required',
      oldValue: oldSnapshot.delivery.templatingRequired ? 'Yes' : 'No',
      newValue: newSnapshot.delivery.templatingRequired ? 'Yes' : 'No',
    });
  }

  // Compare pieces
  const oldPieces = new Map<number, { name: string; quote_rooms: string; widthMm: number; lengthMm: number; thicknessMm: number; materialName: string | null; edgeTop: string | null; edgeBottom: string | null; edgeLeft: string | null; edgeRight: string | null }>();
  const newPieces = new Map<number, { name: string; quote_rooms: string; widthMm: number; lengthMm: number; thicknessMm: number; materialName: string | null; edgeTop: string | null; edgeBottom: string | null; edgeLeft: string | null; edgeRight: string | null }>();

  for (const room of oldSnapshot.rooms) {
    for (const piece of room.pieces) {
      oldPieces.set(piece.id, {
        name: piece.name,
        quote_rooms: room.name,
        widthMm: piece.widthMm,
        lengthMm: piece.lengthMm,
        thicknessMm: piece.thicknessMm,
        materialName: piece.materialName,
        edgeTop: piece.edgeTop,
        edgeBottom: piece.edgeBottom,
        edgeLeft: piece.edgeLeft,
        edgeRight: piece.edgeRight,
      });
    }
  }

  for (const room of newSnapshot.rooms) {
    for (const piece of room.pieces) {
      newPieces.set(piece.id, {
        name: piece.name,
        quote_rooms: room.name,
        widthMm: piece.widthMm,
        lengthMm: piece.lengthMm,
        thicknessMm: piece.thicknessMm,
        materialName: piece.materialName,
        edgeTop: piece.edgeTop,
        edgeBottom: piece.edgeBottom,
        edgeLeft: piece.edgeLeft,
        edgeRight: piece.edgeRight,
      });
    }
  }

  // Find added pieces
  const oldPieceIds = Array.from(oldPieces.keys());
  const newPieceIds = Array.from(newPieces.keys());

  for (const id of newPieceIds) {
    if (!oldPieces.has(id)) {
      const p = newPieces.get(id)!;
      piecesAdded.push({
        name: p.name,
        quote_rooms: p.quote_rooms,
        dimensions: `${p.widthMm} × ${p.lengthMm}mm`,
      });
    }
  }

  // Find removed pieces
  for (const id of oldPieceIds) {
    if (!newPieces.has(id)) {
      const p = oldPieces.get(id)!;
      piecesRemoved.push({
        name: p.name,
        quote_rooms: p.quote_rooms,
        dimensions: `${p.widthMm} × ${p.lengthMm}mm`,
      });
    }
  }

  // Find modified pieces
  for (const id of newPieceIds) {
    if (oldPieces.has(id)) {
      const oldP = oldPieces.get(id)!;
      const newP = newPieces.get(id)!;
      const changes: string[] = [];

      if (oldP.name !== newP.name) changes.push(`Name: ${oldP.name} → ${newP.name}`);
      if (oldP.widthMm !== newP.widthMm || oldP.lengthMm !== newP.lengthMm) {
        changes.push(`Dimensions: ${oldP.widthMm}×${oldP.lengthMm} → ${newP.widthMm}×${newP.lengthMm}mm`);
      }
      if (oldP.thicknessMm !== newP.thicknessMm) {
        changes.push(`Thickness: ${oldP.thicknessMm} → ${newP.thicknessMm}mm`);
      }
      if (oldP.materialName !== newP.materialName) {
        changes.push(`Material: ${oldP.materialName ?? '(none)'} → ${newP.materialName ?? '(none)'}`);
      }
      if (oldP.edgeTop !== newP.edgeTop) changes.push(`Top edge: ${oldP.edgeTop ?? 'none'} → ${newP.edgeTop ?? 'none'}`);
      if (oldP.edgeBottom !== newP.edgeBottom) changes.push(`Bottom edge: ${oldP.edgeBottom ?? 'none'} → ${newP.edgeBottom ?? 'none'}`);
      if (oldP.edgeLeft !== newP.edgeLeft) changes.push(`Left edge: ${oldP.edgeLeft ?? 'none'} → ${newP.edgeLeft ?? 'none'}`);
      if (oldP.edgeRight !== newP.edgeRight) changes.push(`Right edge: ${oldP.edgeRight ?? 'none'} → ${newP.edgeRight ?? 'none'}`);

      if (changes.length > 0) {
        piecesModified.push({ name: newP.name, quote_rooms: newP.quote_rooms, changes });
      }
    }
  }

  // Build description
  const parts: string[] = [];
  if (fieldChanges.length > 0) parts.push(`${fieldChanges.length} field change(s)`);
  if (piecesAdded.length > 0) parts.push(`${piecesAdded.length} piece(s) added`);
  if (piecesRemoved.length > 0) parts.push(`${piecesRemoved.length} piece(s) removed`);
  if (piecesModified.length > 0) parts.push(`${piecesModified.length} piece(s) modified`);
  const description = parts.length > 0 ? parts.join(', ') : 'No significant changes detected';

  return { fieldChanges, piecesAdded, piecesRemoved, piecesModified, description };
}

/**
 * Creates a new version record for a quote
 */
export async function createQuoteVersion(
  quoteId: number,
  userId: number,
  changeType: QuoteChangeType,
  changeReason?: string,
  previousSnapshot?: QuoteSnapshot,
  rolledBackFromVersion?: number
): Promise<void> {
  // Get current snapshot
  const currentSnapshot = await createQuoteSnapshot(quoteId);
  
  // Get the quote's current version number
  const quote = await prisma.quotes.findUnique({
    where: { id: quoteId },
    select: { revision: true },
  });

  if (!quote) {
    throw new Error(`Quote ${quoteId} not found`);
  }

  const newVersionNumber = quote.revision + 1;

  // Calculate changes if we have a previous snapshot
  let changes: Record<string, { old: unknown; new: unknown }> | null = null;
  let changeSummary: string | null = null;

  if (previousSnapshot) {
    changes = compareSnapshots(previousSnapshot, currentSnapshot);
    changeSummary = generateChangeSummary(changes, changeType);
  } else if (changeType === 'CREATED') {
    changeSummary = 'Quote created';
  }

  // Calculate piece count
  const pieceCount = currentSnapshot.rooms.reduce(
    (sum, r) => sum + r.pieces.length, 0
  );

  // Create version record and update quote in transaction
  // quote_versions model is not yet in Prisma schema — double-cast to typed interface
  const prismaExt = prisma as unknown as PrismaWithQuoteVersions;
  await prisma.$transaction(async () => {
    await prismaExt.quote_versions.create({
      data: {
        quoteId,
        version: newVersionNumber,
        snapshotData: currentSnapshot as unknown as Prisma.InputJsonValue,
        changeType,
        changeReason,
        changeSummary,
        changes: changes as unknown as Prisma.InputJsonValue,
        changedByUserId: userId,
        rolledBackFromVersion,
        subtotal: currentSnapshot.pricing.subtotal,
        tax_amount: currentSnapshot.pricing.tax_amount,
        totalAmount: currentSnapshot.pricing.total,
        pieceCount,
      },
    });
    await prisma.quotes.update({
      where: { id: quoteId },
      data: { revision: newVersionNumber },
    });
  });
}

/**
 * Creates the initial version when a quote is first created
 */
export async function createInitialVersion(
  quoteId: number,
  userId: number
): Promise<void> {
  const snapshot = await createQuoteSnapshot(quoteId);
  
  const pieceCount = snapshot.rooms.reduce(
    (sum, r) => sum + r.pieces.length, 0
  );

  // quote_versions model is not yet in Prisma schema — double-cast to typed interface
  const prismaExt = prisma as unknown as PrismaWithQuoteVersions;
  await prismaExt.quote_versions.create({
    data: {
      quoteId,
      version: 1,
      snapshotData: snapshot as unknown as Prisma.InputJsonValue,
      changeType: 'CREATED',
      changeSummary: 'Quote created',
      changedByUserId: userId,
      subtotal: snapshot.pricing.subtotal,
      tax_amount: snapshot.pricing.tax_amount,
      totalAmount: snapshot.pricing.total,
      pieceCount,
    },
  });
}

/**
 * Restores a quote to a previous version (creates new version with old data)
 */
export async function rollbackToVersion(
  quoteId: number,
  targetVersion: number,
  userId: number,
  reason?: string
): Promise<void> {
  // Get the target version's snapshot
  // quote_versions model is not yet in Prisma schema — double-cast to typed interface
  const prismaExt = prisma as unknown as PrismaWithQuoteVersions;
  const targetVersionRecord = await prismaExt.quote_versions.findUnique({
    where: {
      quoteId_version: {
        quoteId,
        version: targetVersion,
      },
    },
  });

  if (!targetVersionRecord) {
    throw new Error(`Version ${targetVersion} not found for quote ${quoteId}`);
  }

  const snapshot = targetVersionRecord.snapshotData as unknown as QuoteSnapshot;

  // Get current snapshot for comparison
  const currentSnapshot = await createQuoteSnapshot(quoteId);

  // Restore the quote data from snapshot (full restore including rooms/pieces)
  await prisma.$transaction(async (tx) => {
    // Delete existing rooms (cascade deletes pieces and features)
    await tx.quote_rooms.deleteMany({ where: { quote_id: quoteId } });

    // Update quote header fields
    await tx.quotes.update({
      where: { id: quoteId },
      data: {
        status: snapshot.status,
        notes: snapshot.notes,
        internal_notes: snapshot.internal_notes,
        project_name: snapshot.project_name,
        project_address: snapshot.project_address,
        subtotal: snapshot.pricing.subtotal,
        tax_rate: snapshot.pricing.tax_rate,
        tax_amount: snapshot.pricing.tax_amount,
        total: snapshot.pricing.total,
        calculated_total: snapshot.pricing.calculated_total,
        valid_until: snapshot.valid_until ? new Date(snapshot.valid_until) : null,
        // Recreate rooms with pieces from snapshot
        quote_rooms: {
          create: snapshot.rooms.map((room) => ({
            name: room.name,
            sort_order: room.sortOrder,
            quote_pieces: {
              create: room.pieces.map((piece) => ({
                name: piece.name,
                description: piece.name,
                width_mm: piece.widthMm,
                length_mm: piece.lengthMm,
                thickness_mm: piece.thicknessMm,
                area_sqm: piece.areaSqm,
                material_id: piece.materialId,
                material_name: piece.materialName,
                material_cost: (piece as Record<string, unknown>).materialCost as number ?? 0,
                features_cost: (piece as Record<string, unknown>).featuresCost as number ?? 0,
                total_cost: (piece as Record<string, unknown>).totalCost as number ?? 0,
                sort_order: 0,
                edge_top: piece.edgeTop,
                edge_bottom: piece.edgeBottom,
                edge_left: piece.edgeLeft,
                edge_right: piece.edgeRight,
                piece_features: {
                  create: piece.piece_features.map((f) => ({
                    name: f.name,
                    quantity: f.quantity,
                    unit_price: f.unitPrice,
                    total_price: f.totalPrice,
                  })),
                },
              })),
            },
          })),
        },
      },
    });
  });

  // Create the rollback version
  await createQuoteVersion(
    quoteId,
    userId,
    'ROLLED_BACK',
    reason || `Restored from version ${targetVersion}`,
    currentSnapshot,
    targetVersion
  );
}
