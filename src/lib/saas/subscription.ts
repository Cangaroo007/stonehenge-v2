/**
 * SaaS Subscription & Multi-Tenant Configuration
 * 
 * This module handles the SaaS subscription model for Stonehenge.
 * Supports multiple pricing tiers with feature gating.
 */

import { Decimal } from '@prisma/client/runtime/library';

// ============================================================================
// SaaS Subscription Tiers
// ============================================================================

export type SubscriptionTier = 'STARTER' | 'PROFESSIONAL' | 'ENTERPRISE' | 'WHITE_LABEL';

export interface SubscriptionPlan {
  tier: SubscriptionTier;
  name: string;
  monthlyPrice: Decimal;
  annualPrice: Decimal;
  piece_features: SubscriptionFeatures;
  limits: SubscriptionLimits;
}

export interface SubscriptionFeatures {
  // Core features
  maxUsers: number | 'unlimited';
  maxQuotesPerMonth: number | 'unlimited';
  maxProjects: number | 'unlimited';
  
  // Advanced features
  unitBlockSupport: boolean;
  visualLayoutTool: boolean;
  apiAccess: boolean;
  whiteLabel: boolean;
  customDomain: boolean;
  advancedReporting: boolean;
  
  // Integrations
  googleMapsIntegration: boolean;
  accountingIntegrations: ('XERO' | 'MYOB' | 'QUICKBOOKS')[];
  
  // Support
  supportLevel: 'EMAIL' | 'PRIORITY' | 'DEDICATED';
  onboardingIncluded: boolean;
}

export interface SubscriptionLimits {
  storageGb: number;
  maxFileUploadSizeMb: number;
  apiCallsPerDay: number | 'unlimited';
  concurrentUsers: number;
}

// ============================================================================
// SaaS Plan Definitions
// ============================================================================

export const SAAS_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  STARTER: {
    tier: 'STARTER',
    name: 'Starter',
    monthlyPrice: new Decimal(79),
    annualPrice: new Decimal(790),
    piece_features: {
      maxUsers: 3,
      maxQuotesPerMonth: 50,
      maxProjects: 10,
      unitBlockSupport: false,
      visualLayoutTool: false,
      apiAccess: false,
      whiteLabel: false,
      customDomain: false,
      advancedReporting: false,
      googleMapsIntegration: true,
      accountingIntegrations: [],
      supportLevel: 'EMAIL',
      onboardingIncluded: false,
    },
    limits: {
      storageGb: 10,
      maxFileUploadSizeMb: 25,
      apiCallsPerDay: 0,
      concurrentUsers: 3,
    },
  },
  
  PROFESSIONAL: {
    tier: 'PROFESSIONAL',
    name: 'Professional',
    monthlyPrice: new Decimal(199),
    annualPrice: new Decimal(1990),
    piece_features: {
      maxUsers: 10,
      maxQuotesPerMonth: 200,
      maxProjects: 'unlimited',
      unitBlockSupport: true,
      visualLayoutTool: true,
      apiAccess: true,
      whiteLabel: false,
      customDomain: false,
      advancedReporting: true,
      googleMapsIntegration: true,
      accountingIntegrations: ['XERO'],
      supportLevel: 'PRIORITY',
      onboardingIncluded: true,
    },
    limits: {
      storageGb: 50,
      maxFileUploadSizeMb: 100,
      apiCallsPerDay: 1000,
      concurrentUsers: 10,
    },
  },
  
  ENTERPRISE: {
    tier: 'ENTERPRISE',
    name: 'Enterprise',
    monthlyPrice: new Decimal(499),
    annualPrice: new Decimal(4990),
    piece_features: {
      maxUsers: 'unlimited' as any,
      maxQuotesPerMonth: 'unlimited',
      maxProjects: 'unlimited',
      unitBlockSupport: true,
      visualLayoutTool: true,
      apiAccess: true,
      whiteLabel: false,
      customDomain: true,
      advancedReporting: true,
      googleMapsIntegration: true,
      accountingIntegrations: ['XERO', 'MYOB', 'QUICKBOOKS'],
      supportLevel: 'DEDICATED',
      onboardingIncluded: true,
    },
    limits: {
      storageGb: 500,
      maxFileUploadSizeMb: 500,
      apiCallsPerDay: 'unlimited',
      concurrentUsers: 'unlimited' as any,
    },
  },
  
  WHITE_LABEL: {
    tier: 'WHITE_LABEL',
    name: 'White Label',
    monthlyPrice: new Decimal(999),
    annualPrice: new Decimal(9990),
    piece_features: {
      maxUsers: 'unlimited' as any,
      maxQuotesPerMonth: 'unlimited',
      maxProjects: 'unlimited',
      unitBlockSupport: true,
      visualLayoutTool: true,
      apiAccess: true,
      whiteLabel: true,
      customDomain: true,
      advancedReporting: true,
      googleMapsIntegration: true,
      accountingIntegrations: ['XERO', 'MYOB', 'QUICKBOOKS'],
      supportLevel: 'DEDICATED',
      onboardingIncluded: true,
    },
    limits: {
      storageGb: 1000,
      maxFileUploadSizeMb: 1000,
      apiCallsPerDay: 'unlimited',
      concurrentUsers: 'unlimited' as any,
    },
  },
};

