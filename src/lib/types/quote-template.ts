/**
 * Quote Template Section Configuration
 *
 * Controls which sections appear in the generated PDF and in what order.
 * Used by the PDF renderer to conditionally render sections.
 */

export interface QuoteTemplateSections {
  // Cover page
  coverPage: boolean;
  companyLogo: boolean;
  customerDetails: boolean;
  projectReference: boolean;
  introductionText: boolean;

  // Quote body
  roomBreakdown: boolean;
  pieceDetails: boolean;       // COMPREHENSIVE only
  pieceDimensions: boolean;    // COMPREHENSIVE only
  edgeProfiles: boolean;       // COMPREHENSIVE only
  cutoutDetails: boolean;      // COMPREHENSIVE only
  perPiecePricing: boolean;    // some tenants hide per-piece costs
  roomSubtotals: boolean;

  // Cost breakdown
  fabricationBreakdown: boolean; // COMPREHENSIVE only
  materialCosts: boolean;
  materialNames: boolean;        // show material names even in summary
  deliveryLine: boolean;
  installationLine: boolean;
  templatingLine: boolean;       // only if templating applies

  // Optimiser / manufacturing
  slabSummary: boolean;          // technical info for builders
  machineOperations: boolean;    // very technical

  // Totals
  subtotalExGst: boolean;
  gstLine: boolean;
  grandTotal: boolean;
  volumeDiscount: boolean;       // only shows if applicable

  // Footer
  termsAndConditions: boolean;
  validityPeriod: boolean;
  signatureBlock: boolean;
  depositRequirement: boolean;

  // Section order (optional — for future drag-and-drop reordering)
  sectionOrder?: string[];
}

export type QuoteFormatType = 'COMPREHENSIVE' | 'SUMMARY';

/**
 * Returns the default sections configuration for a given format type.
 *
 * COMPREHENSIVE: All sections enabled (detailed per-piece breakdown)
 * SUMMARY: Room totals only, no piece details or technical sections
 */
export function getDefaultSectionsConfig(formatType: QuoteFormatType): QuoteTemplateSections {
  const base: QuoteTemplateSections = {
    // Cover page
    coverPage: true,
    companyLogo: true,
    customerDetails: true,
    projectReference: true,
    introductionText: true,

    // Quote body
    roomBreakdown: true,
    pieceDetails: true,
    pieceDimensions: true,
    edgeProfiles: true,
    cutoutDetails: true,
    perPiecePricing: false,
    roomSubtotals: true,

    // Cost breakdown
    fabricationBreakdown: true,
    materialCosts: true,
    materialNames: true,
    deliveryLine: true,
    installationLine: true,
    templatingLine: false,

    // Optimiser / manufacturing
    slabSummary: false,
    machineOperations: false,

    // Totals
    subtotalExGst: true,
    gstLine: true,
    grandTotal: true,
    volumeDiscount: true,

    // Footer
    termsAndConditions: true,
    validityPeriod: true,
    signatureBlock: true,
    depositRequirement: true,
  };

  if (formatType === 'SUMMARY') {
    return {
      ...base,
      pieceDetails: false,
      pieceDimensions: false,
      edgeProfiles: false,
      cutoutDetails: false,
      perPiecePricing: false,
      fabricationBreakdown: false,
      slabSummary: false,
      machineOperations: false,
    };
  }

  return base;
}

/**
 * Section group definitions for the template editor UI.
 * Groups sections into logical categories with display labels.
 */
export const SECTION_GROUPS = [
  {
    key: 'coverPage' as const,
    label: 'Cover Page',
    sections: [
      { key: 'companyLogo', label: 'Company logo' },
      { key: 'customerDetails', label: 'Customer details' },
      { key: 'projectReference', label: 'Project reference' },
      { key: 'introductionText', label: 'Introduction text' },
    ],
  },
  {
    key: 'quoteDetail' as const,
    label: 'Quote Detail',
    sections: [
      { key: 'roomBreakdown', label: 'Room breakdown' },
      { key: 'pieceDetails', label: 'Individual piece details', comprehensiveOnly: true },
      { key: 'pieceDimensions', label: 'Piece dimensions', comprehensiveOnly: true },
      { key: 'edgeProfiles', label: 'Edge profiles', comprehensiveOnly: true },
      { key: 'cutoutDetails', label: 'Cutout details', comprehensiveOnly: true },
      { key: 'perPiecePricing', label: 'Per-piece pricing' },
      { key: 'roomSubtotals', label: 'Room subtotals' },
    ],
  },
  {
    key: 'costs' as const,
    label: 'Costs',
    sections: [
      { key: 'fabricationBreakdown', label: 'Fabrication breakdown', comprehensiveOnly: true },
      { key: 'materialCosts', label: 'Material costs' },
      { key: 'materialNames', label: 'Material names' },
      { key: 'deliveryLine', label: 'Delivery' },
      { key: 'installationLine', label: 'Installation' },
      { key: 'templatingLine', label: 'Templating' },
    ],
  },
  {
    key: 'technical' as const,
    label: 'Technical',
    collapsed: true,
    sections: [
      { key: 'slabSummary', label: 'Slab optimiser summary', comprehensiveOnly: true },
      { key: 'machineOperations', label: 'Machine operations', comprehensiveOnly: true },
    ],
  },
  {
    key: 'totals' as const,
    label: 'Totals',
    sections: [
      { key: 'subtotalExGst', label: 'Subtotal (ex GST)' },
      { key: 'gstLine', label: 'GST' },
      { key: 'grandTotal', label: 'Grand total' },
      { key: 'volumeDiscount', label: 'Volume discount (if applicable)' },
    ],
  },
  {
    key: 'footer' as const,
    label: 'Footer',
    sections: [
      { key: 'termsAndConditions', label: 'Terms & conditions' },
      { key: 'validityPeriod', label: 'Validity period' },
      { key: 'signatureBlock', label: 'Signature block' },
      { key: 'depositRequirement', label: 'Deposit requirement' },
    ],
  },
] as const;
