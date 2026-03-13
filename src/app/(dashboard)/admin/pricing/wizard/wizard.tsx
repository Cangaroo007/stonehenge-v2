'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

// --- Types ---

interface CuttingData {
  rate20mm: number;
  rate40mm: number;
}

interface EdgeProfileRate {
  name: string;
  rate20mm: number;
  rate40mm: number;
}

interface EdgeProfilesData {
  chargeExtra: boolean;
  profiles: EdgeProfileRate[];
}

interface MaterialMultiplier {
  category: string;
  label: string;
  multiplier: number;
}

interface MaterialTypesData {
  chargeDifferent: boolean;
  multipliers: MaterialMultiplier[];
}

interface InstallationData {
  rate20mm: number;
  rate40mm: number;
  noInstallation: boolean;
}

interface CutoutRate {
  id: string;
  name: string;
  baseRate: number;
}

interface SpecialFeaturesData {
  waterfall20mm: number;
  waterfall40mm: number;
  templatingEnabled: boolean;
  templatingFee: number;
  deliveryEnabled: boolean;
  deliveryPerKm: number;
}

interface GstData {
  gstRate: number;
}

interface WizardState {
  cutting: CuttingData;
  edgeProfiles: EdgeProfilesData;
  materialTypes: MaterialTypesData;
  installation: InstallationData;
  cutouts: CutoutRate[];
  specialFeatures: SpecialFeaturesData;
  gst: GstData;
}

const DEFAULT_STATE: WizardState = {
  cutting: { rate20mm: 17.5, rate40mm: 45.0 },
  edgeProfiles: {
    chargeExtra: true,
    profiles: [
      { name: 'Arris', rate20mm: 0, rate40mm: 0 },
      { name: 'Pencil Round', rate20mm: 0, rate40mm: 0 },
      { name: 'Bullnose', rate20mm: 15, rate40mm: 35 },
      { name: 'Ogee', rate20mm: 25, rate40mm: 50 },
      { name: 'Beveled', rate20mm: 20, rate40mm: 40 },
    ],
  },
  materialTypes: {
    chargeDifferent: false,
    multipliers: [
      { category: 'ENGINEERED', label: 'Engineered Quartz', multiplier: 1.0 },
      { category: 'NATURAL_SOFT', label: 'Soft Natural Stone', multiplier: 1.0 },
      { category: 'NATURAL_HARD', label: 'Hard Natural Stone', multiplier: 1.2 },
      { category: 'NATURAL_PREMIUM', label: 'Premium Natural', multiplier: 1.5 },
      { category: 'SINTERED', label: 'Sintered / Porcelain', multiplier: 1.3 },
    ],
  },
  installation: { rate20mm: 140, rate40mm: 170, noInstallation: false },
  cutouts: [
    { id: '', name: 'Hotplate', baseRate: 65 },
    { id: '', name: 'Power Outlet', baseRate: 25 },
    { id: '', name: 'Tap Hole', baseRate: 25 },
    { id: '', name: 'Drop-in Sink', baseRate: 65 },
    { id: '', name: 'Undermount Sink', baseRate: 300 },
    { id: '', name: 'Flush Cooktop', baseRate: 450 },
    { id: '', name: 'Basin', baseRate: 90 },
    { id: '', name: 'Drainer Grooves', baseRate: 150 },
  ],
  specialFeatures: {
    waterfall20mm: 300,
    waterfall40mm: 650,
    templatingEnabled: true,
    templatingFee: 150,
    deliveryEnabled: true,
    deliveryPerKm: 2.5,
  },
  gst: { gstRate: 10 },
};

const STEP_COUNT = 10;

// --- Helper ---

function currencyInput(
  value: number,
  onChange: (v: number) => void,
  label: string,
  disabled?: boolean
) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <div className="mt-1 relative rounded-md shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
          <span className="text-gray-500 sm:text-sm">$</span>
        </div>
        <input
          type="number"
          step="0.01"
          min="0"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          className="block w-full rounded-md border-gray-300 pl-7 pr-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500 disabled:bg-gray-100 disabled:text-gray-500"
        />
      </div>
    </label>
  );
}

// --- Step Components ---

