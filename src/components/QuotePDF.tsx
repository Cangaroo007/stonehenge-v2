import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import { format } from 'date-fns';

// Types
interface QuoteData {
  id: number;
  quoteNumber: string;
  revision: number;
  projectName: string | null;
  projectAddress: string | null;
  status: string;
  subtotal: { toString(): string } | number;
  taxRate: { toString(): string } | number;
  taxAmount: { toString(): string } | number;
  total: { toString(): string } | number;
  notes: string | null;
  createdAt: Date;
  validUntil: Date | null;
  customer: {
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  } | null;
  rooms: Array<{
    id: number;
    name: string;
    pieces: Array<{
      id: number;
      description: string | null;
      lengthMm: number;
      widthMm: number;
      thicknessMm: number;
      areaSqm: { toString(): string } | number;
      materialName: string | null;
      materialCost: { toString(): string } | number;
      featuresCost: { toString(): string } | number;
      totalCost: { toString(): string } | number;
      piece_features: Array<{
        id: number;
        name: string;
        quantity: number;
        totalPrice: { toString(): string } | number;
      }>;
    }>;
  }>;
}

interface CompanyInfo {
  name: string;
  abn: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
}

// Styles
const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  header: {
    marginBottom: 20,
  },
  companyName: {
    fontSize: 24,
    fontFamily: 'Helvetica-Bold',
    color: '#1a1a1a',
    marginBottom: 4,
  },
  companyAbn: {
    fontSize: 9,
    color: '#666',
    marginBottom: 8,
  },
  companyDetails: {
    fontSize: 9,
    color: '#333',
    lineHeight: 1.4,
  },
  divider: {
    borderBottomWidth: 1,
    borderBottomColor: '#ccc',
    marginVertical: 15,
  },
  quoteTitle: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  quoteTitleLeft: {
    flex: 1,
  },
  quoteTitleText: {
    fontSize: 18,
    fontFamily: 'Helvetica-Bold',
    color: '#2563eb',
    marginBottom: 4,
  },
  revisionText: {
    fontSize: 10,
    color: '#666',
  },
  quoteTitleRight: {
    textAlign: 'right',
  },
  dateText: {
    fontSize: 10,
    color: '#333',
  },
  customerSection: {
    marginBottom: 15,
  },
  customerLabel: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  customerName: {
    fontSize: 12,
    color: '#333',
  },
  introText: {
    fontSize: 10,
    color: '#333',
    lineHeight: 1.5,
    marginBottom: 15,
  },
  pleaseNoteSection: {
    backgroundColor: '#fef3c7',
    padding: 10,
    marginBottom: 15,
    borderRadius: 4,
  },
  pleaseNoteTitle: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 5,
    textDecoration: 'underline',
  },
  pleaseNoteText: {
    fontSize: 9,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
    lineHeight: 1.4,
  },
  totalsSection: {
    marginBottom: 20,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginBottom: 4,
  },
  totalLabel: {
    width: 120,
    fontSize: 10,
    color: '#333',
  },
  totalValue: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  totalGrandLabel: {
    width: 120,
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#333',
  },
  totalGrandValue: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#2563eb',
  },
  termsSection: {
    marginBottom: 20,
  },
  termsText: {
    fontSize: 8,
    color: '#666',
    lineHeight: 1.5,
    marginBottom: 8,
  },
  signatureSection: {
    marginTop: 30,
  },
  signatureText: {
    fontSize: 10,
    marginBottom: 40,
  },
  signatureName: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
  },
  signatureCompany: {
    fontSize: 10,
    color: '#666',
  },
  // Page 2 - Breakdown
  breakdownTitle: {
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 15,
    color: '#1a1a1a',
  },
  roomSection: {
    marginBottom: 15,
  },
  roomName: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
    backgroundColor: '#f3f4f6',
    padding: 6,
    marginBottom: 5,
  },
  pieceRow: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e5e7eb',
  },
  pieceDescription: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 2,
  },
  pieceDimensions: {
    fontSize: 9,
    color: '#666',
    marginBottom: 2,
  },
  pieceMaterial: {
    fontSize: 9,
    color: '#333',
    marginBottom: 2,
  },
  pieceFeatures: {
    fontSize: 8,
    color: '#666',
    marginLeft: 10,
  },
  pieceCost: {
    fontSize: 10,
    fontFamily: 'Helvetica-Bold',
    textAlign: 'right',
    marginTop: 4,
  },
  pageFooter: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  pageNumber: {
    fontSize: 9,
    color: '#666',
  },
  breakdownTotals: {
    marginTop: 15,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ccc',
  },
});

