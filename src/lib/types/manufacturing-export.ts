/**
 * Manufacturing Export Types
 *
 * Defines the JSON payload structure exported when a quote is locked/finalised.
 * This payload tells the factory floor exactly what to do with each piece,
 * including dimensions, edge profiles, cutouts, and machine assignments.
 *
 * Reference: Stonehenge-v2 Machine Logic doc — Section 4
 */

export interface ManufacturingPieceExport {
  pieceId: string;
  label: string;
  room: string;
  dimensions: {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };
  material: {
    name: string;
    fabricationCategory: string;
  };
  edges: {
    top: { profile: string; isFinished: boolean };
    bottom: { profile: string; isFinished: boolean };
    left: { profile: string; isFinished: boolean };
    right: { profile: string; isFinished: boolean };
  };
  cutouts: Array<{
    type: string;
    quantity: number;
  }>;
  machineAssignments: {
    initialCut: { machineId: string; machineName: string; kerfMm: number };
    edgePolishing: { machineId: string; machineName: string } | null;
    mitring: { machineId: string; machineName: string; kerfMm: number } | null;
    lamination: { machineId: string; machineName: string } | null;
    cutouts: { machineId: string; machineName: string; kerfMm: number } | null;
  };
  isOversize: boolean;
  joinDetails: {
    joinCount: number;
    joinLengthMm: number;
  } | null;
  laminationStrips: Array<{
    widthMm: number;
    lengthMm: number;
    type: 'MITRE' | 'STANDARD';
  }>;
}

export interface ManufacturingExport {
  quoteId: string;
  quoteNumber: string;
  exportedAt: string; // ISO date
  material: {
    name: string;
    fabricationCategory: string;
    slabDimensions: { lengthMm: number; widthMm: number };
  };
  slabCount: number;
  pieces: ManufacturingPieceExport[];
  summary: {
    totalPieces: number;
    totalCutLm: number;
    totalPolishLm: number;
    totalMitreLm: number;
    totalCutouts: number;
    oversizePieces: number;
    totalJoins: number;
  };
}
