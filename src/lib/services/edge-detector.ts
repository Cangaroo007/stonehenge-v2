import {
  ExtractedPiece,
  ExtractedEdge,
  DocumentCategory,
  EdgeFinish,
  EdgeProfileType,
  ConfidenceLevel,
  DetectedEdge,
  EdgeDetectionResult,
  EdgeNotationMap,
} from '@/lib/types/drawing-analysis';

// ──── Northcoast Stone Notation Map ────
// This will become tenant-configurable in future. For now, hardcode Northcoast's system.

const NORTHCOAST_NOTATION_MAP: EdgeNotationMap = {
  'X': {
    finish: 'POLISHED_20MM',
    description: 'Standard 20mm polished edge',
  },
  '//': {
    finish: 'POLISHED_20MM',
    description: 'Alternative notation for 20mm polished edge',
  },
  '○': {
    finish: 'POLISHED_40MM',
    description: '40mm polished edge (laminated build-up)',
  },
  'O': {
    finish: 'POLISHED_40MM',
    description: '40mm polished edge — circle notation (variant)',
  },
  'PR': {
    finish: 'POLISHED_20MM',
    profileType: 'PENCIL_ROUND',
    description: 'Pencil Round edge profile',
  },
  'BN': {
    finish: 'POLISHED_20MM',
    profileType: 'BULLNOSE',
    description: 'Bullnose edge profile',
  },
  'BULLNOSE': {
    finish: 'POLISHED_20MM',
    profileType: 'BULLNOSE',
    description: 'Bullnose edge profile (full text)',
  },
  'PENCIL': {
    finish: 'POLISHED_20MM',
    profileType: 'PENCIL_ROUND',
    description: 'Pencil Round edge profile (partial text)',
  },
  'PENCIL ROUND': {
    finish: 'POLISHED_20MM',
    profileType: 'PENCIL_ROUND',
    description: 'Pencil Round edge profile (full text)',
  },
  'OGEE': {
    finish: 'POLISHED_20MM',
    profileType: 'OGEE',
    description: 'Ogee decorative edge profile',
  },
  'BEVEL': {
    finish: 'POLISHED_20MM',
    profileType: 'BEVELED',
    description: 'Beveled edge profile',
  },
  'BEVELED': {
    finish: 'POLISHED_20MM',
    profileType: 'BEVELED',
    description: 'Beveled edge profile (full text)',
  },
  'RAW': {
    finish: 'RAW',
    description: 'Unfinished edge — against wall or concealed',
  },
  '': {
    finish: 'ARRIS',
    description: 'No notation — assumed arris (Northcoast default)',
  },
};

/**
 * Get the notation map for a tenant.
 * Currently returns Northcoast Stone's map.
 * Future: load from database per tenantId.
 */
export function getNotationMap(_tenantId?: string): EdgeNotationMap {
  // TODO: Load tenant-specific notation from database
  return NORTHCOAST_NOTATION_MAP;
}

type EdgeSide = DetectedEdge['side'];

/**
 * Detect edges from an extracted piece's edge data.
 * Maps notation symbols to edge finishes and profiles.
 * Flags low-confidence or unknown edges for manual review.
 */
export function detectEdgesFromPiece(
  piece: ExtractedPiece,
  documentCategory: DocumentCategory,
  notationMap?: EdgeNotationMap
): EdgeDetectionResult {
  const map = notationMap ?? NORTHCOAST_NOTATION_MAP;
  const edges: DetectedEdge[] = piece.edges.map((edge) =>
    resolveEdge(edge, documentCategory, map)
  );

  // If piece has fewer than 4 edges defined, fill missing sides as RAW with LOW confidence
  const definedSides = new Set(edges.map((e) => e.side));
  const allSides: EdgeSide[] = [
    'TOP',
    'BOTTOM',
    'LEFT',
    'RIGHT',
  ];

  // Also consider FRONT as TOP and BACK as BOTTOM for side coverage
  const hasFrontBack = edges.some((e) => e.side === 'FRONT' || e.side === 'BACK');
  if (!hasFrontBack) {
    for (const side of allSides) {
      if (!definedSides.has(side)) {
        edges.push({
          side,
          finish: 'ARRIS',
          profileType: 'ARRIS',
          confidence: 'LOW',
          needsReview: true,
          reviewReason: `No edge data provided for ${side} side — assumed Arris`,
        });
      }
    }
  }

  const overallConfidence = calculateOverallConfidence(edges);

  return {
    pieceId: piece.id,
    edges,
    overallConfidence,
    notationSystem: 'NORTHCOAST_STANDARD',
  };
}

/**
 * Process a batch of extracted pieces and detect all edges.
 */
export function detectEdgesForAllPieces(
  pieces: ExtractedPiece[],
  documentCategory: DocumentCategory,
  notationMap?: EdgeNotationMap
): EdgeDetectionResult[] {
  return pieces.map((piece) =>
    detectEdgesFromPiece(piece, documentCategory, notationMap)
  );
}

/**
 * Resolve a single extracted edge to a detected edge with notation mapping.
 */
