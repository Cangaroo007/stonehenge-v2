export interface CustomerLocationData {
  id: number;
  customerId: number;
  label: string | null;
  addressLine1: string;
  addressLine2: string | null;
  suburb: string;
  state: string;
  postcode: string;
  country: string;
  isDefault: boolean;
  notes: string | null;
}

export interface CreateCustomerLocationInput {
  customerId: number;
  label?: string;
  addressLine1: string;
  addressLine2?: string;
  suburb: string;
  state: string;
  postcode: string;
  country?: string;
  isDefault?: boolean;
  notes?: string;
}

export interface UpdateCustomerLocationInput {
  label?: string | null;
  addressLine1?: string;
  addressLine2?: string | null;
  suburb?: string;
  state?: string;
  postcode?: string;
  country?: string;
  isDefault?: boolean;
  notes?: string | null;
}

/**
 * Formats an Australian address for display.
 * Output: "123 Main Street\nUnit 4\nBrisbane QLD 4000"
 */
export function formatAustralianAddress(location: CustomerLocationData): string {
  const lines = [location.addressLine1];
  if (location.addressLine2) lines.push(location.addressLine2);
  lines.push(`${location.suburb} ${location.state} ${location.postcode}`);
  return lines.join('\n');
}
