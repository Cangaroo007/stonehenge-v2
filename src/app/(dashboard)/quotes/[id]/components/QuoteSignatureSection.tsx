'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import SignatureModal from '@/components/SignatureModal';

interface QuoteSignature {
  id: number;
  signatureType: string;
  signedAt: string;
  signerName: string;
  signerEmail: string;
  ipAddress: string | null;
  user: {
    name: string | null;
    email: string;
  } | null;
}

interface QuoteSignatureSectionProps {
  quoteId: number;
  quote_number: string;
  customerName: string;
  totalAmount: string;
  status: string;
  signature: QuoteSignature | null;
}

export default function QuoteSignatureSection({
  quoteId,
  quoteNumber,
  customerName,
  totalAmount,
  status,
  signature,
}: QuoteSignatureSectionProps) {
  const [showModal, setShowModal] = useState(false);
  const router = useRouter();

  const handleSuccess = () => {
    setShowModal(false);
    router.refresh();
  };

  // If already signed, show signature details
  if (signature) {
    return (
      <div className="card p-6">
        <div className="flex items-start gap-4">
          <div className="flex-shrink-0">
            <div className="h-12 w-12 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="h-6 w-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              Quote Signed & Accepted
            </h3>
            <div className="space-y-2 text-sm text-gray-600">
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Signed by:</span>
                <span>{signature.signerName}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Email:</span>
                <span>{signature.signerEmail}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Date & Time:</span>
                <span>{new Date(signature.signedAt).toLocaleString()}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium text-gray-700">Method:</span>
                <span className="capitalize">{signature.signatureType} signature</span>
              </div>
              {signature.ipAddress && (
                <div className="flex items-center gap-2">
                  <span className="font-medium text-gray-700">IP Address:</span>
                  <span className="font-mono text-xs">{signature.ipAddress}</span>
                </div>
              )}
            </div>
            <div className="mt-4 pt-4 border-t text-xs text-gray-500">
              <p>
                ✓ This electronic signature is legally binding under the Electronic Transactions Act 1999
                (Commonwealth of Australia).
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show sign button if quote is in DRAFT or SENT status
  if (status === 'DRAFT' || status === 'SENT') {
    return (
      <>
        <div className="card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                Ready to Accept?
              </h3>
              <p className="text-gray-600">
                Sign this quote electronically to accept and proceed to production.
              </p>
            </div>
            <button onClick={() => setShowModal(true)} className="btn-primary">
              <svg className="h-5 w-5 mr-2 inline-block" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
              </svg>
              Sign Quote
            </button>
          </div>
        </div>

        {showModal && (
          <SignatureModal
            quoteId={quoteId}
            quoteNumber={quoteNumber}
            customerName={customerName}
            totalAmount={totalAmount}
            onClose={() => setShowModal(false)}
            onSuccess={handleSuccess}
          />
        )}
      </>
    );
  }

  // Don't show anything for other statuses
  return null;
}
