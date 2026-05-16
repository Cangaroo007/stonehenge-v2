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
  Image,
  StyleSheet,
  Font,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { QuotePdfData, QuotePdfRoom, QuotePdfPiece } from './quote-pdf-service';
import type { QuoteTemplateSections } from '@/lib/types/quote-template';
import { getDefaultSectionsConfig } from '@/lib/types/quote-template';

// ── Template Settings Interface ──────────────────────────────────────────────

export interface PdfTemplateSettings {
  // Header
  companyName: string;
  companyAbn: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  companyAddress: string | null;
  /** Logo image URL (R2 public URL or external) — rendered on cover page when set. */
  companyLogoUrl: string | null;

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

  // Signoff (cover page "Yours Sincerely" block — sourced from companies.signature_name/title)
  signoffName: string | null;
  signoffTitle: string | null;
}

// ── Default Settings (Northcoast format) ─────────────────────────────────────

export const DEFAULT_TEMPLATE_SETTINGS: PdfTemplateSettings = {
  companyName: 'Northcoast Stone Pty Ltd',
  companyAbn: '57 120 880 355',
  companyPhone: '07 5476 7636',
  companyEmail: 'admin@northcoaststone.com.au',
  companyAddress: '20 Hitech Drive, Kunda Park QLD 4556',
  companyLogoUrl: null,

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

  signoffName: null,
  signoffTitle: null,
};

// ── Styles ───────────────────────────────────────────────────────────────────