// Helper to format currency
function formatCurrency(value: number | { toString(): string }): string {
  const num = typeof value === 'number' ? value : parseFloat(value.toString());
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
  }).format(num);
}

// Helper to format date
function formatDate(date: Date): string {
  return format(new Date(date), 'dd/MM/yyyy');
}

// Named export function for use with pdf() - returns JSX element
export function QuotePDFDocument(quote: QuoteData, companyInfo: CompanyInfo) {
  const subtotal = typeof quote.subtotal === 'number' ? quote.subtotal : parseFloat(quote.subtotal.toString());
  const taxAmount = typeof quote.tax_amount === 'number' ? quote.tax_amount : parseFloat(quote.tax_amount.toString());
  const total = typeof quote.total === 'number' ? quote.total : parseFloat(quote.total.toString());
  const taxRate = typeof quote.tax_rate === 'number' ? quote.tax_rate : parseFloat(quote.tax_rate.toString());

  return (
    <Document>
      {/* Page 1 - Cover */}
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.companyName}>{companyInfo.name}</Text>
          <Text style={styles.companyAbn}>ABN: {companyInfo.abn}</Text>
          <Text style={styles.companyDetails}>{companyInfo.address}</Text>
          <Text style={styles.companyDetails}>
            Phone: {companyInfo.phone} | Fax: {companyInfo.fax}
          </Text>
        </View>

        <View style={styles.divider} />

        {/* Quote Title */}
        <View style={styles.quoteTitle}>
          <View style={styles.quoteTitleLeft}>
            <Text style={styles.quoteTitleText}>
              Quote - {quote.quote_number} - {quote.project_name || 'Untitled Project'}
            </Text>
            <Text style={styles.revisionText}>Revision {quote.revision}</Text>
          </View>
          <View style={styles.quoteTitleRight}>
            <Text style={styles.dateText}>Date: {formatDate(quote.createdAt)}</Text>
          </View>
        </View>

        {/* Customer */}
        <View style={styles.customerSection}>
          <Text style={styles.customerLabel}>For:</Text>
          <Text style={styles.customerName}>
            {quote.customer?.name || 'No customer specified'}
            {quote.customer?.company ? ` - ${quote.customer.company}` : ''}
          </Text>
        </View>

        {/* Introduction */}
        <Text style={styles.introText}>
          Please see below for our price breakdown for your quotation as per the plans supplied. 
          Any differences in stonework at measure and fabrication stage will be charged accordingly.
        </Text>
        <Text style={styles.introText}>
          This quote is for supply, fabrication and local installation of stonework.
        </Text>
        <Text style={styles.introText}>
          Thank you for the opportunity in submitting this quotation. We look forward to working with you.
        </Text>

        {/* Please Note */}
        <View style={styles.pleaseNoteSection}>
          <Text style={styles.pleaseNoteTitle}>PLEASE NOTE:</Text>
          <Text style={styles.pleaseNoteText}>
            This Quote is based on the proviso that all stonework is the same colour and fabricated 
            and installed at the same time. Any variation from this assumption will require re-quoting.
          </Text>
        </View>

        {/* Totals */}
        <View style={styles.totalsSection}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Cost:</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST:</Text>
            <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
          </View>
          <View style={[styles.totalRow, { marginTop: 5 }]}>
            <Text style={styles.totalGrandLabel}>Total Including GST:</Text>
            <Text style={styles.totalGrandValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Terms */}
        <View style={styles.termsSection}>
          <Text style={styles.termsText}>
            Upon acceptance of this quotation I hereby certify that the above information is true and correct. 
            I have read and understand the TERMS AND CONDITIONS OF TRADE OF {companyInfo.name.toUpperCase()} which 
            forms part of, and is intended to read in conjunction with this quotation. I agree to be bound by 
            these conditions. I authorise the use of my personal information as detailed in the Privacy Act 
            Clause therein. I agree that if I am a Director or a shareholder (owning at least 15% of the shares) 
            of the client I shall be personally liable for the performance of the clients obligations under this act.
          </Text>
          <Text style={styles.termsText}>
            Please read this quote carefully for all details regarding edge thickness, stone colour and work 
            description. We require a 50% deposit and completed purchase order upon acceptance of this quote.
          </Text>
          <Text style={styles.termsText}>
            Please contact our office via email {companyInfo.email} if you wish to proceed.
          </Text>
          <Text style={styles.termsText}>
            This quote is valid for 30 days, on the exception of being signed off as a job, where it will be 
            valid for a 3 month period.
          </Text>
        </View>

        {/* Signature */}
        <View style={styles.signatureSection}>
          <Text style={styles.signatureText}>Yours Sincerely</Text>
          <Text style={styles.signatureName}>Beau Kavanagh</Text>
          <Text style={styles.signatureCompany}>{companyInfo.name}</Text>
        </View>

        {/* Page Number */}
        <View style={styles.pageFooter}>
          <Text style={styles.pageNumber}>Page 1 of 2</Text>
        </View>
      </Page>

      {/* Page 2 - Breakdown */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.breakdownTitle}>
          {quote.project_name || 'Project'} Breakdown
        </Text>

        {quote.rooms.map((room) => (
          <View key={quote_rooms.id} style={styles.roomSection}>
            <Text style={styles.roomName}>{quote_rooms.name.toUpperCase()}</Text>
            {quote_rooms.pieces.map((piece) => (
              <View key={piece.id} style={styles.pieceRow}>
                <Text style={styles.pieceDescription}>
                  {piece.description || 'Stone piece'}
                </Text>
                <Text style={styles.pieceDimensions}>
                  {piece.lengthMm} x {piece.widthMm} x {piece.thicknessMm}mm
                  {' '}({typeof piece.areaSqm === 'number' 
                    ? piece.areaSqm.toFixed(2) 
                    : parseFloat(piece.areaSqm.toString()).toFixed(2)} m2)
                </Text>
                {piece.materialName && (
                  <Text style={styles.pieceMaterial}>
                    Material: {piece.materialName}
                  </Text>
                )}
                {piece.features.length > 0 && (
                  <View>
                    {piece.features.map((feature) => (
                      <Text key={feature.id} style={styles.pieceFeatures}>
                        - {feature.quantity}x {feature.name}
                      </Text>
                    ))}
                  </View>
                )}
                <Text style={styles.pieceCost}>
                  {formatCurrency(piece.totalCost)}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {/* Notes */}
        {quote.notes && (
          <View style={{ marginTop: 15 }}>
            <Text style={{ fontSize: 10, fontFamily: 'Helvetica-Bold', marginBottom: 5 }}>
              Notes:
            </Text>
            <Text style={{ fontSize: 9, color: '#666', lineHeight: 1.4 }}>
              {quote.notes}
            </Text>
          </View>
        )}

        {/* Totals */}
        <View style={styles.breakdownTotals}>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total Excl. GST</Text>
            <Text style={styles.totalValue}>{formatCurrency(subtotal)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>GST ({taxRate}%)</Text>
            <Text style={styles.totalValue}>{formatCurrency(taxAmount)}</Text>
          </View>
          <View style={[styles.totalRow, { marginTop: 5 }]}>
            <Text style={styles.totalGrandLabel}>Total Incl. GST</Text>
            <Text style={styles.totalGrandValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        {/* Page Number */}
        <View style={styles.pageFooter}>
          <Text style={styles.pageNumber}>Page 2 of 2</Text>
        </View>
      </Page>
    </Document>
  );
}

// PDF Component (kept for backward compatibility)
export default function QuotePDF({
  quote,
  companyInfo,
}: {
  quote: QuoteData;
  companyInfo: CompanyInfo;
}) {
  return QuotePDFDocument(quote, companyInfo);
}
