// src/lib/services/quote-validation.ts
// Central validation service for the wizard-to-quote pipeline.
// Three gates: client-side (wizard), server-side (API), pre-pricing.

import type { PrismaClient } from '@prisma/client';

/* ─── Shared types ─── */

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/* ─── Wizard piece shape (matches WizardPiece in ManualQuoteWizard) ─── */

interface WizardPieceInput {
  name: string;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  edges?: { top: string; bottom: string; left: string; right: string };
  cutouts?: Array<{ type: string; quantity: number }>;
}

interface WizardRoomInput {
  name: string;
  pieces: WizardPieceInput[];
}

// ========================================
// GATE 1: Wizard UI -> Before API call
// Runs CLIENT-SIDE before submit
// ========================================
export function validateWizardData(data: {
  projectName?: string;
  customerId?: number | null;
  rooms: WizardRoomInput[];
}): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Project name
  if (!data.projectName?.trim()) {
    warnings.push({
      field: 'projectName',
      message: 'No project name — will default to "Untitled Quote"',
      severity: 'warning',
    });
  }

  // Customer (warn, don't block — can be added later)
  if (!data.customerId) {
    warnings.push({
      field: 'customerId',
      message: 'No customer selected — can be assigned later in the builder',
      severity: 'warning',
    });
  }

  // Rooms
  if (!data.rooms || data.rooms.length === 0) {
    errors.push({
      field: 'rooms',
      message: 'At least one room is required',
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  for (let ri = 0; ri < data.rooms.length; ri++) {
    const room = data.rooms[ri];

    if (!room.name?.trim()) {
      errors.push({
        field: `rooms[${ri}].name`,
        message: `Room ${ri + 1} has no name`,
        severity: 'error',
      });
    }

    if (!room.pieces || room.pieces.length === 0) {
      errors.push({
        field: `rooms[${ri}].pieces`,
        message: `${room.name || `Room ${ri + 1}`} has no pieces`,
        severity: 'error',
      });
      continue;
    }

    for (let pi = 0; pi < room.pieces.length; pi++) {
      const piece = room.pieces[pi];
      const prefix = `${room.name || `Room ${ri + 1}`} → ${piece.name || `Piece ${pi + 1}`}`;

      // Dimensions must be positive numbers
      if (
        !piece.length_mm ||
        piece.length_mm <= 0 ||
        isNaN(Number(piece.length_mm))
      ) {
        errors.push({
          field: `rooms[${ri}].pieces[${pi}].length_mm`,
          message: `${prefix}: length must be a positive number`,
          severity: 'error',
        });
      }
      if (
        !piece.width_mm ||
        piece.width_mm <= 0 ||
        isNaN(Number(piece.width_mm))
      ) {
        errors.push({
          field: `rooms[${ri}].pieces[${pi}].width_mm`,
          message: `${prefix}: width must be a positive number`,
          severity: 'error',
        });
      }

      // Sanity checks (warnings, non-blocking)
      if (piece.length_mm > 10000) {
        warnings.push({
          field: `rooms[${ri}].pieces[${pi}].length_mm`,
          message: `${prefix}: length ${piece.length_mm}mm seems very large (>10m)`,
          severity: 'warning',
        });
      }
      if (piece.width_mm > 3000) {
        warnings.push({
          field: `rooms[${ri}].pieces[${pi}].width_mm`,
          message: `${prefix}: width ${piece.width_mm}mm exceeds standard slab width`,
          severity: 'warning',
        });
      }

      // Thickness sanity
      if (
        piece.thickness_mm &&
        ![20, 30, 40].includes(piece.thickness_mm)
      ) {
        warnings.push({
          field: `rooms[${ri}].pieces[${pi}].thickness_mm`,
          message: `${prefix}: unusual thickness ${piece.thickness_mm}mm`,
          severity: 'warning',
        });
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ========================================
// GATE 2: API -> Before Prisma create
// Runs SERVER-SIDE in the API route
// ========================================
export function validateBatchCreatePayload(body: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  if (!body || typeof body !== 'object') {
    errors.push({
      field: 'body',
      message: 'Request body is empty or invalid',
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  const data = body as Record<string, unknown>;

  // Rooms array
  if (!Array.isArray(data.rooms) || data.rooms.length === 0) {
    errors.push({
      field: 'rooms',
      message: 'At least one room is required',
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  // Validate and coerce each room/piece
  for (let ri = 0; ri < (data.rooms as Array<Record<string, unknown>>).length; ri++) {
    const room = (data.rooms as Array<Record<string, unknown>>)[ri];

    if (!room || typeof room.name !== 'string' || !room.name.trim()) {
      errors.push({
        field: `rooms[${ri}].name`,
        message: `Room at index ${ri} must have a name`,
        severity: 'error',
      });
    }

    if (!Array.isArray(room.pieces) || room.pieces.length === 0) {
      errors.push({
        field: `rooms[${ri}].pieces`,
        message: `Room "${room.name || ri}" must have at least one piece`,
        severity: 'error',
      });
      continue;
    }

    for (let pi = 0; pi < (room.pieces as Array<Record<string, unknown>>).length; pi++) {
      const piece = (room.pieces as Array<Record<string, unknown>>)[pi];

      if (!piece || typeof piece.name !== 'string' || !piece.name.trim()) {
        errors.push({
          field: `rooms[${ri}].pieces[${pi}].name`,
          message: `Piece at index ${pi} in room "${room.name || ri}" must have a name`,
          severity: 'error',
        });
      }

      // Type coercion safety — dimensions MUST be numbers
      if (typeof piece.lengthMm === 'string') {
        piece.lengthMm = Number(piece.lengthMm);
      }
      if (typeof piece.widthMm === 'string') {
        piece.widthMm = Number(piece.widthMm);
      }
      if (typeof piece.thicknessMm === 'string') {
        piece.thicknessMm = Number(piece.thicknessMm);
      }

      if (
        piece.lengthMm !== undefined &&
        piece.lengthMm !== null &&
        isNaN(piece.lengthMm as number)
      ) {
        errors.push({
          field: `rooms[${ri}].pieces[${pi}].lengthMm`,
          message: `Piece "${piece.name || pi}" has non-numeric length`,
          severity: 'error',
        });
      }
      if (
        piece.widthMm !== undefined &&
        piece.widthMm !== null &&
        isNaN(piece.widthMm as number)
      ) {
        errors.push({
          field: `rooms[${ri}].pieces[${pi}].widthMm`,
          message: `Piece "${piece.name || pi}" has non-numeric width`,
          severity: 'error',
        });
      }
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

// ========================================
// GATE 3: After Prisma create -> Before pricing
// Runs SERVER-SIDE after quote is saved
// ========================================
export async function validateQuoteForPricing(
  quoteId: number,
  db: PrismaClient,
): Promise<ValidationResult> {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Check quote exists with pieces
  const quote = await db.quotes.findUnique({
    where: { id: quoteId },
    include: {
      quote_rooms: {
        include: {
          quote_pieces: true,
        },
      },
    },
  });

  if (!quote) {
    errors.push({
      field: 'quote',
      message: `Quote ${quoteId} not found`,
      severity: 'error',
    });
    return { valid: false, errors, warnings };
  }

  // Collect all pieces across rooms
  const allPieces = quote.quote_rooms.flatMap((r) => r.quote_pieces);

  if (allPieces.length === 0) {
    errors.push({
      field: 'pieces',
      message: 'Quote has no pieces — nothing to price',
      severity: 'error',
    });
  }

  // Check ServiceRates exist for core types
  const serviceRates = await db.service_rates.findMany({
    where: { isActive: true },
  });
  const loadedTypes = Array.from(
    new Set(serviceRates.map((r) => r.serviceType)),
  );
  const requiredTypes = ['CUTTING', 'POLISHING', 'INSTALLATION'] as const;
  const missingTypes = requiredTypes.filter(
    (t) => !loadedTypes.includes(t),
  );

  if (missingTypes.length > 0) {
    errors.push({
      field: 'serviceRates',
      message: `Missing service rates: ${missingTypes.join(', ')}. Configure in Pricing Admin.`,
      severity: 'error',
    });
  }

  // Check pieces have valid dimensions
  for (const piece of allPieces) {
    if (!piece.length_mm || piece.length_mm <= 0) {
      errors.push({
        field: `piece.${piece.id}.length`,
        message: `"${piece.name}" has no length`,
        severity: 'error',
      });
    }
    if (!piece.width_mm || piece.width_mm <= 0) {
      errors.push({
        field: `piece.${piece.id}.width`,
        message: `"${piece.name}" has no width`,
        severity: 'error',
      });
    }
  }

  // Non-blocking warnings
  if (!quote.customer_id) {
    warnings.push({
      field: 'customerId',
      message: 'No customer assigned — pricing will use default rates',
      severity: 'warning',
    });
  }

  return { valid: errors.length === 0, errors, warnings };
}