function WizardStep0_Welcome({
  onNext,
  onSkip,
}: {
  onNext: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="text-center space-y-6 py-8">
      <h2 className="text-2xl font-bold text-gray-900">
        Let&apos;s set up your pricing
      </h2>
      <p className="text-gray-600 max-w-md mx-auto">
        This takes about 5 minutes. We&apos;ve pre-filled typical Queensland
        rates as a starting point. Just change anything that doesn&apos;t match
        how you work.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={onNext}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          Let&apos;s go &rarr;
        </button>
        <button
          onClick={onSkip}
          className="px-6 py-3 text-gray-600 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Skip &mdash; I&apos;ll do this later
        </button>
      </div>
    </div>
  );
}

function WizardStep1_Cutting({
  data,
  onChange,
}: {
  data: CuttingData;
  onChange: (d: CuttingData) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Cutting Rates</h2>
        <p className="text-sm text-gray-500 mt-1">
          Cutting applies to all 4 sides of every piece.
        </p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {currencyInput(data.rate20mm, (v) => onChange({ ...data, rate20mm: v }), '20mm rate (per lineal metre)')}
        {currencyInput(data.rate40mm, (v) => onChange({ ...data, rate40mm: v }), '40mm rate (per lineal metre)')}
      </div>
    </div>
  );
}

