'use client';

import { useState, useEffect, useRef } from 'react';

interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  originAddress: string;
  destinationAddress: string;
  deliveryZone: {
    id: number;
    name: string;
    maxDistanceKm: number;
    ratePerKm: number;
    baseCharge: number;
  } | null;
  deliveryCost: number | null;
  templatingCost: number | null;
}

interface DistanceCalculatorProps {
  initialAddress?: string;
  initialDeliveryRequired?: boolean;
  initialDeliveryCost?: number | null;
  initialTemplatingRequired?: boolean;
  initialTemplatingCost?: number | null;
  initialDistanceKm?: number | null;
  initialZoneId?: number | null;
  onChange: (data: {
    deliveryAddress: string;
    deliveryDistanceKm: number | null;
    deliveryZoneId: number | null;
    deliveryCost: number | null;
    deliveryRequired: boolean;
    templatingRequired: boolean;
    templatingDistanceKm: number | null;
    templatingCost: number | null;
    overrideDeliveryCost: number | null;
    overrideTemplatingCost: number | null;
  }) => void;
}

export default function DistanceCalculator({
  initialAddress = '',
  initialDeliveryRequired = true,
  initialDeliveryCost = null,
  initialTemplatingRequired = false,
  initialTemplatingCost = null,
  initialDistanceKm = null,
  initialZoneId = null,
  onChange,
}: DistanceCalculatorProps) {
  const [address, setAddress] = useState(initialAddress);
  const [calculating, setCalculating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DistanceResult | null>(null);
  
  // Google Places Autocomplete - DISABLED to prevent crashes
  const inputRef = useRef<HTMLInputElement>(null);
  const autocompleteRef = useRef<any>(null);
  
  // Delivery options
  const [deliveryRequired, setDeliveryRequired] = useState(initialDeliveryRequired);
  const [overrideDeliveryCost, setOverrideDeliveryCost] = useState<number | null>(
    initialDeliveryCost !== null && initialDeliveryCost !== result?.deliveryCost 
      ? initialDeliveryCost 
      : null
  );
  
  // Templating options
  const [templatingRequired, setTemplatingRequired] = useState(initialTemplatingRequired);
  const [overrideTemplatingCost, setOverrideTemplatingCost] = useState<number | null>(
    initialTemplatingCost !== null && initialTemplatingCost !== result?.templatingCost
      ? initialTemplatingCost
      : null
  );

  // Google Places Autocomplete initialization - DISABLED
  // TODO: Re-enable after fixing Google Maps loading issue
  useEffect(() => {
    // Temporarily disabled to prevent page crashes
    return;
  }, []);

  // Load initial data if provided
  useEffect(() => {
    if (initialDistanceKm && initialZoneId && initialDeliveryCost !== null) {
      setResult({
        distanceKm: initialDistanceKm,
        durationMinutes: 0,
        originAddress: '',
        destinationAddress: initialAddress,
        deliveryZone: initialZoneId ? {
          id: initialZoneId,
          name: 'Loaded',
          maxDistanceKm: 0,
          ratePerKm: 0,
          baseCharge: 0,
        } : null,
        deliveryCost: initialDeliveryCost,
        templatingCost: initialTemplatingCost,
      });
    }
  }, [initialDistanceKm, initialZoneId, initialDeliveryCost, initialTemplatingCost, initialAddress]);

  const handleCalculate = async () => {
    if (!address.trim()) {
      setError('Please enter a delivery address');
      return;
    }

    setCalculating(true);
    setError(null);

    try {
      const response = await fetch('/api/distance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: address }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to calculate distance');
      }

      const data: DistanceResult = await response.json();
      setResult(data);
      
      // Notify parent component
      notifyChange(data, deliveryRequired, templatingRequired, overrideDeliveryCost, overrideTemplatingCost);
    } catch (err) {
      console.error('Distance calculation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to calculate distance');
      setResult(null);
    } finally {
      setCalculating(false);
    }
  };

  const notifyChange = (
    currentResult: DistanceResult | null,
    deliveryReq: boolean,
    templatingReq: boolean,
    overrideDelivery: number | null,
    overrideTemplating: number | null
  ) => {
    onChange({
      deliveryAddress: address,
      deliveryDistanceKm: currentResult?.distanceKm || null,
      deliveryZoneId: currentResult?.deliveryZone?.id || null,
      deliveryCost: deliveryReq 
        ? (overrideDelivery !== null ? overrideDelivery : currentResult?.deliveryCost || null)
        : 0,
      deliveryRequired: deliveryReq,
      templatingRequired: templatingReq,
      templatingDistanceKm: templatingReq ? currentResult?.distanceKm || null : null,
      templatingCost: templatingReq
        ? (overrideTemplating !== null ? overrideTemplating : currentResult?.templatingCost || null)
        : null,
      overrideDeliveryCost: overrideDelivery,
      overrideTemplatingCost: overrideTemplating,
    });
  };

  const handleDeliveryRequiredChange = (required: boolean) => {
    setDeliveryRequired(required);
    if (!required) {
      setOverrideDeliveryCost(null);
    }
    notifyChange(result, required, templatingRequired, null, overrideTemplatingCost);
  };

  const handleTemplatingRequiredChange = (required: boolean) => {
    setTemplatingRequired(required);
    if (!required) {
      setOverrideTemplatingCost(null);
    }
    notifyChange(result, deliveryRequired, required, overrideDeliveryCost, null);
  };

  const handleOverrideDeliveryChange = (value: string) => {
    const numValue = value ? parseFloat(value) : null;
    setOverrideDeliveryCost(numValue);
    notifyChange(result, deliveryRequired, templatingRequired, numValue, overrideTemplatingCost);
  };

  const handleOverrideTemplatingChange = (value: string) => {
    const numValue = value ? parseFloat(value) : null;
    setOverrideTemplatingCost(numValue);
    notifyChange(result, deliveryRequired, templatingRequired, overrideDeliveryCost, numValue);
  };

  const finalDeliveryCost = deliveryRequired
    ? (overrideDeliveryCost !== null ? overrideDeliveryCost : result?.deliveryCost)
    : 0;

  const finalTemplatingCost = templatingRequired
    ? (overrideTemplatingCost !== null ? overrideTemplatingCost : result?.templatingCost)
    : null;

  return (
    <div className="space-y-4">
      {/* Address Input */}
      <div>
        <label className="label">Delivery Address</label>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            className="input flex-1"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Start typing address... (autocomplete enabled)"
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCalculate();
              }
            }}
          />
          <button
            type="button"
            onClick={handleCalculate}
            disabled={calculating || !address.trim()}
            className="btn-primary whitespace-nowrap"
          >
            {calculating ? (
              <>
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4 inline" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                Calculating...
              </>
            ) : (
              'Calculate Distance'
            )}
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Results Display */}
      {result && (
        <div className="space-y-4">
          {/* Distance Info */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div>
              <span className="text-xs text-blue-700 block font-medium">Distance</span>
              <span className="text-lg font-bold text-blue-900">{(Number(result.distanceKm) || 0).toFixed(1)} km</span>
            </div>
            <div>
              <span className="text-xs text-blue-700 block font-medium">Duration</span>
              <span className="text-lg font-bold text-blue-900">{result.durationMinutes} min</span>
            </div>
            <div>
              <span className="text-xs text-blue-700 block font-medium">Zone</span>
              <span className="text-lg font-bold text-blue-900">
                {result.deliveryZone?.name || 'Out of range'}
              </span>
            </div>
            <div>
              <span className="text-xs text-blue-700 block font-medium">Base Charge</span>
              <span className="text-lg font-bold text-blue-900">
                ${(Number(result.deliveryZone?.baseCharge) || 0).toFixed(2) || '—'}
              </span>
            </div>
          </div>

          {/* Delivery Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">Delivery</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={deliveryRequired}
                  onChange={(e) => handleDeliveryRequiredChange(e.target.checked)}
                  className="h-4 w-4 text-primary-600 rounded"
                />
                <span className="text-sm text-gray-700">Delivery Required</span>
              </label>
            </div>

            {deliveryRequired ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Calculated Cost:</span>
                  <span className="font-medium">
                    ${(Number(result.deliveryCost) || 0).toFixed(2) || '—'}
                  </span>
                </div>

                <div>
                  <label className="label text-xs">Override Delivery Cost (optional)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input flex-1"
                      value={overrideDeliveryCost !== null ? overrideDeliveryCost : ''}
                      onChange={(e) => handleOverrideDeliveryChange(e.target.value)}
                      placeholder={(Number(result.deliveryCost) || 0).toFixed(2) || '0.00'}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Final Delivery Cost:</span>
                  <span className="text-lg font-bold text-primary-600">
                    ${(Number(finalDeliveryCost) || 0).toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-500 italic">
                No delivery - customer pickup or pass-through
              </div>
            )}
          </div>

          {/* Templating Section */}
          <div className="border border-gray-200 rounded-lg p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-gray-900">Templating</h4>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={templatingRequired}
                  onChange={(e) => handleTemplatingRequiredChange(e.target.checked)}
                  className="h-4 w-4 text-primary-600 rounded"
                />
                <span className="text-sm text-gray-700">Templating Required</span>
              </label>
            </div>

            {templatingRequired && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Calculated Cost:</span>
                  <span className="font-medium">
                    ${(Number(result.templatingCost) || 0).toFixed(2) || '—'}
                  </span>
                </div>

                <div>
                  <label className="label text-xs">Override Templating Cost (optional)</label>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500">$</span>
                    <input
                      type="number"
                      step="0.01"
                      className="input flex-1"
                      value={overrideTemplatingCost !== null ? overrideTemplatingCost : ''}
                      onChange={(e) => handleOverrideTemplatingChange(e.target.value)}
                      placeholder={(Number(result.templatingCost) || 0).toFixed(2) || '0.00'}
                    />
                  </div>
                </div>

                <div className="pt-2 border-t border-gray-200 flex items-center justify-between">
                  <span className="font-semibold text-gray-900">Final Templating Cost:</span>
                  <span className="text-lg font-bold text-primary-600">
                    ${(Number(finalTemplatingCost) || 0).toFixed(2) || '0.00'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* No Results Helper */}
      {!result && !error && !calculating && (
        <div className="text-center py-6 text-gray-500 text-sm">
          Enter a delivery address and click "Calculate Distance" to get delivery and templating costs
        </div>
      )}
    </div>
  );
}
