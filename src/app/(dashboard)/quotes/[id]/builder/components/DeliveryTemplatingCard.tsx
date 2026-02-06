'use client';

import { useState, useEffect } from 'react';
import DistanceCalculator from '@/components/DistanceCalculator';

interface DeliveryTemplatingCardProps {
  quoteId: string;
  initialProjectAddress?: string | null;
  onUpdate?: () => void;
}

export default function DeliveryTemplatingCard({
  quoteId,
  initialProjectAddress,
  onUpdate,
}: DeliveryTemplatingCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [hasData, setHasData] = useState(false);
  const [currentDeliveryCost, setCurrentDeliveryCost] = useState<number | null>(null);
  const [currentTemplatingCost, setCurrentTemplatingCost] = useState<number | null>(null);

  // Fetch current quote delivery/templating data
  useEffect(() => {
    const fetchQuoteData = async () => {
      try {
        const res = await fetch(`/api/quotes/${quoteId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.deliveryCost !== null || data.templatingCost !== null) {
            setHasData(true);
            setCurrentDeliveryCost(data.deliveryCost);
            setCurrentTemplatingCost(data.templatingCost);
          }
        }
      } catch (err) {
        console.error('Failed to fetch quote data:', err);
      }
    };

    fetchQuoteData();
  }, [quoteId]);

  const handleDistanceChange = async (data: {
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
  }) => {
    setSaving(true);
    try {
      // Update quote with delivery/templating data
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryAddress: data.deliveryAddress,
          deliveryDistanceKm: data.deliveryDistanceKm,
          deliveryZoneId: data.deliveryZoneId,
          deliveryCost: data.deliveryCost,
          overrideDeliveryCost: data.overrideDeliveryCost,
          templatingRequired: data.templatingRequired,
          templatingDistanceKm: data.templatingDistanceKm,
          templatingCost: data.templatingCost,
          overrideTemplatingCost: data.overrideTemplatingCost,
        }),
      });

      if (res.ok) {
        setHasData(true);
        setCurrentDeliveryCost(data.deliveryCost);
        setCurrentTemplatingCost(data.templatingCost);
        // Notify parent to refresh (e.g., recalculate totals)
        if (onUpdate) {
          onUpdate();
        }
      }
    } catch (err) {
      console.error('Failed to update delivery/templating:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card">
      {/* Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-lg font-semibold hover:text-primary-600 transition-colors"
        >
          <svg
            className={`h-5 w-5 transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          Delivery & Templating
        </button>
        {hasData && !isExpanded && (
          <div className="flex items-center gap-3 text-sm">
            {currentDeliveryCost !== null && currentDeliveryCost > 0 && (
              <span className="text-gray-600">
                Delivery: <span className="font-medium">${(Number(currentDeliveryCost) || 0).toFixed(2)}</span>
              </span>
            )}
            {currentTemplatingCost !== null && currentTemplatingCost > 0 && (
              <span className="text-gray-600">
                Templating: <span className="font-medium">${(Number(currentTemplatingCost) || 0).toFixed(2)}</span>
              </span>
            )}
            <span className="text-green-600 flex items-center gap-1">
              <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              Set
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      {isExpanded && (
        <div className="p-4">
          {saving && (
            <div className="mb-3 text-sm text-gray-600 flex items-center gap-2">
              <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Saving...
            </div>
          )}
          <DistanceCalculator
            initialAddress={initialProjectAddress || ''}
            onChange={handleDistanceChange}
          />
        </div>
      )}
    </div>
  );
}