function WizardStep2_EdgeProfiles({
  data,
  onChange,
}: {
  data: EdgeProfilesData;
  onChange: (d: EdgeProfilesData) => void;
}) {
  const updateProfile = (idx: number, field: 'rate20mm' | 'rate40mm', value: number) => {
    const profiles = [...data.profiles];
    profiles[idx] = { ...profiles[idx], [field]: value };
    onChange({ ...data, profiles });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Edge Profiles</h2>
        <p className="text-sm text-gray-500 mt-1">
          These are surcharges added on top of your base edge rate.
        </p>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={data.chargeExtra}
          onChange={(e) => onChange({ ...data, chargeExtra: e.target.checked })}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700">
          Do you charge extra for decorative edge profiles?
        </span>
      </label>
      {data.chargeExtra && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
            <span>Profile</span>
            <span>20mm surcharge</span>
            <span>40mm surcharge</span>
          </div>
          {data.profiles.map((p, i) => (
            <div key={p.name} className="grid grid-cols-3 gap-4 items-center">
              <span className="text-sm font-medium text-gray-800">{p.name}</span>
              {currencyInput(p.rate20mm, (v) => updateProfile(i, 'rate20mm', v), '')}
              {currencyInput(p.rate40mm, (v) => updateProfile(i, 'rate40mm', v), '')}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WizardStep3_MaterialTypes({
  data,
  onChange,
  baseCuttingRate: baseRate,
}: {
  data: MaterialTypesData;
  onChange: (d: MaterialTypesData) => void;
  baseCuttingRate: number;
}) {
  const updateMultiplier = (idx: number, value: number) => {
    const multipliers = [...data.multipliers];
    multipliers[idx] = { ...multipliers[idx], multiplier: value };
    onChange({ ...data, multipliers });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Material Types</h2>
        <p className="text-sm text-gray-500 mt-1">
          Some materials are harder to cut and polish. Set multipliers to adjust
          rates for different stone types.
        </p>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={data.chargeDifferent}
          onChange={(e) => onChange({ ...data, chargeDifferent: e.target.checked })}
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700">
          Do you charge different rates for harder materials?
        </span>
      </label>
      {data.chargeDifferent && (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
            <span>Material</span>
            <span>Multiplier</span>
            <span>Effective 20mm rate</span>
          </div>
          {data.multipliers.map((m, i) => (
            <div key={m.category} className="grid grid-cols-3 gap-4 items-center">
              <span className="text-sm font-medium text-gray-800">{m.label}</span>
              {m.category === 'ENGINEERED' ? (
                <span className="text-sm text-gray-500 pl-1">&times; 1.0 (base)</span>
              ) : (
                <div className="relative rounded-md shadow-sm">
                  <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                    <span className="text-gray-500 sm:text-sm">&times;</span>
                  </div>
                  <input
                    type="number"
                    step="0.1"
                    min="1"
                    value={m.multiplier}
                    onChange={(e) => updateMultiplier(i, parseFloat(e.target.value) || 1)}
                    className="block w-full rounded-md border-gray-300 pl-7 pr-3 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
                  />
                </div>
              )}
              <span className="text-sm text-gray-600">
                ${(baseRate * m.multiplier).toFixed(2)}/Lm
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WizardStep4_Installation({
  data,
  onChange,
}: {
  data: InstallationData;
  onChange: (d: InstallationData) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Installation</h2>
        <p className="text-sm text-gray-500 mt-1">
          Rate per square metre for installing benchtops on site.
        </p>
      </div>
      <label className="flex items-center gap-3">
        <input
          type="checkbox"
          checked={data.noInstallation}
          onChange={(e) =>
            onChange({
              ...data,
              noInstallation: e.target.checked,
              rate20mm: e.target.checked ? 0 : 140,
              rate40mm: e.target.checked ? 0 : 170,
            })
          }
          className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
        />
        <span className="text-sm font-medium text-gray-700">
          I don&apos;t do installation
        </span>
      </label>
      {!data.noInstallation && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currencyInput(data.rate20mm, (v) => onChange({ ...data, rate20mm: v }), '20mm rate (per m²)')}
          {currencyInput(data.rate40mm, (v) => onChange({ ...data, rate40mm: v }), '40mm rate (per m²)')}
        </div>
      )}
    </div>
  );
}

function WizardStep5_Cutouts({
  data,
  onChange,
}: {
  data: CutoutRate[];
  onChange: (d: CutoutRate[]) => void;
}) {
  const updateRate = (idx: number, value: number) => {
    const updated = [...data];
    updated[idx] = { ...updated[idx], baseRate: value };
    onChange(updated);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Cutouts</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set your price for each type of cutout.
        </p>
      </div>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-4 text-xs font-medium text-gray-500 uppercase tracking-wider px-1">
          <span>Cutout type</span>
          <span>Price</span>
        </div>
        {data.map((c, i) => (
          <div key={c.name} className="grid grid-cols-2 gap-4 items-center">
            <span className="text-sm font-medium text-gray-800">{c.name}</span>
            {currencyInput(c.baseRate, (v) => updateRate(i, v), '')}
          </div>
        ))}
      </div>
    </div>
  );
}

function WizardStep6_SpecialFeatures({
  data,
  onChange,
}: {
  data: SpecialFeaturesData;
  onChange: (d: SpecialFeaturesData) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Special Features</h2>
      </div>

      {/* Waterfall ends */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold text-gray-800">Waterfall End Charges</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {currencyInput(data.waterfall20mm, (v) => onChange({ ...data, waterfall20mm: v }), '20mm (per end)')}
          {currencyInput(data.waterfall40mm, (v) => onChange({ ...data, waterfall40mm: v }), '40mm (per end)')}
        </div>
      </fieldset>

      {/* Templating */}
      <fieldset className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={data.templatingEnabled}
            onChange={(e) => onChange({ ...data, templatingEnabled: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Charge a templating fee
          </span>
        </label>
        {data.templatingEnabled &&
          currencyInput(data.templatingFee, (v) => onChange({ ...data, templatingFee: v }), 'Templating fee (fixed)')}
      </fieldset>

      {/* Delivery */}
      <fieldset className="space-y-3">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={data.deliveryEnabled}
            onChange={(e) => onChange({ ...data, deliveryEnabled: e.target.checked })}
            className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
          />
          <span className="text-sm font-medium text-gray-700">
            Charge for delivery
          </span>
        </label>
        {data.deliveryEnabled &&
          currencyInput(data.deliveryPerKm, (v) => onChange({ ...data, deliveryPerKm: v }), 'Delivery rate (per km)')}
      </fieldset>
    </div>
  );
}

function WizardStep7_GST({
  data,
  onChange,
}: {
  data: GstData;
  onChange: (d: GstData) => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">GST</h2>
        <p className="text-sm text-gray-500 mt-1">
          Set your GST rate. This is applied to the total quote amount.
        </p>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-gray-700">GST Rate (%)</span>
        <div className="mt-1 relative rounded-md shadow-sm max-w-xs">
          <input
            type="number"
            step="0.1"
            min="0"
            max="100"
            value={data.gstRate}
            onChange={(e) => onChange({ gstRate: parseFloat(e.target.value) || 0 })}
            className="block w-full rounded-md border-gray-300 pr-8 py-2 text-sm focus:border-primary-500 focus:ring-primary-500"
          />
          <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
            <span className="text-gray-500 sm:text-sm">%</span>
          </div>
        </div>
      </label>
    </div>
  );
}

function WizardStep8_SanityCheck({ state }: { state: WizardState }) {
  // Hard-coded sample pieces
  const pieces = [
    { name: 'Main Benchtop', widthMm: 3000, depthMm: 600, thickness: 20 as const },
    { name: 'Island', widthMm: 2400, depthMm: 900, thickness: 20 as const },
    { name: 'Splashback', widthMm: 3000, depthMm: 600, thickness: 20 as const },
  ];

  const cuttingRate = state.cutting.rate20mm;
  const installRate = state.installation.rate20mm;

  let totalCutting = 0;
  let totalEdge = 0;
  let totalInstall = 0;

  for (const p of pieces) {
    const perimeterLm = ((p.widthMm + p.depthMm) * 2) / 1000;
    const areaSqm = (p.widthMm * p.depthMm) / 1_000_000;
    totalCutting += perimeterLm * cuttingRate;
    // Finished edge = front edge (width) only
    const finishedEdgeLm = p.widthMm / 1000;
    // Base edge rate (Arris = $0 surcharge assumed)
    totalEdge += finishedEdgeLm * 0; // base profiles at $0
    totalInstall += areaSqm * installRate;
  }

  const subtotal = totalCutting + totalEdge + totalInstall;
  const gstAmount = subtotal * (state.gst.gstRate / 100);
  const total = subtotal + gstAmount;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Sanity Check</h2>
        <p className="text-sm text-gray-500 mt-1">
          Here&apos;s a sample quote using the rates you&apos;ve entered. Does
          this look about right for a typical kitchen job?
        </p>
      </div>

      <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
        <div className="font-semibold text-gray-800 border-b pb-2 mb-2">
          Sample: 3 pieces — Engineered Quartz, 20mm
        </div>
        {pieces.map((p) => (
          <div key={p.name} className="text-gray-600">
            {p.name}: {p.widthMm} &times; {p.depthMm}mm
          </div>
        ))}
      </div>

      <table className="w-full text-sm">
        <tbody className="divide-y divide-gray-200">
          <tr>
            <td className="py-2 text-gray-700">Cutting (total perimeter)</td>
            <td className="py-2 text-right font-medium">${totalCutting.toFixed(2)}</td>
          </tr>
          <tr>
            <td className="py-2 text-gray-700">Edge profiles (finished edges)</td>
            <td className="py-2 text-right font-medium">${totalEdge.toFixed(2)}</td>
          </tr>
          <tr>
            <td className="py-2 text-gray-700">Installation (total area)</td>
            <td className="py-2 text-right font-medium">${totalInstall.toFixed(2)}</td>
          </tr>
          <tr className="border-t-2 border-gray-300">
            <td className="py-2 text-gray-700 font-semibold">Subtotal</td>
            <td className="py-2 text-right font-semibold">${subtotal.toFixed(2)}</td>
          </tr>
          <tr>
            <td className="py-2 text-gray-700">GST ({state.gst.gstRate}%)</td>
            <td className="py-2 text-right font-medium">${gstAmount.toFixed(2)}</td>
          </tr>
          <tr className="border-t-2 border-gray-900">
            <td className="py-2 text-gray-900 font-bold text-base">Total</td>
            <td className="py-2 text-right font-bold text-base">${total.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function WizardStep9_Done() {
  const router = useRouter();

  return (
    <div className="text-center space-y-6 py-8">
      <div className="text-5xl">&#10003;</div>
      <h2 className="text-2xl font-bold text-gray-900">You&apos;re all set</h2>
      <p className="text-gray-600">Your pricing is configured.</p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <button
          onClick={() => router.push('/quotes/new')}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg font-medium hover:bg-primary-700 transition-colors"
        >
          Create your first quote
        </button>
        <button
          onClick={() => router.push('/admin/pricing')}
          className="px-6 py-3 text-gray-600 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 transition-colors"
        >
          Review pricing in detail
        </button>
      </div>
    </div>
  );
}

// --- Progress Bar ---

function ProgressBar({ currentStep, totalSteps }: { currentStep: number; totalSteps: number }) {
  // Don't show on welcome (0) or done (9)
  if (currentStep === 0 || currentStep === totalSteps - 1) return null;

  const progress = ((currentStep) / (totalSteps - 2)) * 100;

  return (
    <div className="w-full">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span>Step {currentStep} of {totalSteps - 2}</span>
        <span>{Math.round(progress)}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-primary-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

// --- Main Wizard Component ---

export default function PricingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRecalibrate = searchParams.get('mode') === 'recalibrate';

  const [currentStep, setCurrentStep] = useState(0);
  const [state, setState] = useState<WizardState>(DEFAULT_STATE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sanityOk, setSanityOk] = useState<boolean | null>(null);

  // Fetch existing data on mount for recalibrate mode
  const loadExistingData = useCallback(async () => {
    if (!isRecalibrate) return;

    try {
      const [settingsRes, serviceRatesRes, edgeTypesRes, cutoutTypesRes] = await Promise.all([
        fetch('/api/admin/pricing/settings'),
        fetch('/api/admin/pricing/service-rates'),
        fetch('/api/admin/pricing/edge-types'),
        fetch('/api/admin/pricing/cutout-types'),
      ]);

      const settings = await settingsRes.json();
      const serviceRates = await serviceRatesRes.json();
      const edgeTypes = await edgeTypesRes.json();
      const cutoutTypes = await cutoutTypesRes.json();

      // Map service rates
      const cuttingRates = Array.isArray(serviceRates)
        ? serviceRates.filter((r: Record<string, unknown>) => r.serviceType === 'CUTTING' && r.fabricationCategory === 'ENGINEERED')
        : [];
      const installRates = Array.isArray(serviceRates)
        ? serviceRates.filter((r: Record<string, unknown>) => r.serviceType === 'INSTALLATION' && r.fabricationCategory === 'ENGINEERED')
        : [];
      const waterfallRates = Array.isArray(serviceRates)
        ? serviceRates.filter((r: Record<string, unknown>) => r.serviceType === 'WATERFALL_END' && r.fabricationCategory === 'ENGINEERED')
        : [];
      const templatingRates = Array.isArray(serviceRates)
        ? serviceRates.filter((r: Record<string, unknown>) => r.serviceType === 'TEMPLATING' && r.fabricationCategory === 'ENGINEERED')
        : [];
      const deliveryRates = Array.isArray(serviceRates)
        ? serviceRates.filter((r: Record<string, unknown>) => r.serviceType === 'DELIVERY' && r.fabricationCategory === 'ENGINEERED')
        : [];

      const newState: WizardState = { ...DEFAULT_STATE };

      if (cuttingRates.length > 0) {
        newState.cutting = {
          rate20mm: Number(cuttingRates[0].rate20mm) || DEFAULT_STATE.cutting.rate20mm,
          rate40mm: Number(cuttingRates[0].rate40mm) || DEFAULT_STATE.cutting.rate40mm,
        };
      }

      if (installRates.length > 0) {
        const r20 = Number(installRates[0].rate20mm);
        const r40 = Number(installRates[0].rate40mm);
        newState.installation = {
          rate20mm: r20,
          rate40mm: r40,
          noInstallation: r20 === 0 && r40 === 0,
        };
      }

      // Edge profiles from categoryRates
      if (Array.isArray(edgeTypes)) {
        const profiles: EdgeProfileRate[] = edgeTypes
          .filter((et: Record<string, unknown>) => et.isActive)
          .map((et: Record<string, unknown>) => {
            const engRate = Array.isArray(et.categoryRates)
              ? (et.categoryRates as Array<{ fabricationCategory: string; rate20mm: unknown; rate40mm: unknown }>)
                  .find((cr) => cr.fabricationCategory === 'ENGINEERED')
              : undefined;
            return {
              name: et.name as string,
              rate20mm: engRate ? Number(engRate.rate20mm) : 0,
              rate40mm: engRate ? Number(engRate.rate40mm) : 0,
            };
          });
        if (profiles.length > 0) {
          newState.edgeProfiles = {
            chargeExtra: profiles.some((p) => p.rate20mm > 0 || p.rate40mm > 0),
            profiles,
          };
        }
      }

      // Cutout types
      if (Array.isArray(cutoutTypes) && cutoutTypes.length > 0) {
        newState.cutouts = cutoutTypes.map((ct: Record<string, unknown>) => ({
          id: ct.id as string,
          name: ct.name as string,
          baseRate: Number(ct.baseRate) || 0,
        }));
      }

      // Special features
      if (waterfallRates.length > 0) {
        newState.specialFeatures.waterfall20mm = Number(waterfallRates[0].rate20mm) || DEFAULT_STATE.specialFeatures.waterfall20mm;
        newState.specialFeatures.waterfall40mm = Number(waterfallRates[0].rate40mm) || DEFAULT_STATE.specialFeatures.waterfall40mm;
      }
      if (templatingRates.length > 0) {
        newState.specialFeatures.templatingEnabled = Number(templatingRates[0].rate20mm) > 0;
        newState.specialFeatures.templatingFee = Number(templatingRates[0].rate20mm) || DEFAULT_STATE.specialFeatures.templatingFee;
      }
      if (deliveryRates.length > 0) {
        newState.specialFeatures.deliveryEnabled = Number(deliveryRates[0].rate20mm) > 0;
        newState.specialFeatures.deliveryPerKm = Number(deliveryRates[0].rate20mm) || DEFAULT_STATE.specialFeatures.deliveryPerKm;
      }

      // GST
      if (settings.gstRate !== undefined) {
        newState.gst = { gstRate: Number(settings.gstRate) * 100 };
      }

      // Material multipliers from service rates
      if (Array.isArray(serviceRates)) {
        const cuttingByCategory = serviceRates.filter(
          (r: Record<string, unknown>) => r.serviceType === 'CUTTING'
        );
        if (cuttingByCategory.length > 1) {
          const baseRate20 = Number(
            cuttingByCategory.find((r: Record<string, unknown>) => r.fabricationCategory === 'ENGINEERED')?.rate20mm
          ) || newState.cutting.rate20mm;

          newState.materialTypes = {
            chargeDifferent: true,
            multipliers: newState.materialTypes.multipliers.map((m) => {
              const match = cuttingByCategory.find(
                (r: Record<string, unknown>) => r.fabricationCategory === m.category
              );
              if (match && baseRate20 > 0) {
                return { ...m, multiplier: Number(Number(match.rate20mm) / baseRate20).toFixed(1) as unknown as number };
              }
              return m;
            }),
          };
        }
      }

      setState(newState);
    } catch (err) {
      console.error('Failed to load existing pricing data:', err);
    }
  }, [isRecalibrate]);

  // Load cutout types on mount (for fresh wizard too — get IDs)
  const loadCutoutTypes = useCallback(async () => {
    if (isRecalibrate) return; // handled in loadExistingData
    try {
      const res = await fetch('/api/admin/pricing/cutout-types');
      if (res.ok) {
        const cutoutTypes = await res.json();
        if (Array.isArray(cutoutTypes) && cutoutTypes.length > 0) {
          setState((prev) => ({
            ...prev,
            cutouts: cutoutTypes.map((ct: Record<string, unknown>) => {
              const existing = prev.cutouts.find((c) => c.name === ct.name);
              return {
                id: ct.id as string,
                name: ct.name as string,
                baseRate: existing ? existing.baseRate : Number(ct.baseRate) || 0,
              };
            }),
          }));
        }
      }
    } catch {
      // Use defaults if fetch fails
    }
  }, [isRecalibrate]);

  useEffect(() => {
    loadExistingData();
    loadCutoutTypes();
  }, [loadExistingData, loadCutoutTypes]);

  const saveStep = async (step: number) => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/pricing/wizard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ step, data: getStepData(step) }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to save');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const getStepData = (step: number) => {
    switch (step) {
      case 1: return state.cutting;
      case 2: return state.edgeProfiles;
      case 3: return { ...state.materialTypes, baseCuttingRate20mm: state.cutting.rate20mm, baseCuttingRate40mm: state.cutting.rate40mm };
      case 4: return state.installation;
      case 5: return state.cutouts;
      case 6: return state.specialFeatures;
      case 7: return state.gst;
      default: return {};
    }
  };

  const handleNext = async () => {
    if (currentStep >= 1 && currentStep <= 7) {
      try {
        await saveStep(currentStep);
      } catch {
        return; // Don't advance if save failed
      }
    }
    setCurrentStep((s) => Math.min(s + 1, STEP_COUNT - 1));
  };

  const handleBack = () => {
    setCurrentStep((s) => Math.max(s - 1, 0));
  };

  const handleSkip = () => {
    router.push('/admin/pricing');
  };

  const handleSanityYes = () => {
    setSanityOk(true);
    setCurrentStep(9);
  };

  const handleSanityNo = () => {
    setSanityOk(false);
  };

  const jumpToStep = (step: number) => {
    setSanityOk(null);
    setCurrentStep(step);
  };

  const STEP_LABELS = [
    'Welcome',
    'Cutting',
    'Edge Profiles',
    'Material Types',
    'Installation',
    'Cutouts',
    'Special Features',
    'GST',
    'Sanity Check',
    'Done',
  ];

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return <WizardStep0_Welcome onNext={handleNext} onSkip={handleSkip} />;
      case 1:
        return <WizardStep1_Cutting data={state.cutting} onChange={(d) => setState((s) => ({ ...s, cutting: d }))} />;
      case 2:
        return <WizardStep2_EdgeProfiles data={state.edgeProfiles} onChange={(d) => setState((s) => ({ ...s, edgeProfiles: d }))} />;
      case 3:
        return <WizardStep3_MaterialTypes data={state.materialTypes} onChange={(d) => setState((s) => ({ ...s, materialTypes: d }))} baseCuttingRate={state.cutting.rate20mm} />;
      case 4:
        return <WizardStep4_Installation data={state.installation} onChange={(d) => setState((s) => ({ ...s, installation: d }))} />;
      case 5:
        return <WizardStep5_Cutouts data={state.cutouts} onChange={(d) => setState((s) => ({ ...s, cutouts: d }))} />;
      case 6:
        return <WizardStep6_SpecialFeatures data={state.specialFeatures} onChange={(d) => setState((s) => ({ ...s, specialFeatures: d }))} />;
      case 7:
        return <WizardStep7_GST data={state.gst} onChange={(d) => setState((s) => ({ ...s, gst: d }))} />;
      case 8:
        return <WizardStep8_SanityCheck state={state} />;
      case 9:
        return <WizardStep9_Done />;
      default:
        return null;
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">
          {isRecalibrate ? 'Recalibrate Pricing' : 'Pricing Setup'}
        </h1>
      </div>

      <ProgressBar currentStep={currentStep} totalSteps={STEP_COUNT} />

      <div className="bg-white rounded-lg shadow p-6">
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {error}
          </div>
        )}

        {renderStep()}

        {/* Navigation buttons — not on welcome or done */}
        {currentStep > 0 && currentStep < STEP_COUNT - 1 && (
          <div className="mt-8 flex justify-between">
            <button
              onClick={handleBack}
              className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              &larr; Back
            </button>

            {currentStep === 8 ? (
              <div className="flex gap-3">
                {sanityOk === false ? (
                  <div className="flex flex-col items-end gap-2">
                    <span className="text-sm text-gray-600">Jump back to:</span>
                    <div className="flex flex-wrap gap-2 justify-end">
                      {STEP_LABELS.slice(1, 8).map((label, i) => (
                        <button
                          key={label}
                          onClick={() => jumpToStep(i + 1)}
                          className="px-3 py-1 text-xs font-medium text-primary-700 bg-primary-50 border border-primary-200 rounded-lg hover:bg-primary-100 transition-colors"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <button
                      onClick={handleSanityNo}
                      className="px-4 py-2 text-sm font-medium text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                    >
                      No &mdash; something seems off
                    </button>
                    <button
                      onClick={handleSanityYes}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 transition-colors"
                    >
                      Yes, looks right &rarr;
                    </button>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={handleNext}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors"
              >
                {saving ? 'Saving...' : 'Next \u2192'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
