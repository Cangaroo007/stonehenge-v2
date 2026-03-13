'use client';

import { useState, useEffect, useRef } from 'react';

// ── Constants ────────────────────────────────────────────────────────────────

const MITERED_EDGE_ID = 'cmlar3eu20006znatmv7mbivv';
const ARRIS_EDGE_ID = 'cmlar3etm0002znat72h7jnx0';

/** Max strip width (mm) before auto-promoting to a piece */
const MAX_STRIP_WIDTH_MM = 300;

export { MITERED_EDGE_ID, ARRIS_EDGE_ID, MAX_STRIP_WIDTH_MM };

// ── Interfaces ───────────────────────────────────────────────────────────────

interface WaterfallEdgePickerProps {
  isOpen: boolean;
  type: 'WATERFALL' | 'SPLASHBACK';
  /** Parent piece dimensions — used to auto-fill child length */
  parentLengthMm: number;
  parentWidthMm: number;
  parentThicknessMm: number;
  /** Called with selected edge + final dimensions on confirm */
  onConfirm: (
    selectedEdge: 'top' | 'bottom' | 'left' | 'right',
    lengthMm: number,
    widthMm: number,
    thicknessMm: number
  ) => void;
  onClose: () => void;
}

type Edge = 'top' | 'bottom' | 'left' | 'right';

// ── Component ────────────────────────────────────────────────────────────────

export default function WaterfallSplashbackModal({
  isOpen,
  type,
  parentLengthMm,
  parentWidthMm,
  parentThicknessMm,
  onConfirm,
  onClose,
}: WaterfallEdgePickerProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [lengthMm, setLengthMm] = useState(0);
  const [widthMm, setWidthMm] = useState(0);
  const [thicknessMm, setThicknessMm] = useState(0);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen, onClose]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setStep(1);
      setSelectedEdge(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const edgeLengthFor = (edge: Edge): number =>
    edge === 'top' || edge === 'bottom' ? parentLengthMm : parentWidthMm;

  const edgeLabels: Record<Edge, string> = {
    top: 'Front (top)',
    bottom: 'Back (bottom)',
    left: 'Left',
    right: 'Right',
  };

  const handleEdgeSelect = (edge: Edge) => {
    setSelectedEdge(edge);
    const autoLength = edgeLengthFor(edge);
    setLengthMm(autoLength);
    setWidthMm(type === 'WATERFALL' ? 900 : 600);
    setThicknessMm(parentThicknessMm);
    setStep(2);
  };

  const handleBack = () => {
    setStep(1);
    setSelectedEdge(null);
  };

  const handleConfirm = () => {
    if (!selectedEdge) return;
    onConfirm(selectedEdge, lengthMm, widthMm, thicknessMm);
  };

  const isWaterfall = type === 'WATERFALL';
  const label = isWaterfall ? 'Waterfall' : 'Splashback';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div
        ref={ref}
        className="bg-white rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            Add {label} — {step === 1 ? 'Select Edge' : 'Dimensions'}
          </h3>
        </div>

        {/* Body */}
        <div className="px-6 py-4">
          {step === 1 ? (
            <>
              <p className="text-sm text-gray-600 mb-4">
                Which edge of the parent piece should the {label.toLowerCase()} attach to?
              </p>
              <div className="grid grid-cols-2 gap-3">
                {(['top', 'bottom', 'left', 'right'] as Edge[]).map((edge) => (
                  <button
                    key={edge}
                    onClick={() => handleEdgeSelect(edge)}
                    className="border border-gray-200 rounded-lg p-4 hover:bg-blue-50 hover:border-blue-300 transition-colors text-left"
                  >
                    <p className="text-sm font-medium text-gray-900">{edgeLabels[edge]}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {edgeLengthFor(edge)}mm length
                    </p>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 mb-4">
                {label} on <span className="font-medium">{edgeLabels[selectedEdge!]}</span> edge
              </p>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Length (mm)
                  </label>
                  <input
                    type="number"
                    value={lengthMm}
                    onChange={(e) => setLengthMm(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {isWaterfall ? 'Width — height of fall (mm)' : 'Height (mm)'}
                  </label>
                  <input
                    type="number"
                    value={widthMm}
                    onChange={(e) => setWidthMm(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Thickness (mm)
                  </label>
                  <input
                    type="number"
                    value={thicknessMm}
                    onChange={(e) => setThicknessMm(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <p className="text-xs text-gray-500 italic">
                  {isWaterfall
                    ? 'Adjust width if waterfall doesn\u2019t reach the floor'
                    : 'Check length \u2014 may differ from benchtop if behind oven or sink'}
                </p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 flex justify-between">
          {step === 2 ? (
            <button
              onClick={handleBack}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Back
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Cancel
            </button>
            {step === 2 && (
              <button
                onClick={handleConfirm}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
              >
                Confirm
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
