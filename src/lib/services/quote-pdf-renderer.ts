/**
 * PDF Renderer using @react-pdf/renderer
 *
 * Uses React.createElement (NOT JSX — this is a server-only .ts file).
 * Renders an A4 PDF matching the Northcoast Accrual output format.
 */

import React from 'react';
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { QuotePdfData, QuotePdfRoom, QuotePdfPiece } from './quote-pdf-service';

// ── Template Settings Interface ──────────────────────────────────────────────

export interface PdfTemplateSettings {
  // Header
  companyName: string;
  companyAbn: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyAddress: string | null;

  // Display settings
  showPieceBreakdown: boolean;
  showEdgeDetails: boolean;
  showCutoutDetails: boolean;
  showMaterialPerPiece: boolean;
  showRoomTotals: boolean;
  showItemisedBreakdown: boolean;
  showPieceDescriptions: boolean;

  // Pricing display
  pricingMode: 'room_total' | 'itemised' | 'total_only';
  showGst: boolean;
  gstLabel: string;
  currencySymbol: string;

  // Footer
  termsAndConditions: string | null;
  validityDays: number;
  footerText: string | null;
}

// ── Default Settings (Northcoast format) ─────────────────────────────────────

export const DEFAULT_TEMPLATE_SETTINGS: PdfTemplateSettings = {
  companyName: 'Northcoast Stone Pty Ltd',
  companyAbn: '57 120 880 355',
  companyPhone: '07 5476 7636',
  companyEmail: 'admin@northcoaststone.com.au',
  companyAddress: '20 Hitech Drive, Kunda Park QLD 4556',

  showPieceBreakdown: true,
  showEdgeDetails: true,
  showCutoutDetails: true,
  showMaterialPerPiece: false,
  showRoomTotals: true,
  showItemisedBreakdown: false,
  showPieceDescriptions: true,

  pricingMode: 'room_total',
  showGst: true,
  gstLabel: 'GST (10%)',
  currencySymbol: '$',

  termsAndConditions: null,
  validityDays: 30,
  footerText: null,
};

// ── Styles ───────────────────────────────────────────────────────────────────

const BLUE = '#2563eb';
const DARK_GRAY = '#374151';
const GRAY = '#6b7280';
const LIGHT_GRAY = '#f3f4f6';
const BORDER_GRAY = '#e5e7eb';

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 9,
    paddingTop: 40,
    paddingBottom: 60,
    paddingHorizontal: 40,
    color: DARK_GRAY,
  },
  // ── Header ──
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  companyName: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
  },
  companyDetail: {
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
  },
  accentLine: {
    height: 2,
    backgroundColor: BLUE,
    marginTop: 8,
    marginBottom: 16,
  },
  // ── Quote Info ──
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  infoColumn: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 7,
    color: GRAY,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 10,
    color: DARK_GRAY,
    marginBottom: 6,
  },
  infoValueBold: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    marginBottom: 6,
  },
  // ── Room Section ──
  roomHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: LIGHT_GRAY,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 2,
  },
  roomName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
  },
  roomTotal: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
  },
  // ── Piece Row ──
  pieceRow: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderBottomWidth: 0.5,
    borderBottomColor: BORDER_GRAY,
  },
  pieceTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  pieceName: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    flex: 1,
  },
  pieceDimensions: {
    fontSize: 9,
    color: DARK_GRAY,
    marginLeft: 4,
  },
  piecePrice: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    textAlign: 'right' as const,
    minWidth: 70,
  },
  pieceDetail: {
    fontSize: 8,
    color: GRAY,
    marginTop: 2,
    paddingLeft: 2,
  },
  // ── Charges Section ──
  chargesSection: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: BORDER_GRAY,
  },
  chargeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  chargeLabel: {
    fontSize: 9,
    color: DARK_GRAY,
  },
  chargeValue: {
    fontSize: 9,
    color: DARK_GRAY,
    textAlign: 'right' as const,
    minWidth: 70,
  },
  // ── Totals ──
  totalsSection: {
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1.5,
    borderTopColor: DARK_GRAY,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  totalLabel: {
    fontSize: 10,
    color: DARK_GRAY,
  },
  totalValue: {
    fontSize: 10,
    color: DARK_GRAY,
    textAlign: 'right' as const,
    minWidth: 80,
  },
  grandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 4,
    backgroundColor: LIGHT_GRAY,
    borderRadius: 2,
  },
  grandTotalLabel: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
  },
  grandTotalValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    textAlign: 'right' as const,
  },
  // ── Terms & Conditions ──
  termsSection: {
    marginTop: 20,
    paddingTop: 10,
    borderTopWidth: 0.5,
    borderTopColor: BORDER_GRAY,
  },
  termsTitle: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: GRAY,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  termsText: {
    fontSize: 7,
    color: GRAY,
    lineHeight: 1.4,
  },
  // ── Footer ──
  footer: {
    position: 'absolute' as const,
    bottom: 25,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderTopWidth: 0.5,
    borderTopColor: BORDER_GRAY,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: GRAY,
  },
  pageNumber: {
    fontSize: 7,
    color: GRAY,
  },
});