const BLUE = '#1B3A6B';
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
  // ── Breakdown header (NCS Q22338: "{Project} Breakdown" + column row) ──
  breakdownTitle: {
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    marginTop: 8,
    marginBottom: 10,
  },
  breakdownColRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: BORDER_GRAY,
    paddingBottom: 4,
    marginBottom: 4,
  },
  breakdownColLabel: {
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
    color: GRAY,
    textTransform: 'uppercase' as const,
    letterSpacing: 0.5,
  },
  breakdownColName: { flex: 3 },
  breakdownColUnit: { flex: 1, textAlign: 'right' as const },
  breakdownColQty: { flex: 1, textAlign: 'right' as const },
  breakdownColCost: { flex: 1, textAlign: 'right' as const },
  // ── Room Section (NCS Q22338 description-style block) ──
  roomBlock: {
    marginTop: 14,
    marginBottom: 6,
  },
  roomTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  roomTitle: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    flex: 1,
  },
  roomBlockPrice: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    textAlign: 'right' as const,
    minWidth: 80,
  },
  roomDescLabel: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    marginTop: 2,
    marginBottom: 2,
  },
  roomDescLine: {
    fontSize: 9,
    color: DARK_GRAY,
    marginBottom: 1,
  },
  roomBullet: {
    fontSize: 9,
    color: DARK_GRAY,
    marginBottom: 1,
    paddingLeft: 8,
  },
  roomMaterial: {
    fontSize: 9,
    color: DARK_GRAY,
    fontStyle: 'italic' as const,
    marginTop: 4,
    marginBottom: 4,
  },
  roomPriceLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    fontSize: 8,
    color: DARK_GRAY,
    marginTop: 2,
  },
  roomPriceLabel: {
    flex: 1,
    color: DARK_GRAY,
  },
  roomPriceValue: {
    minWidth: 72,
    textAlign: 'right' as const,
  },
  roomCalcLine: {
    fontSize: 7,
    color: GRAY,
    marginLeft: 10,
    marginBottom: 1,
  },
  roomBlockDivider: {
    height: 0.5,
    backgroundColor: BORDER_GRAY,
    marginTop: 4,
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
  // ── Cover Page ──
  coverHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  coverHeaderLeft: {
    flex: 1,
  },
  coverHeaderRight: {
    width: 180,
    alignItems: 'flex-end' as const,
  },
  coverCompanyName: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: BLUE,
    marginBottom: 4,
  },
  coverCompanyDetail: {
    fontSize: 9,
    color: DARK_GRAY,
    marginTop: 1,
  },
  coverLogo: {
    maxWidth: 170,
    maxHeight: 90,
    objectFit: 'contain' as const,
  },
  coverDivider: {
    height: 1,
    backgroundColor: BORDER_GRAY,
    marginTop: 12,
    marginBottom: 18,
  },
  coverQuoteTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 4,
  },
  coverQuoteTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    flex: 1,
  },
  coverQuoteDate: {
    fontSize: 10,
    color: DARK_GRAY,
  },
  coverRevision: {
    fontSize: 10,
    color: GRAY,
    marginBottom: 14,
  },
  coverForLine: {
    fontSize: 10,
    color: DARK_GRAY,
    marginBottom: 14,
  },
  coverForLabel: {
    fontFamily: 'Helvetica-Bold',
  },
  coverPara: {
    fontSize: 9,
    color: DARK_GRAY,
    lineHeight: 1.4,
    marginBottom: 8,
  },
  coverNoteHeader: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    marginTop: 6,
    marginBottom: 4,
    textDecoration: 'underline' as const,
  },
  coverNoteBullet: {
    fontSize: 9,
    color: DARK_GRAY,
    lineHeight: 1.4,
    paddingLeft: 12,
    marginBottom: 14,
  },
  coverCostBlock: {
    marginTop: 8,
    marginBottom: 16,
  },
  coverCostRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 3,
  },
  coverCostLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    width: 180,
  },
  coverCostValue: {
    fontSize: 10,
    color: DARK_GRAY,
    textAlign: 'right' as const,
    minWidth: 90,
  },
  coverGrandTotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 4,
    paddingTop: 4,
    borderTopWidth: 0.5,
    borderTopColor: BORDER_GRAY,
  },
  coverGrandTotalLabel: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    width: 180,
  },
  coverGrandTotalValue: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    color: '#111827',
    textAlign: 'right' as const,
    minWidth: 90,
  },
  coverTermsPara: {
    fontSize: 8,
    color: GRAY,
    lineHeight: 1.4,
    marginBottom: 8,
  },
  coverSignoffBlock: {
    marginTop: 28,
  },
  coverSignoffLine: {
    fontSize: 10,
    color: DARK_GRAY,
    marginBottom: 4,
  },
  coverSignoffName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    color: DARK_GRAY,
    marginTop: 18,
  },
  coverSignoffTitle: {
    fontSize: 9,
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

/**
 * Page 1 — cover page in NCS Q22338 layout:
 *   company header (left) + logo (right) → quote title + date → "For:" line
 *   → intro paragraphs → PLEASE NOTE → cost summary → terms paragraphs → signoff
 *
 * Boilerplate paragraphs are currently hardcoded to the NCS reference text.
 * TODO: thread `companies.quote_intro_text_1/2/3`, `quote_please_note`, and
 * `quote_terms_text_1/2/3/4` through PdfTemplateSettings so each tenant can
 * override the wording. Schema columns already exist on the `companies` table.
 */
function renderCoverPage(
  data: QuotePdfData,
  settings: PdfTemplateSettings,
): React.ReactElement {
  const customerOrg =
    data.customer?.company || data.customer?.name || 'Customer';
  const projectLabel = data.projectName || data.projectAddress || 'Job';
  const titleLine = data.quoteNumber
    ? `Quote - ${data.quoteNumber} - ${projectLabel}`
    : `Quote (Draft) - ${projectLabel}`;

  // TODO: tenant-configurable via companies.quote_intro_text_1/2/3
  const introParas = [
    `Please see below for our price break down for your quotation as per the plans supplied. Any differences in stonework at measure and fabrication stage will be charged accordingly.`,
    `This quote is for supply, fabrication and local installation of stonework.`,
    `Thank you for the opportunity in submitting this quotation. We look forward to working with you.`,
  ];

  // TODO: tenant-configurable via companies.quote_please_note
  const pleaseNote = `This Quote is based on the proviso that all stonework is the same colour and fabricated and installed at the same time. Any variation from this assumption will require re-quoting.`;

  // TODO: tenant-configurable via companies.quote_terms_text_1/2/3/4
  const termsParas = [
    `Upon acceptance of this quotation you hereby certify that the above information is true and correct. You acknowledge and agree that you have read, understand, and agree to our Terms of Trade, which apply to all of our dealings with you.`,
    `Please read this quote carefully for all details regarding edge thickness, stone colour and work description. We require a 50% deposit and completed purchase order upon acceptance of this quote. Please contact our office${settings.companyEmail ? ` via email ${settings.companyEmail}` : ''} if you wish to proceed.`,
    `This quote is valid for ${settings.validityDays} days, on the exception of being signed off as a job, where it will be valid for a 3-month period.`,
  ];

  return h(Page, { size: 'A4', style: styles.page, key: 'cover', wrap: true },
    // 1. Company header (left) + logo (right)
    h(View, { style: styles.coverHeaderRow },
      h(View, { style: styles.coverHeaderLeft },
        h(Text, { style: styles.coverCompanyName }, settings.companyName),
        settings.companyAbn
          ? h(Text, { style: styles.coverCompanyDetail }, `ABN: ${settings.companyAbn}`)
          : null,
        settings.companyAddress
          ? h(Text, { style: styles.coverCompanyDetail }, settings.companyAddress)
          : null,
        settings.companyPhone
          ? h(Text, { style: styles.coverCompanyDetail }, `Phone: ${settings.companyPhone}`)
          : null,
        settings.companyEmail
          ? h(Text, { style: styles.coverCompanyDetail }, settings.companyEmail)
          : null,
      ),
      h(View, { style: styles.coverHeaderRight },
        settings.companyLogoUrl
          ? h(Image, { style: styles.coverLogo, src: settings.companyLogoUrl })
          : null,
      ),
    ),

    // 2. Divider under header
    h(View, { style: styles.coverDivider }),

    // 3. Quote title + date
    h(View, { style: styles.coverQuoteTitleRow },
      h(Text, { style: styles.coverQuoteTitle }, titleLine),
      h(Text, { style: styles.coverQuoteDate }, `Date: ${data.quoteDate}`),
    ),
    h(Text, { style: styles.coverRevision }, `Revision ${data.revision}`),

    // 4. "For:" line
    h(Text, { style: styles.coverForLine },
      h(Text, { style: styles.coverForLabel }, 'For: '),
      customerOrg,
    ),

    // 5. Intro paragraphs
    ...introParas.map((p, i) =>
      h(Text, { style: styles.coverPara, key: `intro-${i}` }, p),
    ),

    // 6. PLEASE NOTE block
    h(Text, { style: styles.coverNoteHeader }, 'PLEASE NOTE:'),
    h(Text, { style: styles.coverNoteBullet }, `• ${pleaseNote}`),

    // 7. Cost summary (Cost / GST / Total Including GST)
    h(View, { style: styles.coverCostBlock },
      h(View, { style: styles.coverCostRow },
        h(Text, { style: styles.coverCostLabel }, 'Cost:'),
        h(Text, { style: styles.coverCostValue }, fmtCurrency(data.subtotalExGst)),
      ),
      h(View, { style: styles.coverCostRow },
        h(Text, { style: styles.coverCostLabel }, settings.gstLabel.replace(/\s*\([^)]*\)/, '') + ':'),
        h(Text, { style: styles.coverCostValue }, fmtCurrency(data.gstAmount)),
      ),
      h(View, { style: styles.coverGrandTotalRow },
        h(Text, { style: styles.coverGrandTotalLabel }, 'Total Including GST:'),
        h(Text, { style: styles.coverGrandTotalValue }, fmtCurrency(data.totalIncGst)),
      ),
    ),

    // 8-10. Terms paragraphs (acceptance + deposit + validity)
    ...termsParas.map((p, i) =>
      h(Text, { style: styles.coverTermsPara, key: `terms-${i}` }, p),
    ),

    // 11. Signoff block
    h(View, { style: styles.coverSignoffBlock },
      h(Text, { style: styles.coverSignoffLine }, 'Yours Sincerely'),
      settings.signoffName
        ? h(Text, { style: styles.coverSignoffName }, settings.signoffName)
        : null,
      settings.signoffTitle
        ? h(Text, { style: styles.coverSignoffTitle }, settings.signoffTitle)
        : null,
      // Fall back to company name when no individual signoff is configured.
      !settings.signoffName
        ? h(Text, { style: styles.coverSignoffName }, settings.companyName)
        : null,
    ),

    // 12. Page footer (page number + footer text — same as breakdown page)
    buildPageFooter(settings),
  );
}

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
  const displayQuoteNumber = data.quoteNumber || `Q-${data.quoteId}-DRAFT`;
  const customerName = data.customer?.name || '';
  const customerCompany = data.customer?.company || '';
  const contactName = data.contact
    ? `${data.contact.firstName} ${data.contact.lastName}`.trim()
    : '';

  return h(View, { key: 'quote-info', style: styles.infoRow },
    // Left column: quote details
    h(View, { style: styles.infoColumn },
      h(Text, { style: styles.infoLabel }, 'QUOTE NUMBER'),
      h(Text, { style: styles.infoValueBold }, displayQuoteNumber),
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

// ── Breakdown header (NCS Q22338 page 2: project title + column labels) ────

function buildBreakdownHeader(data: QuotePdfData): React.ReactElement {
  const projectLabel = data.projectName || data.quoteNumber || 'Quote';
  return h(View, { key: 'breakdown-header' },
    h(Text, { style: styles.breakdownTitle }, `${projectLabel} Breakdown`),
    h(View, { style: styles.breakdownColRow },
      h(Text, { style: [styles.breakdownColLabel, styles.breakdownColName] }, 'Name'),
      h(Text, { style: [styles.breakdownColLabel, styles.breakdownColUnit] }, 'Unit Cost'),
      h(Text, { style: [styles.breakdownColLabel, styles.breakdownColQty] }, 'Quantity'),
      h(Text, { style: [styles.breakdownColLabel, styles.breakdownColCost] }, 'Cost'),
    ),
  );
}

// ── Room block helpers (NCS Q22338 description-style format) ────────────────

/**
 * Pieces split into "main" (driving the description) and "attachment" (rendered
 * as bullet additionals). Attachments are WATERFALL and SPLASHBACK piece types.
 * If a room is ALL attachments (e.g. a "Splashbacks" room with no benchtop),
 * treat them as main pieces so the room renders something meaningful.
 */
function isMainPiece(p: QuotePdfPiece): boolean {
  const t = (p.pieceType ?? 'BENCHTOP').toUpperCase();
  return t !== 'WATERFALL' && t !== 'SPLASHBACK';
}

/** Bullet label for an attachment piece. */
function attachmentLabel(p: QuotePdfPiece): string {
  const t = (p.pieceType ?? '').toUpperCase();
  if (t === 'WATERFALL') return 'Waterfall End';
  if (t === 'SPLASHBACK') return 'Splashback';
  return 'Attachment';
}

/**
 * Per-piece description lines for the room block.
 *   L/U pieces  → header line ("40mm U-Shaped Benchtops") + part dims ("1 @ L × W").
 *   Rectangles  → single line ("L × W × Tmm Benchtop").
 */
function pieceDescriptionLines(p: QuotePdfPiece): string[] {
  const lines: string[] = [];
  if (p.parts && p.parts.length > 0) {
    const shape = p.parts.length === 3 ? 'U-Shaped Benchtops'
                : p.parts.length === 2 ? 'L-Shaped Benchtop'
                : 'Shaped Benchtop';
    lines.push(`${p.thicknessMm}mm ${shape}`);
    for (const part of p.parts) {
      lines.push(`1 @ ${part.lengthMm} × ${part.widthMm}`);
    }
  } else {
    lines.push(`${p.lengthMm} × ${p.widthMm} × ${p.thicknessMm}mm Benchtop`);
  }
  return lines;
}

function cuttingDetailLabel(item: NonNullable<QuotePdfPiece['pricing']['cuttingItems']>[number]): string {
  const label = item.kind === 'BUILD_UP' ? 'Build-up/mitre cutting' : 'Normal cutting';
  return item.side ? `${label} (${item.side})` : label;
}

function piecePriceLines(p: QuotePdfPiece, detailed: boolean): React.ReactElement[] {
  const rows: React.ReactElement[] = [
    h(View, { style: styles.roomPriceLine, key: `piece-price-${p.id}` },
      h(Text, { style: styles.roomPriceLabel }, p.name || `${p.lengthMm} × ${p.widthMm}`),
      h(Text, { style: styles.roomPriceValue }, fmtCurrency(p.pricing.pieceTotal)),
    ),
  ];

  if (detailed) {
    const detailParts = [
      ['Material', p.pricing.material],
      ['Cutting', p.pricing.cutting],
      ['Edges', p.pricing.edges],
      ['Cutouts', p.pricing.cutouts],
      ['Install', p.pricing.installation],
      ['Joins', p.pricing.oversize + p.pricing.cornerJoin],
    ].filter(([, amount]) => Number(amount) !== 0);

    for (const [label, amount] of detailParts) {
      rows.push(
        h(Text, { style: styles.roomCalcLine, key: `piece-price-${p.id}-${label}` },
          `${label}: ${fmtCurrency(Number(amount))}`,
        ),
      );
    }

    for (const item of p.pricing.cuttingItems ?? []) {
      rows.push(
        h(Text, { style: styles.roomCalcLine, key: `piece-price-${p.id}-cut-${item.kind}-${item.side ?? 'all'}` },
          `  ${cuttingDetailLabel(item)}: ${item.quantity} ${item.unit} x ${fmtCurrency(item.rate)} = ${fmtCurrency(item.total)}`,
        ),
      );
    }
  }

  return rows;
}

/**
 * Page 2+ — room breakdown block in NCS Q22338 layout:
 *   {thickness}mm {room name}                                        $room total
 *   Description:
 *   {per-main-piece description + part dims}
 *   - {N} x {Cutout name} cutout
 *   - 1 x Waterfall End / Splashback
 *   {Material name}
 *   ────────────────────────────────────────────
 */
function buildRoomSection(
  room: QuotePdfRoom,
  settings: PdfTemplateSettings,
): React.ReactElement {
  if (!settings.showPieceBreakdown) {
    // Compact mode (room totals only) — header row + price.
    return h(View, { style: styles.roomBlock, key: `room-${room.id}`, wrap: false },
      h(View, { style: styles.roomTitleRow },
        h(Text, { style: styles.roomTitle }, room.name),
        settings.showRoomTotals
          ? h(Text, { style: styles.roomBlockPrice }, fmtCurrency(room.roomTotal))
          : null,
      ),
      h(View, { style: styles.roomBlockDivider }),
    );
  }

  let mainPieces = room.pieces.filter(isMainPiece);
  let attachmentPieces = room.pieces.filter(p => !isMainPiece(p));
  if (mainPieces.length === 0) {
    mainPieces = room.pieces;
    attachmentPieces = [];
  }

  // Room title — "{dominant thickness}mm {room name}". Edge profile in title
  // is deliberately omitted — Stonehenge pieces can carry mixed edge profiles
  // per side, so a single profile token would be misleading. The per-piece
  // description carries the thickness; the materialName line carries the stone.
  const dominantThickness = mainPieces[0]?.thicknessMm ?? null;
  const roomLabel = dominantThickness != null
    ? `${dominantThickness}mm ${room.name}`
    : room.name;

  // Description lines (one block, all main pieces concatenated).
  const descLines: string[] = [];
  for (const p of mainPieces) {
    for (const line of pieceDescriptionLines(p)) {
      descLines.push(line);
    }
  }

  // Bullet additionals — attachment pieces first, then cutouts across all
  // pieces in the room (so a benchtop's cutouts AND a waterfall's cutouts
  // both show under the room).
  const bulletLines: string[] = [];
  for (const a of attachmentPieces) {
    bulletLines.push(`- 1 x ${attachmentLabel(a)}`);
  }
  if (settings.showCutoutDetails) {
    for (const p of room.pieces) {
      for (const c of p.cutouts) {
        if (c.quantity > 0) {
          bulletLines.push(`- ${c.quantity} x ${c.name} cutout`);
        }
      }
    }
  }

  // Material name — first non-null materialName from the main pieces. If a
  // room has multiple materials, only the first is surfaced (room-level
  // multi-material display is a separate gap).
  const materialName = mainPieces.find(p => p.materialName)?.materialName ?? null;
  const showPieceTotals = settings.pricingMode === 'itemised' || settings.showItemisedBreakdown;
  const showDetailedCalculations = settings.showItemisedBreakdown;

  return h(View, { style: styles.roomBlock, key: `room-${room.id}`, wrap: false },
    // Title row: room label left, room total right.
    h(View, { style: styles.roomTitleRow },
      h(Text, { style: styles.roomTitle }, roomLabel),
      settings.showRoomTotals
        ? h(Text, { style: styles.roomBlockPrice }, fmtCurrency(room.roomTotal))
        : null,
    ),
    // Description block (only when there's main piece content).
    descLines.length > 0
      ? h(View, null,
          h(Text, { style: styles.roomDescLabel }, 'Description:'),
          ...descLines.map((line, i) =>
            h(Text, { style: styles.roomDescLine, key: `desc-${room.id}-${i}` }, line),
          ),
        )
      : null,
    // Additionals bullets.
    ...bulletLines.map((b, i) =>
      h(Text, { style: styles.roomBullet, key: `bullet-${room.id}-${i}` }, b),
    ),
    // Material name.
    materialName
      ? h(Text, { style: styles.roomMaterial }, materialName)
      : null,
    showPieceTotals
      ? h(View, { key: `price-lines-${room.id}` },
          ...room.pieces.flatMap(piece => piecePriceLines(piece, showDetailedCalculations)),
        )
      : null,
    // Divider between rooms.
    h(View, { style: styles.roomBlockDivider }),
  );
}

function buildCharges(
  data: QuotePdfData,
  sections: QuoteTemplateSections,
): React.ReactElement | null {
  const { delivery, templating, installation } = data.charges;
  const hasBaseCharges = delivery > 0 || templating > 0 || installation > 0;
  const hasCustomCharges = sections.additionalCosts && data.customChargesTotal !== 0;
  const hasDiscount = sections.quoteDiscount && data.discountAmount > 0;

  if (!hasBaseCharges && !hasCustomCharges && !hasDiscount) return null;

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

  // Custom charges (QA1)
  if (hasCustomCharges) {
    if (sections.additionalCostDetails) {
      // Render each custom charge as its own line
      for (const charge of data.customCharges) {
        if (charge.amount !== 0) {
          rows.push(
            h(View, { style: styles.chargeRow, key: `charge-custom-${charge.description}` },
              h(Text, { style: styles.chargeLabel }, charge.description),
              h(Text, { style: styles.chargeValue }, fmtCurrency(charge.amount)),
            )
          );
        }
      }
    } else {
      // Render single summary line
      rows.push(
        h(View, { style: styles.chargeRow, key: 'charge-custom-total' },
          h(Text, { style: styles.chargeLabel }, 'Additional costs'),
          h(Text, { style: styles.chargeValue }, fmtCurrency(data.customChargesTotal)),
        )
      );
    }
  }

  // Discount (QA1)
  if (hasDiscount) {
    const discountLabel = data.discountType === 'PERCENTAGE' && data.discountValue
      ? `Discount (${data.discountValue}%)`
      : 'Discount';
    rows.push(
      h(View, { style: styles.chargeRow, key: 'charge-discount' },
        h(Text, { style: styles.chargeLabel }, discountLabel),
        h(Text, { style: styles.chargeValue }, `-${fmtCurrency(data.discountAmount)}`),
      )
    );
  }

  return h(View, { style: styles.chargesSection, key: 'charges' }, ...rows);
}

function buildTotals(
  data: QuotePdfData,
  settings: PdfTemplateSettings,
): React.ReactElement {
  // Labels match NCS Q22338: "Total Excl. GST" / "GST" / "Total Incl. GST".
  return h(View, { style: styles.totalsSection, key: 'totals' },
    h(View, { style: styles.totalRow },
      h(Text, { style: styles.totalLabel }, 'Total Excl. GST'),
      h(Text, { style: styles.totalValue }, fmtCurrency(data.subtotalExGst)),
    ),
    settings.showGst
      ? h(View, { style: styles.totalRow },
          h(Text, { style: styles.totalLabel }, 'GST'),
          h(Text, { style: styles.totalValue }, fmtCurrency(data.gstAmount)),
        )
      : null,
    h(View, { style: styles.grandTotalRow },
      h(Text, { style: styles.grandTotalLabel }, 'Total Incl. GST'),
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
  sectionsConfig?: Partial<QuoteTemplateSections>,
): Promise<Buffer> {
  const settings: PdfTemplateSettings = {
    ...DEFAULT_TEMPLATE_SETTINGS,
    ...templateSettings,
  };

  const sections: QuoteTemplateSections = {
    ...getDefaultSectionsConfig('COMPREHENSIVE'),
    ...sectionsConfig,
  };
  const displayQuoteNumber = data.quoteNumber || `Q-${data.quoteId}-DRAFT`;

  // Build the document tree — two pages:
  //   Page 1: cover page (NCS Q22338 layout: company → quote title → For → intro
  //           → PLEASE NOTE → cost summary → terms → signoff)
  //   Page 2+: detail breakdown (header → rooms → charges → totals → terms)
  const doc = h(Document, {
    title: `Quote ${displayQuoteNumber}`,
    author: settings.companyName,
    subject: `Quote for ${data.customer?.name || 'Customer'}`,
  },
    // Page 1 — cover
    renderCoverPage(data, settings),

    // Page 2+ — detail breakdown
    h(Page, { size: 'A4', style: styles.page, key: 'breakdown', wrap: true },
      // Company header
      buildHeader(settings),

      // Quote info (number, date, customer, job address, material)
      buildQuoteInfo(data),

      // "{Project} Breakdown" title + column header row (NCS Q22338 page 2)
      buildBreakdownHeader(data),

      // Room sections
      ...data.rooms.map(room => buildRoomSection(room, settings)),

      // Quote-level charges (delivery, templating, installation, custom charges, discount)
      buildCharges(data, sections),

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
