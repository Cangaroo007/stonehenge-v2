'use client';

import { useState, useRef, useEffect } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import toast from 'react-hot-toast';

interface SignatureModalProps {
  quoteId: number;
  quoteNumber: string;
  customerName: string;
  totalAmount: string;
  onClose: () => void;
  onSuccess: () => void;
}

type SignatureMode = 'draw' | 'type';

export default function SignatureModal({
  quoteId,
  quoteNumber,
  customerName,
  totalAmount,
  onClose,
  onSuccess,
}: SignatureModalProps) {
  const [mode, setMode] = useState<SignatureMode>('type');
  const [typedName, setTypedName] = useState('');
  const [email, setEmail] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const sigCanvas = useRef<SignatureCanvas>(null);

  const handleClear = () => {
    if (mode === 'draw') {
      sigCanvas.current?.clear();
    } else {
      setTypedName('');
    }
  };

  const handleSubmit = async () => {
    // Validation
    if (!email) {
      toast.error('Please enter your email address');
      return;
    }

    if (!agreed) {
      toast.error('Please agree to the terms');
      return;
    }

    let signatureData = '';
    let signatureType: 'typed' | 'drawn' = 'typed';

    if (mode === 'draw') {
      if (sigCanvas.current?.isEmpty()) {
        toast.error('Please provide your signature');
        return;
      }
      signatureData = sigCanvas.current?.toDataURL() || '';
      signatureType = 'drawn';
    } else {
      if (!typedName.trim()) {
        toast.error('Please type your name');
        return;
      }
      signatureData = typedName;
      signatureType = 'typed';
    }

    setSaving(true);

    try {
      const response = await fetch(`/api/quotes/${quoteId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signatureData,
          signatureType,
          signerName: mode === 'draw' ? typedName : typedName,
          signerEmail: email,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to sign quote');
      }

      toast.success('Quote signed successfully!');
      onSuccess();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to sign quote');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-gradient-to-r from-primary-600 to-primary-700 text-white">
          <div>
            <h2 className="text-xl font-semibold">Sign Quote</h2>
            <p className="text-sm text-primary-100 mt-1">{quoteNumber}</p>
          </div>
          <button onClick={onClose} className="text-white hover:text-primary-100 text-2xl">
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Quote Summary */}
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <h3 className="font-semibold text-gray-900 mb-2">Quote Summary</h3>
            <div className="space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium text-gray-900">{customerName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-600">Quote Number:</span>
                <span className="font-medium text-gray-900">{quoteNumber}</span>
              </div>
              <div className="flex justify-between border-t pt-1 mt-1">
                <span className="text-gray-600">Total Amount:</span>
                <span className="font-bold text-primary-600 text-lg">{totalAmount}</span>
              </div>
            </div>
          </div>

          {/* Signature Mode Toggle */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Signature Method
            </label>
            <div className="flex gap-2">
              <button
                onClick={() => setMode('type')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  mode === 'type'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Type Name
              </button>
              <button
                onClick={() => setMode('draw')}
                className={`flex-1 py-2 px-4 rounded-lg font-medium transition-colors ${
                  mode === 'draw'
                    ? 'bg-primary-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Draw Signature
              </button>
            </div>
          </div>

          {/* Email Input */}
          <div>
            <label className="label">Email Address *</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="your.email@example.com"
            />
            <p className="text-xs text-gray-500 mt-1">
              A confirmation will be sent to this email
            </p>
          </div>

          {/* Name Input (for drawn signatures) or Typed Signature */}
          {mode === 'draw' && (
            <div>
              <label className="label">Full Name *</label>
              <input
                type="text"
                required
                value={typedName}
                onChange={(e) => setTypedName(e.target.value)}
                className="input"
                placeholder="Type your full name"
              />
            </div>
          )}

          {/* Signature Input */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {mode === 'draw' ? 'Draw Your Signature *' : 'Type Your Full Name *'}
            </label>

            {mode === 'draw' ? (
              <div className="border-2 border-gray-300 rounded-lg overflow-hidden bg-white">
                <SignatureCanvas
                  ref={sigCanvas}
                  canvasProps={{
                    className: 'w-full h-48 touch-action-none',
                  }}
                  backgroundColor="white"
                />
              </div>
            ) : (
              <div className="border-2 border-gray-300 rounded-lg p-8 bg-white">
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  className="w-full text-4xl font-signature text-center border-0 focus:outline-none"
                  placeholder="Your Name"
                  style={{ fontFamily: 'Brush Script MT, cursive' }}
                />
              </div>
            )}

            <div className="flex justify-end mt-2">
              <button onClick={handleClear} className="text-sm text-gray-600 hover:text-gray-800">
                Clear
              </button>
            </div>
          </div>

          {/* Agreement Checkbox */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)}
                className="mt-1 rounded"
              />
              <span className="text-sm text-gray-700">
                <strong className="text-gray-900">I agree</strong> that this electronic signature
                constitutes my legal signature and authorization to proceed with this quote. I understand
                that by signing, I am accepting the terms and agreeing to the total amount of{' '}
                <strong>{totalAmount}</strong>.
              </span>
            </label>
          </div>

          {/* Legal Notice */}
          <div className="text-xs text-gray-500 bg-gray-50 rounded p-3">
            <p className="font-medium text-gray-700 mb-1">Legal Notice:</p>
            <p>
              This electronic signature is legally binding under the Electronic Transactions Act 1999
              (Commonwealth of Australia). Your signature, IP address, timestamp, and device information
              will be recorded for verification purposes.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-gray-50 flex justify-between items-center">
          <button onClick={onClose} className="btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !agreed}
            className="btn-primary"
          >
            {saving ? (
              <span className="flex items-center gap-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                Signing...
              </span>
            ) : (
              'Sign & Accept Quote'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