// ── Currency Formatting ──────────────────────────────────────────────────────

function fmtCurrency(amount: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(amount);
}

// ── Element Helper ───────────────────────────────────────────────────────────
// Shorthand for React.createElement to reduce verbosity
const h = React.createElement;

// ── Component Builders ───────────────────────────────────────────────────────

function buildHeader(settings: PdfTemplateSettings) {
  return h(View, { key: 'header' },
    h(View, { style: styles.headerRow },
      h(View, null,
        h(Text, { style: styles.companyName }, settings.companyName),
        settings.companyAbn
          ? h(Text, { style: styles.companyDetail }, `ABN: ${settings.companyAbn}`)
          : null,
        settings.companyAddress
          ? h(Text, { style: styles.companyDetail }, settings.companyAddress)
          : null,
      ),
      h(View, { style: { alignItems: 'flex-end' as const } },
        settings.companyPhone
          ? h(Text, { style: styles.companyDetail }, `Ph: ${settings.companyPhone}`)
          : null,
        settings.companyEmail
          ? h(Text, { style: styles.companyDetail }, settings.companyEmail)
          : null,
      ),
    ),
    h(View, { style: styles.accentLine }),
  );
}

function buildQuoteInfo(data: QuotePdfData) {
  const customerName = data.customer?.name || '';
  const customerCompany = data.customer?.company || '';
  const contactName = data.contact
    ? `${data.contact.firstName} ${data.contact.lastName}`.trim()
    : '';

  return h(View, { key: 'quote-info', style: styles.infoRow },
    // Left column: quote details
    h(View, { style: styles.infoColumn },
      h(Text, { style: styles.infoLabel }, 'QUOTE NUMBER'),
      h(Text, { style: styles.infoValueBold }, data.quoteNumber),
      h(Text, { style: styles.infoLabel }, 'DATE'),
      h(Text, { style: styles.infoValue }, data.quoteDate),
      data.validUntil
        ? h(View, null,
            h(Text, { style: styles.infoLabel }, 'VALID UNTIL'),
            h(Text, { style: styles.infoValue }, data.validUntil),
          )
        : null,
    ),
    // Middle column: customer & contact
    h(View, { style: styles.infoColumn },
      h(Text, { style: styles.infoLabel }, 'CUSTOMER'),
      h(Text, { style: styles.infoValueBold }, customerName || 'N/A'),
      customerCompany
        ? h(Text, { style: styles.infoValue }, customerCompany)
        : null,
      contactName
        ? h(View, null,
            h(Text, { style: styles.infoLabel }, 'CONTACT'),
            h(Text, { style: styles.infoValue }, contactName),
          )
        : null,
    ),
    // Right column: project & material
    h(View, { style: styles.infoColumn },
      data.projectAddress
        ? h(View, null,
            h(Text, { style: styles.infoLabel }, 'JOB ADDRESS'),
            h(Text, { style: styles.infoValue }, data.projectAddress),
          )
        : null,
      data.materialName
        ? h(View, null,
            h(Text, { style: styles.infoLabel }, 'MATERIAL'),
            h(Text, { style: styles.infoValue }, data.materialName),
          )
        : null,
    ),
  );
}

function buildPieceRow(
  piece: QuotePdfPiece,
  settings: PdfTemplateSettings,
  showPrice: boolean,
): React.ReactElement {
  const dimensions = `${piece.lengthMm} × ${piece.widthMm}mm`;
  const details: string[] = [];

  if (settings.showPieceDescriptions && piece.description) {
    details.push(piece.description);
  }
  if (settings.showEdgeDetails && piece.edgeSummary) {
    details.push(`Edges: ${piece.edgeSummary}`);
  }
  if (settings.showCutoutDetails && piece.cutoutSummary) {
    details.push(`Cutouts: ${piece.cutoutSummary}`);
  }
  if (settings.showMaterialPerPiece && piece.materialName) {
    details.push(`Material: ${piece.materialName}`);
  }

  return h(View, { style: styles.pieceRow, key: `piece-${piece.id}` },
    h(View, { style: styles.pieceTopRow },
      h(Text, { style: styles.pieceName },
        `${piece.name}`,
      ),
      h(Text, { style: styles.pieceDimensions }, dimensions),
      showPrice
        ? h(Text, { style: styles.piecePrice }, fmtCurrency(piece.pricing.pieceTotal))
        : null,
    ),
    ...details.map((detail, i) =>
      h(Text, { style: styles.pieceDetail, key: `detail-${piece.id}-${i}` }, detail),
    ),
  );
}