function resolveEdge(
  edge: ExtractedEdge,
  documentCategory: DocumentCategory,
  notationMap: EdgeNotationMap
): DetectedEdge {
  // If the extraction already provided a clear finish (not UNKNOWN), trust it
  if (edge.finish !== 'UNKNOWN' && edge.confidence !== 'LOW') {
    return {
      side: edge.side,
      finish: edge.finish,
      profileType: inferProfileFromFinish(edge.finish),
      confidence: edge.confidence,
      needsReview: false,
    };
  }

  // Try to match notation from the extraction's notation field
  const rawNotation = edge.notation;

  if (rawNotation) {
    const normalised = rawNotation.trim().toUpperCase();
    const match = notationMap[rawNotation] ?? notationMap[normalised];

    if (match) {
      return {
        side: edge.side,
        finish: match.finish,
        profileType: match.profileType ?? inferProfileFromFinish(match.finish),
        confidence: edge.confidence === 'LOW' ? 'MEDIUM' : edge.confidence,
        notation: rawNotation,
        needsReview: false,
      };
    }
  }

  // Apply document-type-specific defaults
  const defaultResult = applyDocumentTypeDefaults(edge, documentCategory);

  return {
    ...defaultResult,
    needsReview: defaultResult.finish === 'UNKNOWN' || defaultResult.confidence === 'LOW',
    reviewReason:
      defaultResult.finish === 'UNKNOWN'
        ? `Could not determine edge finish for ${edge.side} side`
        : `Low confidence detection on ${edge.side} side`,
  };
}

/**
 * Infer a default profile type from the finish.
 * Pencil Round is the most common default for polished edges.
 */
function inferProfileFromFinish(finish: EdgeFinish): EdgeProfileType {
  switch (finish) {
    case 'POLISHED_20MM':
    case 'POLISHED_40MM':
      return 'PENCIL_ROUND';
    case 'BULLNOSE':
      return 'BULLNOSE';
    case 'PENCIL_ROUND':
      return 'PENCIL_ROUND';
    case 'BEVELLED':
      return 'BEVELED';
    case 'ARRIS':
      return 'ARRIS';
    case 'RAW':
    case 'UNKNOWN':
      return 'NONE';
    default:
      return 'NONE';
  }
}

/**
 * Apply document-type-specific defaults for ambiguous edges.
 *
 * Job sheets: most structured, trust markings more
 * Hand-drawn: less reliable, flag more for review
 * CAD: formal notation, generally reliable
 * Elevation: stone cladding faces — exposed edges are polished, wall-abutting are raw
 */
function applyDocumentTypeDefaults(
  edge: ExtractedEdge,
  documentCategory: DocumentCategory
): DetectedEdge {
  const base: DetectedEdge = {
    side: edge.side,
    finish: edge.finish,
    profileType: inferProfileFromFinish(edge.finish),
    confidence: edge.confidence,
    needsReview: false,
  };

  switch (documentCategory) {
    case 'JOB_SHEET':
      // Job sheets are structured — if no marking, default to Arris
      if (edge.finish === 'UNKNOWN') {
        return {
          ...base,
          finish: 'ARRIS',
          profileType: 'ARRIS',
          confidence: 'MEDIUM',
          reviewReason: 'No edge marking on job sheet — assumed Arris',
        };
      }
      return base;

    case 'HAND_DRAWN':
      // Hand-drawn is less reliable — flag everything that isn't clearly marked
      if (edge.finish === 'UNKNOWN') {
        return {
          ...base,
          finish: 'ARRIS',
          profileType: 'ARRIS',
          confidence: 'LOW',
          needsReview: true,
          reviewReason: 'No edge marking on hand-drawn sketch — needs confirmation',
        };
      }
      return { ...base, needsReview: edge.confidence === 'LOW' };

    case 'CAD_DRAWING':
      // CAD is formal — trust the notation system
      if (edge.finish === 'UNKNOWN') {
        return {
          ...base,
          finish: 'ARRIS',
          profileType: 'ARRIS',
          confidence: 'MEDIUM',
          reviewReason: 'No edge notation in CAD drawing — assumed Arris',
        };
      }
      return base;

    case 'ELEVATION':
      // Elevation drawings: exposed/visible edges polished, concealed edges arris
      if (edge.finish === 'UNKNOWN') {
        return {
          ...base,
          finish: 'ARRIS',
          profileType: 'ARRIS',
          confidence: 'LOW',
          needsReview: true,
          reviewReason: 'Edge finish unclear on elevation — needs confirmation',
        };
      }
      return base;

    default:
      return { ...base, needsReview: edge.finish === 'UNKNOWN' };
  }
}

/**
 * Calculate overall confidence from individual edge confidences.
 */
function calculateOverallConfidence(edges: DetectedEdge[]): ConfidenceLevel {
  if (edges.length === 0) return 'LOW';

  const lowCount = edges.filter((e) => e.confidence === 'LOW').length;
  const unknownCount = edges.filter((e) => e.finish === 'UNKNOWN').length;

  if (unknownCount > 0 || lowCount >= 2) return 'LOW';
  if (lowCount === 1 || edges.some((e) => e.needsReview)) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Get edges that need manual review.
 */
export function getEdgesNeedingReview(
  results: EdgeDetectionResult[]
): Array<{ pieceId: string; edge: DetectedEdge }> {
  const reviewItems: Array<{ pieceId: string; edge: DetectedEdge }> = [];
  for (const result of results) {
    for (const edge of result.edges) {
      if (edge.needsReview) {
        reviewItems.push({ pieceId: result.pieceId, edge });
      }
    }
  }
  return reviewItems;
}
