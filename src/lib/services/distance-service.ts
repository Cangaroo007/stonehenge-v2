import { Client, TravelMode, UnitSystem } from '@googlemaps/google-maps-services-js';
import { DeliveryZone, TemplatingRate } from '@prisma/client';

const client = new Client({});

export interface DistanceResult {
  distanceKm: number;
  durationMinutes: number;
  originAddress: string;
  destinationAddress: string;
}

/**
 * Calculate distance between two addresses using Google Maps API
 */
export async function calculateDistance(
  origin: string,
  destination: string
): Promise<DistanceResult> {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  
  if (!apiKey || apiKey === 'dummy_key' || apiKey === 'your_api_key_here') {
    // Return mock data when API key is not configured
    console.warn('GOOGLE_MAPS_API_KEY not configured, returning mock distance data');
    return {
      distanceKm: 10, // Mock 10km
      durationMinutes: 15, // Mock 15 minutes
      originAddress: origin,
      destinationAddress: destination
    };
  }
  
  try {
    const response = await client.distancematrix({
      params: {
        origins: [origin],
        destinations: [destination],
        key: apiKey,
        units: UnitSystem.metric,
        mode: TravelMode.driving
      }
    });
    
    const element = response.data.rows[0]?.elements[0];
    
    if (!element || element.status !== 'OK') {
      throw new Error(`Distance calculation failed: ${element?.status || 'Unknown error'}`);
    }
    
    return {
      distanceKm: element.distance.value / 1000,  // Convert meters to km
      durationMinutes: Math.ceil(element.duration.value / 60),  // Convert seconds to minutes
      originAddress: response.data.origin_addresses[0],
      destinationAddress: response.data.destination_addresses[0]
    };
  } catch (error: any) {
    console.error('Google Maps API error:', error);
    throw new Error(`Failed to calculate distance: ${error.message}`);
  }
}

/**
 * Determine which delivery zone applies based on distance
 * Returns the first zone where distance is within maxDistanceKm
 */
export function getDeliveryZone(
  distanceKm: number,
  zones: DeliveryZone[]
): DeliveryZone | null {
  // Sort by maxDistanceKm ascending to find the smallest matching zone
  const sortedZones = zones
    .filter(z => z.isActive)
    .sort((a, b) => a.maxDistanceKm - b.maxDistanceKm);
  
  for (const zone of sortedZones) {
    if (distanceKm <= zone.maxDistanceKm) {
      return zone;
    }
  }
  
  return null; // Beyond all zones - requires custom quote
}

/**
 * Calculate delivery cost based on zone and distance
 * Formula: Base Charge + (Distance × Rate per km)
 */
export function calculateDeliveryCost(
  distanceKm: number,
  zone: DeliveryZone
): number {
  return Number(zone.baseCharge) + (distanceKm * Number(zone.ratePerKm));
}

/**
 * Calculate templating cost based on distance
 * Formula: Base Charge + (Distance × Rate per km)
 */
export function calculateTemplatingCost(
  distanceKm: number,
  rate: TemplatingRate
): number {
  return Number(rate.baseCharge) + (distanceKm * Number(rate.ratePerKm));
}
