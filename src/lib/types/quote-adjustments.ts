export interface QuoteCustomCharge {
  id: number;
  quoteId: number;
  description: string;
  amount: number; // always positive (addition to quote)
  sortOrder: number;
}

export type DiscountType = 'PERCENTAGE' | 'ABSOLUTE';
export type DiscountAppliesTo = 'ALL' | 'FABRICATION_ONLY';

export interface QuoteDiscount {
  type: DiscountType;
  value: number; // percentage (0-100) or absolute dollar amount
  appliesTo: DiscountAppliesTo;
}