// ============================================================================
// Company-Specific Pricing Configuration
// ============================================================================

/**
 * Each stone mason company can configure their own pricing strategies.
 * This is separate from the SaaS subscription tier.
 */
export interface CompanyPricingConfig {
  companyId: string;
  
  // Material pricing strategy
  materialPricingStrategy: MaterialPricingStrategy;
  
  // Service measurement units
  serviceUnits: ServiceUnitConfig;
  
  // Wastage handling
  wastageConfig: WastageConfig;
  
  // Additional pricing options
  pricingOptions: PricingOptions;
}

export type MaterialPricingStrategy = 
  | 'PER_SQUARE_METER_USED'      // Charge only for material used
  | 'PER_SQUARE_METER_WITH_WASTAGE'  // Charge for material + standard wastage
  | 'PER_WHOLE_SLAB'             // Charge full slab price regardless of usage
  | 'PER_WHOLE_SLAB_WITH_REMNANT_CREDIT';  // Full slab but credit usable remnants

export interface ServiceUnitConfig {
  cutting: 'LINEAR_METER' | 'SQUARE_METER' | 'FIXED_PER_PIECE';
  polishing: 'LINEAR_METER' | 'SQUARE_METER' | 'FIXED_PER_PIECE';
  installation: 'SQUARE_METER' | 'LINEAR_METER' | 'FIXED_PER_PIECE' | 'HOURLY';
  templating: 'FIXED' | 'PER_KILOMETER' | 'SQUARE_METER';
  delivery: 'FIXED_ZONE' | 'PER_KILOMETER' | 'WEIGHT_BASED';
}

export interface WastageConfig {
  // Standard wastage percentage added to material calculations
  standardWastagePercent: number;
  
  // Minimum charge threshold (e.g., always charge for at least 0.5m²)
  minimumChargeableAreaSqm: number;
  
  // Remnant tracking and credit
  trackRemnants: boolean;
  remnantCreditPercent: number;  // % of remnant value credited back
  minimumRemnantSizeSqm: number; // Remnants smaller than this aren't tracked
  
  // Slab optimization preferences
  optimizationStrategy: 'MINIMIZE_WASTE' | 'MINIMIZE_SLABS' | 'BALANCE';
}

export interface PricingOptions {
  // Edge pricing
  edgePricingIncludesPolishing: boolean;  // If true, edges include base polishing
  
  // Cutout pricing
  cutoutPricingIncludesEdgeFinishing: boolean;
  
