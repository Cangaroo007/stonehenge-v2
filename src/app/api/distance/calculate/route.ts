import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuthLegacy as requireAuth } from '@/lib/auth';
import { 
  calculateDistance, 
  getDeliveryZone, 
  calculateDeliveryCost,
  calculateTemplatingCost 
} from '@/lib/services/distance-service';

// POST /api/distance/calculate
export async function POST(request: NextRequest) {
  try {
    const user = await requireAuth(request);
    
    const { destination } = await request.json();
    
    if (!destination) {
      return NextResponse.json(
        { error: 'destination address is required' },
        { status: 400 }
      );
    }
    
    // Get user's company and workshop address
    const userWithCompany = await prisma.user.findUnique({
      where: { id: user.id },
      include: { company: true }
    });
    
    if (!userWithCompany?.company) {
      return NextResponse.json(
        { error: 'User is not associated with a company' },
        { status: 400 }
      );
    }
    
    const origin = userWithCompany.company.workshopAddress;
    
    // Calculate distance using Google Maps
    const distanceResult = await calculateDistance(origin, destination);
    
    // Get company's active delivery zones
    const zones = await prisma.deliveryZone.findMany({
      where: { 
        companyId: userWithCompany.company.id,
        isActive: true 
      },
      orderBy: { maxDistanceKm: 'asc' }
    });
    
    // Find applicable zone
    const zone = getDeliveryZone(distanceResult.distanceKm, zones);
    
    // Calculate delivery cost if zone found
    let deliveryCost = null;
    if (zone) {
      deliveryCost = calculateDeliveryCost(distanceResult.distanceKm, zone);
    }
    
    // Get company's active templating rate
    const templatingRate = await prisma.templatingRate.findFirst({
      where: { 
        companyId: userWithCompany.company.id,
        isActive: true 
      }
    });
    
    // Calculate templating cost
    let templatingCost = null;
    if (templatingRate) {
      templatingCost = calculateTemplatingCost(
        distanceResult.distanceKm,
        templatingRate
      );
    }
    
    return NextResponse.json({
      distanceKm: Math.round(distanceResult.distanceKm * 10) / 10, // Round to 1 decimal
      durationMinutes: distanceResult.durationMinutes,
      originAddress: distanceResult.originAddress,
      destinationAddress: distanceResult.destinationAddress,
      deliveryZone: zone ? {
        id: zone.id,
        name: zone.name,
        maxDistanceKm: zone.maxDistanceKm,
        ratePerKm: Number(zone.ratePerKm),
        baseCharge: Number(zone.baseCharge)
      } : null,
      deliveryCost: deliveryCost ? Math.round(deliveryCost * 100) / 100 : null,
      templatingCost: templatingCost ? Math.round(templatingCost * 100) / 100 : null
    });
  } catch (error: any) {
    console.error('Distance calculation error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to calculate distance' },
      { status: 400 }
    );
  }
}
