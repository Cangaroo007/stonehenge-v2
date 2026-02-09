import { NextRequest, NextResponse } from 'next/server';
import {
  calculateDistance,
  getDeliveryZone,
  calculateDeliveryCost,
  calculateTemplatingCost,
} from '@/lib/services/distance-service';

const ORIGIN_ADDRESS =
  process.env.COMPANY_ADDRESS ||
  '20 Hitech Drive, KUNDA PARK Queensland 4556, Australia';

// Hardcoded zones matching seed data until DeliveryZone model is added to Prisma
const DELIVERY_ZONES = [
  {
    id: '1',
    name: 'Local',
    maxDistanceKm: 30,
    baseCharge: 50.0,
    ratePerKm: 2.5,
    isActive: true,
  },
  {
    id: '2',
    name: 'Regional',
    maxDistanceKm: 100,
    baseCharge: 75.0,
    ratePerKm: 3.0,
    isActive: true,
  },
  {
    id: '3',
    name: 'Remote',
    maxDistanceKm: 500,
    baseCharge: 100.0,
    ratePerKm: 3.5,
    isActive: true,
  },
];

const TEMPLATING_RATE = {
  id: '1',
  baseCharge: 150.0,
  ratePerKm: 2.0,
};

/**
 * POST /api/distance/calculate
 * Accepts { destination: string } and returns distance, zone, and cost data.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { destination } = body;

    if (!destination || typeof destination !== 'string') {
      return NextResponse.json(
        { error: 'destination is required and must be a string' },
        { status: 400 }
      );
    }

    const distanceResult = await calculateDistance(ORIGIN_ADDRESS, destination);

    const zone = getDeliveryZone(distanceResult.distanceKm, DELIVERY_ZONES);

    const deliveryCost = zone
      ? calculateDeliveryCost(distanceResult.distanceKm, zone)
      : null;

    const templatingCost = calculateTemplatingCost(
      distanceResult.distanceKm,
      TEMPLATING_RATE
    );

    return NextResponse.json({
      distanceKm: distanceResult.distanceKm,
      durationMinutes: distanceResult.durationMinutes,
      originAddress: distanceResult.originAddress,
      destinationAddress: distanceResult.destinationAddress,
      deliveryZone: zone
        ? {
            id: Number(zone.id),
            name: zone.name,
            maxDistanceKm: zone.maxDistanceKm,
            ratePerKm: Number(zone.ratePerKm),
            baseCharge: Number(zone.baseCharge),
          }
        : null,
      deliveryCost,
      templatingCost,
    });
  } catch (error) {
    console.error('Distance calculation error:', error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : 'Failed to calculate distance',
      },
      { status: 500 }
    );
  }
}