function buildRoomSection(
  room: QuotePdfRoom,
  settings: PdfTemplateSettings,
): React.ReactElement {
  const showPiecePrice = settings.pricingMode === 'itemised';
  const showRoomTotal = settings.showRoomTotals && settings.pricingMode !== 'total_only';

  return h(View, { key: `room-${room.id}`, wrap: false },
    // Room header bar
    h(View, { style: styles.roomHeader },
      h(Text, { style: styles.roomName }, room.name),
      showRoomTotal
        ? h(Text, { style: styles.roomTotal }, fmtCurrency(room.roomTotal))
        : null,
    ),
    // Pieces
    settings.showPieceBreakdown
      ? room.pieces.map(piece => buildPieceRow(piece, settings, showPiecePrice))
      : null,
  );
}

function buildCharges(data: QuotePdfData): React.ReactElement | null {
  const { delivery, templating, installation } = data.charges;
  const hasCharges = delivery > 0 || templating > 0 || installation > 0;

  if (!hasCharges) return null;

  const rows: React.ReactElement[] = [];

  if (delivery > 0) {
    rows.push(
      h(View, { style: styles.chargeRow, key: 'charge-delivery' },
        h(Text, { style: styles.chargeLabel }, 'Delivery'),
        h(Text, { style: styles.chargeValue }, fmtCurrency(delivery)),
      )
    );
  }

  if (templating > 0) {
    rows.push(
      h(View, { style: styles.chargeRow, key: 'charge-templating' },
        h(Text, { style: styles.chargeLabel }, 'Templating'),
        h(Text, { style: styles.chargeValue }, fmtCurrency(templating)),
      )
    );
  }

  if (installation > 0) {
    rows.push(
      h(View, { style: styles.chargeRow, key: 'charge-installation' },
        h(Text, { style: styles.chargeLabel }, 'Installation'),
        h(Text, { style: styles.chargeValue }, fmtCurrency(installation)),
      )
    );
  }

  return h(View, { style: styles.chargesSection, key: 'charges' }, ...rows);
}

function buildTotals(
  data: QuotePdfData,
  settings: PdfTemplateSettings,
): React.ReactElement {
  return h(View, { style: styles.totalsSection, key: 'totals' },
    // Subtotal ex GST
    h(View, { style: styles.totalRow },
      h(Text, { style: styles.totalLabel }, 'Subtotal (excl. GST)'),
      h(Text, { style: styles.totalValue }, fmtCurrency(data.subtotalExGst)),
    ),
    // GST
    settings.showGst
      ? h(View, { style: styles.totalRow },
          h(Text, { style: styles.totalLabel }, settings.gstLabel),
          h(Text, { style: styles.totalValue }, fmtCurrency(data.gstAmount)),
        )
      : null,
    // Grand total
    h(View, { style: styles.grandTotalRow },
      h(Text, { style: styles.grandTotalLabel }, 'Total (incl. GST)'),
      h(Text, { style: styles.grandTotalValue }, fmtCurrency(data.totalIncGst)),
    ),
  );
}

function buildTerms(settings: PdfTemplateSettings): React.ReactElement | null {
  if (!settings.termsAndConditions) return null;

  return h(View, { style: styles.termsSection, key: 'terms' },
    h(Text, { style: styles.termsTitle }, 'Terms & Conditions'),
    h(Text, { style: styles.termsText }, settings.termsAndConditions),
  );
}

function buildPageFooter(settings: PdfTemplateSettings) {
  return h(View, { style: styles.footer, fixed: true, key: 'footer' },
    h(Text, { style: styles.footerText },
      settings.footerText || `${settings.companyName} | ${settings.companyPhone || ''}`,
    ),
    h(Text, {
      style: styles.pageNumber,
      render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
        `Page ${pageNumber} of ${totalPages}`,
    }),
  );
}

// ── Main Render Function ─────────────────────────────────────────────────────

export async function renderQuotePdf(
  data: QuotePdfData,
  templateSettings?: Partial<PdfTemplateSettings>,
): Promise<Buffer> {
  const settings: PdfTemplateSettings = {
    ...DEFAULT_TEMPLATE_SETTINGS,
    ...templateSettings,
  };

  // Build the document tree
  const doc = h(Document, {
    title: `Quote ${data.quoteNumber}`,
    author: settings.companyName,
    subject: `Quote for ${data.customer?.name || 'Customer'}`,
  },
    h(Page, { size: 'A4', style: styles.page, wrap: true },
      // Company header
      buildHeader(settings),

      // Quote info (number, date, customer, job address, material)
      buildQuoteInfo(data),

      // Room sections
      ...data.rooms.map(room => buildRoomSection(room, settings)),

      // Quote-level charges (delivery, templating, installation)
      buildCharges(data),

      // Totals (subtotal, GST, grand total)
      buildTotals(data, settings),

      // Terms & conditions
      buildTerms(settings),

      // Page numbers footer
      buildPageFooter(settings),
    ),
  );

  const buffer = await renderToBuffer(doc);
  return Buffer.from(buffer);
}