  // Minimum charges
  minimumQuoteValue: Decimal;
  minimumPieceCharge: Decimal;
  
  // Rounding
  roundToNearest: 'CENT' | 'DOLLAR' | 'FIVE_DOLLARS';
  
  // Tax
  tax_rate: Decimal;
  taxInclusive: boolean;  // If true, display prices include tax
  
  // Display
  showBreakdownToCustomer: boolean;
  showWastageInQuote: boolean;
}

// ============================================================================
// Feature Gating
// ============================================================================

export class FeatureGate {
  private plan: SubscriptionPlan;
  
  constructor(tier: SubscriptionTier) {
    this.plan = SAAS_PLANS[tier];
  }
  
  canUseUnitBlocks(): boolean {
    return this.plan.features.unitBlockSupport;
  }
  
  canUseVisualLayout(): boolean {
    return this.plan.features.visualLayoutTool;
  }
  
  canUseAPI(): boolean {
    return this.plan.features.apiAccess;
  }
  
  canAddUser(currentUserCount: number): boolean {
    const max = this.plan.features.maxUsers;
    if (max === 'unlimited') return true;
    return currentUserCount < (max as number);
  }
  
  canCreateQuote(currentMonthCount: number): boolean {
    const max = this.plan.features.maxQuotesPerMonth;
    if (max === 'unlimited') return true;
    return currentMonthCount < (max as number);
  }
  
  getStorageLimitGb(): number {
    return this.plan.limits.storageGb;
  }
}

// ============================================================================
// Usage Tracking
// ============================================================================

export interface CompanyUsage {
  companyId: string;
  subscriptionTier: SubscriptionTier;
  
  // Current period usage
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  
  // Usage metrics
  quotesCreatedThisMonth: number;
  usersActive: number;
  storageUsedGb: number;
  apiCallsToday: number;
  
  // Check if limits exceeded
  isWithinLimits(): boolean;
  getWarnings(): string[];
}

// ============================================================================
// Helper Functions
// ============================================================================

export function getPlanFeatures(tier: SubscriptionTier): SubscriptionFeatures {
  return SAAS_PLANS[tier].features;
}

export function getPlanLimits(tier: SubscriptionTier): SubscriptionLimits {
  return SAAS_PLANS[tier].limits;
}

export function getMonthlyPrice(tier: SubscriptionTier): Decimal {
  return SAAS_PLANS[tier].monthlyPrice;
}

export function getAnnualSavings(tier: SubscriptionTier): Decimal {
  const plan = SAAS_PLANS[tier];
  const monthlyCost = plan.monthlyPrice.times(12);
  return monthlyCost.minus(plan.annualPrice);
}

/**
 * Default pricing configuration for new companies
 */
export function getDefaultCompanyPricingConfig(companyId: string): CompanyPricingConfig {
  return {
    companyId,
    materialPricingStrategy: 'PER_SQUARE_METER_WITH_WASTAGE',
    serviceUnits: {
      cutting: 'LINEAR_METER',
      polishing: 'LINEAR_METER',
      installation: 'SQUARE_METER',
      templating: 'PER_KILOMETER',
      delivery: 'PER_KILOMETER',
    },
    wastageConfig: {
      standardWastagePercent: 15,
      minimumChargeableAreaSqm: 0.5,
      trackRemnants: false,
      remnantCreditPercent: 0,
      minimumRemnantSizeSqm: 0.5,
      optimizationStrategy: 'BALANCE',
    },
    pricingOptions: {
      edgePricingIncludesPolishing: false,
      cutoutPricingIncludesEdgeFinishing: false,
      minimumQuoteValue: new Decimal(0),
      minimumPieceCharge: new Decimal(0),
      roundToNearest: 'CENT',
      tax_rate: new Decimal(10),
      taxInclusive: false,
      showBreakdownToCustomer: true,
      showWastageInQuote: false,
    },
  };
}
