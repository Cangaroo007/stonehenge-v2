# Phase 9: Complete Pricing Model Refactor

## Overview

This phase refactors the pricing system to support:
- Thickness-specific rates (20mm vs 40mm+)
- Service-based pricing (Cutting, Polishing, Installation)
- Edge profile pricing with categories
- Cutout categorization
- Delivery zones with Google Maps integration
- Templating rates
- Quote-level pricing overrides
- Complete calculator refactor

**Estimated Total Time:** ~12 hours

---

## Prompt 9.1: Audit Existing Pricing & Create ServiceRate Model

### Context

Before making changes, we need to audit what exists and understand how the current pricing calculator works. Then we'll add a new `ServiceRate` model to handle operations that have different rates for 20mm vs 40mm+ thickness.

### CRITICAL: Audit First, Build Second

#### Step 1: Audit Current State

**Before making ANY changes**, read and document the current pricing system:

```bash
# Read the schema models
npx prisma format
cat prisma/schema.prisma | grep -A 30 "model EdgeType"
cat prisma/schema.prisma | grep -A 30 "model CutoutType"
cat prisma/schema.prisma | grep -A 30 "model ThicknessOption"
cat prisma/schema.prisma | grep -A 30 "model PricingRule"
cat prisma/schema.prisma | grep -A 30 "model Material"
```

**Read the existing calculator:**
```bash
cat src/lib/services/pricing-calculator.ts
```

**Read the pricing types:**
```bash
cat src/lib/types/pricing.ts
```

**Check existing API endpoints:**
```bash
ls -la src/app/api/admin/pricing/
```

**Report what you find:**
- What pricing models currently exist?
- How does the calculator currently work?
- What uses multipliers vs direct rates?
- What's missing vs requirements?

### Step 2: Create ServiceRate Model

Add to `prisma/schema.prisma`:

```prisma
// Service rate types
enum ServiceType {
  CUTTING        // Full perimeter calculation
  POLISHING      // Finished edges only (base rate, profiles add extra)
  INSTALLATION   // Square meter calculation
  WATERFALL_END  // Fixed per item
}

enum RateUnit {
  LINEAR_METER   // Lm
  SQUARE_METER   // m²
  FIXED          // Per item
  PER_KM         // Distance-based
}

model ServiceRate {
  id            Int         @id @default(autoincrement())
  serviceType   ServiceType @unique
  name          String      // Display name
  description   String?
  
  // Thickness-specific rates
  rate20mm      Decimal     @db.Decimal(10, 2)
  rate40mm      Decimal     @db.Decimal(10, 2)
  
  // Unit of measurement
  unit          RateUnit
  
  // Minimum charge support
  minimumCharge Decimal?    @db.Decimal(10, 2)
  minimumQty    Decimal?    @db.Decimal(10, 2)  // e.g., 1.0 meter
  
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt
}
```

### Step 3: Create Migration

```bash
npx prisma migrate dev --name add_service_rate_model
```

### Step 4: Create Seed Data

Create or update `prisma/seed-pricing.ts`:

```typescript
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function seedServiceRates() {
  const serviceRates = [
    {
      serviceType: 'CUTTING',
      name: 'Cutting',
      description: 'Cutting stone to shape - calculated on full perimeter',
      rate20mm: 17.50,
      rate40mm: 45.00,
      unit: 'LINEAR_METER',
      minimumCharge: null,
      minimumQty: null,
      isActive: true
    },
    {
      serviceType: 'POLISHING',
      name: 'Polishing (Base)',
      description: 'Base polishing rate - calculated on finished edges only',
      rate20mm: 45.00,
      rate40mm: 115.00,
      unit: 'LINEAR_METER',
      minimumCharge: null,
      minimumQty: null,
      isActive: true
    },
    {
      serviceType: 'INSTALLATION',
      name: 'Installation',
      description: 'On-site installation - calculated on piece area',
      rate20mm: 140.00,
      rate40mm: 170.00,
      unit: 'SQUARE_METER',
      minimumCharge: null,
      minimumQty: null,
      isActive: true
    },
    {
      serviceType: 'WATERFALL_END',
      name: 'Waterfall End',
      description: 'Waterfall edge treatment - fixed per item',
      rate20mm: 300.00,
      rate40mm: 650.00,
      unit: 'FIXED',
      minimumCharge: null,
      minimumQty: null,
      isActive: true
    }
  ];

  for (const rate of serviceRates) {
    await prisma.serviceRate.upsert({
      where: { serviceType: rate.serviceType },
      update: rate,
      create: rate
    });
  }

  console.log('✅ ServiceRate seeded');
}

seedServiceRates()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

### Step 5: Create API Endpoints

Create `src/app/api/admin/pricing/service-rates/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/service-rates - List all
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN', 'MANAGER']);
    
    const rates = await prisma.serviceRate.findMany({
      orderBy: { serviceType: 'asc' }
    });
    
    return NextResponse.json(rates);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: error.message.includes('Unauthorized') ? 401 : 500 }
    );
  }
}

// POST /api/admin/pricing/service-rates - Create
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const body = await request.json();
    
    const rate = await prisma.serviceRate.create({
      data: body
    });
    
    return NextResponse.json(rate, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/admin/pricing/service-rates/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// PUT /api/admin/pricing/service-rates/[id] - Update
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const body = await request.json();
    const id = parseInt(params.id);
    
    const rate = await prisma.serviceRate.update({
      where: { id },
      data: body
    });
    
    return NextResponse.json(rate);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/pricing/service-rates/[id] - Delete
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const id = parseInt(params.id);
    
    await prisma.serviceRate.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

### Step 6: Run Migration and Seed

```bash
npx prisma migrate dev --name add_service_rate_model
npx ts-node prisma/seed-pricing.ts
```

### Step 7: Verify in Prisma Studio

```bash
npx prisma studio
```

Check:
- ServiceRate table exists
- 4 records inserted (CUTTING, POLISHING, INSTALLATION, WATERFALL_END)
- Rates are correct

### TypeScript Compatibility (Railway)

```typescript
// ❌ BAD - Spreading Decimal types
const total = { ...rate, amount: rate.rate20mm * qty };

// ✅ GOOD - Convert Decimals to numbers
const total = {
  ...rate,
  rate20mm: Number(rate.rate20mm),
  rate40mm: Number(rate.rate40mm),
  amount: Number(rate.rate20mm) * qty
};
```

### Verification Checklist

- [ ] Schema compiles without errors (`npx prisma format`)
- [ ] Migration runs successfully
- [ ] Seed data inserted correctly
- [ ] `npx prisma studio` shows ServiceRate table with 4 records
- [ ] API endpoints return correct data
- [ ] GET /api/admin/pricing/service-rates returns all rates
- [ ] No TypeScript errors in API routes

### Git Instructions

```bash
git add -A
git commit -m "feat: Add ServiceRate model with thickness variants for cutting/polishing/installation"
git push origin main
```

If push fails with 403:
```bash
git checkout -b claude/service-rate-model
git push origin claude/service-rate-model
```
Then notify user to merge manually.

---

## Prompt 9.2: Refactor EdgeType with Thickness Variants & Profile Types

### Context

Edge profiles (Pencil Round, Bullnose, Ogee, Beveled) need:
1. Separate rates for 20mm vs 40mm thickness
2. Minimum charge/length support
3. Flag for curved edges (higher pricing, 1m minimum)
4. Profile-specific pricing that **ADDS** to base polishing rate

**Business Rule:** Edge profile rates are ADDITIONAL to the base polishing rate from ServiceRate.

Example:
- Base polishing (20mm): $45/Lm
- Ogee profile (20mm): +$20/Lm
- **Total for Ogee edge:** $65/Lm

### Step 1: Audit Current EdgeType

```bash
cat prisma/schema.prisma | grep -A 25 "model EdgeType"
npx prisma studio  # Check existing edge type data
```

Document:
- Current fields
- Existing edge types
- Current baseRate values

### Step 2: Update Schema

Modify `EdgeType` model in `prisma/schema.prisma`:

```prisma
model EdgeType {
  id            Int       @id @default(autoincrement())
  name          String    // "Pencil Round", "Bullnose", "Ogee", etc.
  code          String    @unique  // "PR", "BN", "OG", etc.
  description   String?
  
  // Thickness-specific rates (ADDITIONAL to base polishing)
  rate20mm      Decimal   @db.Decimal(10, 2)
  rate40mm      Decimal   @db.Decimal(10, 2)
  
  // Minimum support for premium edges
  minimumCharge Decimal?  @db.Decimal(10, 2)
  minimumLength Decimal?  @db.Decimal(10, 2)  // In meters, e.g., 1.0
  
  // Curved edge flag (special handling, premium pricing)
  isCurved      Boolean   @default(false)
  
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  pricingRuleEdges PricingRuleEdge[]
  
  // KEEP OLD FIELD for backward compatibility (optional)
  // baseRate      Decimal?  @db.Decimal(10, 2)
}
```

### Step 3: Create Migration

**Important:** Since EdgeType already has data, we need a careful migration strategy.

Option A - Keep old baseRate field temporarily:
```bash
npx prisma migrate dev --name add_edge_thickness_variants
```

Option B - Migrate data in SQL:
```sql
-- Add new columns
ALTER TABLE "EdgeType" ADD COLUMN "rate20mm" DECIMAL(10,2);
ALTER TABLE "EdgeType" ADD COLUMN "rate40mm" DECIMAL(10,2);
ALTER TABLE "EdgeType" ADD COLUMN "minimumCharge" DECIMAL(10,2);
ALTER TABLE "EdgeType" ADD COLUMN "minimumLength" DECIMAL(10,2);
ALTER TABLE "EdgeType" ADD COLUMN "isCurved" BOOLEAN DEFAULT false;

-- Migrate existing baseRate to rate20mm, estimate rate40mm
UPDATE "EdgeType" SET "rate20mm" = COALESCE("baseRate", 0);
UPDATE "EdgeType" SET "rate40mm" = COALESCE("baseRate", 0) * 2.5;

-- Optional: Drop old column after verification
-- ALTER TABLE "EdgeType" DROP COLUMN "baseRate";
```

**Recommendation:** Use Prisma migrate and manually update data afterward.

### Step 4: Update/Seed Edge Type Data

Create or update `prisma/seed-pricing.ts`:

```typescript
async function seedEdgeTypes() {
  const edgeTypes = [
    {
      name: 'Pencil Round',
      code: 'PR',
      description: 'Standard pencil round edge - included in base polishing',
      rate20mm: 0.00,      // No additional charge
      rate40mm: 0.00,      // No additional charge
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      isActive: true
    },
    {
      name: 'Bullnose',
      code: 'BN',
      description: 'Full bullnose profile',
      rate20mm: 10.00,     // $10/Lm extra over base
      rate40mm: 10.00,     // Same for 40mm
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      isActive: true
    },
    {
      name: 'Ogee',
      code: 'OG',
      description: 'Decorative ogee profile',
      rate20mm: 20.00,     // $20/Lm extra
      rate40mm: 25.00,     // $25/Lm extra for 40mm
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      isActive: true
    },
    {
      name: 'Beveled',
      code: 'BV',
      description: 'Beveled edge profile',
      rate20mm: 5.00,      // $5/Lm extra
      rate40mm: 5.00,      // Same for 40mm
      minimumCharge: null,
      minimumLength: null,
      isCurved: false,
      isActive: true
    },
    {
      name: 'Curved Finished Edge',
      code: 'CF',
      description: 'Curved/radius edge - premium rate with 1m minimum',
      rate20mm: 255.00,    // $300 total - $45 base = $255 extra
      rate40mm: 535.00,    // $650 total - $115 base = $535 extra
      minimumCharge: 300.00,  // Minimum $300 charge for 20mm
      minimumLength: 1.0,  // 1 meter minimum
      isCurved: true,
      isActive: true
    }
  ];

  for (const edge of edgeTypes) {
    await prisma.edgeType.upsert({
      where: { code: edge.code },
      update: edge,
      create: edge
    });
  }

  console.log('✅ EdgeType seeded with thickness variants');
}
```

### Step 5: Run Migration and Seed

```bash
npx prisma migrate dev --name add_edge_thickness_variants
npx ts-node prisma/seed-pricing.ts
```

### Step 6: Update API Endpoints

The existing endpoints should work, but verify they return new fields:
- `GET /api/admin/pricing/edge-types`
- `POST /api/admin/pricing/edge-types`
- `PUT /api/admin/pricing/edge-types/[id]`

Update the admin UI form to include:
- `rate20mm` input
- `rate40mm` input
- `minimumCharge` input (optional)
- `minimumLength` input (optional)
- `isCurved` checkbox

### TypeScript Compatibility

```typescript
// ❌ BAD
const total = edge.rate20mm + base;

// ✅ GOOD
const total = Number(edge.rate20mm) + Number(base);
```

### Verification Checklist

- [ ] Migration runs without errors
- [ ] Existing edge types preserved
- [ ] New columns populated correctly
- [ ] Curved edge has `minimumCharge` and `minimumLength` set
- [ ] `npx prisma studio` shows all fields
- [ ] API returns all new fields
- [ ] No TypeScript errors

### Git Instructions

```bash
git add -A
git commit -m "feat: Refactor EdgeType with 20mm/40mm variants and curved edge support"
git push origin main
```

---

## Prompt 9.3: Refactor CutoutType with Categories

### Context

Cutouts need categorization because different cutout types have vastly different pricing:
- **STANDARD**: Hotplate, GPO, Tap Hole, Drop-in Sink → $65 each
- **UNDERMOUNT_SINK**: Undermount sink cutout → $300 each
- **FLUSH_COOKTOP**: Flush mount cooktop → $450 each
- **DRAINER_GROOVE**: Drainer grooves → $150 per groove

### Step 1: Audit Current CutoutType

```bash
cat prisma/schema.prisma | grep -A 20 "model CutoutType"
npx prisma studio  # Check existing cutout data
```

Document:
- Current fields
- Existing cutout types
- Current baseRate values

### Step 2: Update Schema

Add to `prisma/schema.prisma`:

```prisma
enum CutoutCategory {
  STANDARD         // Hotplate, GPO, Tap, Drop-in Sink
  UNDERMOUNT_SINK  // Undermount sink
  FLUSH_COOKTOP    // Flush mount cooktop
  DRAINER_GROOVE   // Drainer grooves
}

model CutoutType {
  id            Int             @id @default(autoincrement())
  name          String          // "Hotplate Cutout", "Undermount Sink", etc.
  code          String          @unique
  description   String?
  category      CutoutCategory  @default(STANDARD)
  
  // Pricing
  baseRate      Decimal         @db.Decimal(10, 2)
  
  // Minimum support (future use)
  minimumCharge Decimal?        @db.Decimal(10, 2)
  
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  
  // Relations
  pricingRuleCutouts PricingRuleCutout[]
}
```

### Step 3: Create Migration

```bash
npx prisma migrate dev --name add_cutout_categories
```

### Step 4: Update/Seed Cutout Data

Create or update `prisma/seed-pricing.ts`:

```typescript
async function seedCutoutTypes() {
  const cutoutTypes = [
    // STANDARD - $65 each
    {
      name: 'Hotplate Cutout',
      code: 'HP',
      description: 'Standard hotplate cutout',
      category: 'STANDARD',
      baseRate: 65.00,
      isActive: true
    },
    {
      name: 'GPO (Power Outlet)',
      code: 'GPO',
      description: 'General power outlet cutout',
      category: 'STANDARD',
      baseRate: 65.00,
      isActive: true
    },
    {
      name: 'Tap Hole',
      code: 'TAP',
      description: 'Tap hole cutout',
      category: 'STANDARD',
      baseRate: 65.00,
      isActive: true
    },
    {
      name: 'Drop-in Sink',
      code: 'DIS',
      description: 'Drop-in sink cutout',
      category: 'STANDARD',
      baseRate: 65.00,
      isActive: true
    },
    
    // UNDERMOUNT_SINK - $300 each
    {
      name: 'Undermount Sink',
      code: 'UMS',
      description: 'Undermount sink cutout',
      category: 'UNDERMOUNT_SINK',
      baseRate: 300.00,
      isActive: true
    },
    
    // FLUSH_COOKTOP - $450 each
    {
      name: 'Flush Mount Cooktop',
      code: 'FMC',
      description: 'Flush mount cooktop cutout',
      category: 'FLUSH_COOKTOP',
      baseRate: 450.00,
      isActive: true
    },
    
    // DRAINER_GROOVE - $150 each
    {
      name: 'Drainer Groove',
      code: 'DRG',
      description: 'Drainer groove',
      category: 'DRAINER_GROOVE',
      baseRate: 150.00,
      isActive: true
    }
  ];

  for (const cutout of cutoutTypes) {
    await prisma.cutoutType.upsert({
      where: { code: cutout.code },
      update: cutout,
      create: cutout
    });
  }

  console.log('✅ CutoutType seeded with categories');
}
```

### Step 5: Run Migration and Seed

```bash
npx prisma migrate dev --name add_cutout_categories
npx ts-node prisma/seed-pricing.ts
```

### Step 6: Update Admin UI

Update the cutout type admin form to include:
- Category dropdown (STANDARD, UNDERMOUNT_SINK, FLUSH_COOKTOP, DRAINER_GROOVE)
- Show category in the table

File: `src/app/(dashboard)/admin/pricing/components/CutoutTypeForm.tsx`

### TypeScript Compatibility

```typescript
// ✅ GOOD - Enum usage
import { CutoutCategory } from '@prisma/client';

const category: CutoutCategory = 'STANDARD';
```

### Verification Checklist

- [ ] Migration runs without errors
- [ ] Existing cutout types preserved (if any)
- [ ] Categories assigned correctly
- [ ] `npx prisma studio` shows category field
- [ ] Admin UI shows category dropdown
- [ ] Can filter by category
- [ ] Pricing calculation uses correct rates per category

### Git Instructions

```bash
git add -A
git commit -m "feat: Add cutout categories for pricing differentiation"
git push origin main
```

---

## Prompt 9.4: Add Delivery & Templating with Google Maps Integration

### Context

- **Delivery**: Distance-based pricing with zone tiers (Local, Regional, Remote)
- **Templating**: Fixed base charge + per-km component
- **Google Maps API**: Calculate distance from workshop to customer address
- Support for multi-stop routing (future enhancement)

### Step 1: Install Google Maps Package

```bash
npm install @googlemaps/google-maps-services-js
```

### Step 2: Add Environment Variables

Add to `.env`:

```env
GOOGLE_MAPS_API_KEY=your_api_key_here
WORKSHOP_ADDRESS="20 Hitech Drive, Kunda Park, Queensland 4556, Australia"
```

Add to `.env.example`:

```env
GOOGLE_MAPS_API_KEY=
WORKSHOP_ADDRESS=
```

### Step 3: Add Schema Models

Add to `prisma/schema.prisma`:

```prisma
model DeliveryZone {
  id            Int       @id @default(autoincrement())
  name          String    // "Local", "Regional", "Remote"
  maxDistanceKm Int       // Upper bound for this zone
  ratePerKm     Decimal   @db.Decimal(10, 2)
  baseCharge    Decimal   @db.Decimal(10, 2)
  isActive      Boolean   @default(true)
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  
  // Relations
  quotes        Quote[]
}

model TemplatingRate {
  id          Int       @id @default(autoincrement())
  name        String    @default("Standard Templating")
  baseCharge  Decimal   @db.Decimal(10, 2)  // Fixed component
  ratePerKm   Decimal   @db.Decimal(10, 2)  // Distance component
  isActive    Boolean   @default(true)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
}
```

Update `Quote` model:

```prisma
model Quote {
  // ... existing fields ...
  
  // Delivery
  deliveryAddress      String?
  deliveryDistanceKm   Decimal?  @db.Decimal(10, 2)
  deliveryZoneId       Int?
  deliveryZone         DeliveryZone? @relation(fields: [deliveryZoneId], references: [id])
  deliveryCost         Decimal?  @db.Decimal(10, 2)
  
  // Templating
  templatingRequired   Boolean   @default(false)
  templatingDistanceKm Decimal?  @db.Decimal(10, 2)
  templatingCost       Decimal?  @db.Decimal(10, 2)
}
```

### Step 4: Create Migration

```bash
npx prisma migrate dev --name add_delivery_templating
```

### Step 5: Create Distance Service

Create `src/lib/services/distance-service.ts`:

```typescript
import { Client, TravelMode } from '@googlemaps/google-maps-services-js';
import { DeliveryZone } from '@prisma/client';

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
  
  if (!apiKey) {
    throw new Error('GOOGLE_MAPS_API_KEY not configured');
  }
  
  try {
    const response = await client.distancematrix({
      params: {
        origins: [origin],
        destinations: [destination],
        key: apiKey,
        units: 'metric',
        mode: TravelMode.driving
      }
    });
    
    const element = response.data.rows[0]?.elements[0];
    
    if (!element || element.status !== 'OK') {
      throw new Error(`Distance calculation failed: ${element?.status || 'Unknown error'}`);
    }
    
    return {
      distanceKm: element.distance.value / 1000,  // Convert meters to km
      durationMinutes: Math.ceil(element.duration.value / 60),
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
 */
export function getDeliveryZone(
  distanceKm: number,
  zones: DeliveryZone[]
): DeliveryZone | null {
  // Sort by maxDistanceKm ascending
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
 */
export function calculateDeliveryCost(
  distanceKm: number,
  zone: DeliveryZone
): number {
  return Number(zone.baseCharge) + (distanceKm * Number(zone.ratePerKm));
}

/**
 * Calculate templating cost based on distance
 */
export function calculateTemplatingCost(
  distanceKm: number,
  rate: { baseCharge: number | string; ratePerKm: number | string }
): number {
  return Number(rate.baseCharge) + (distanceKm * Number(rate.ratePerKm));
}
```

### Step 6: Create Seed Data

Add to `prisma/seed-pricing.ts`:

```typescript
async function seedDeliveryZones() {
  const deliveryZones = [
    {
      name: 'Local',
      maxDistanceKm: 30,
      ratePerKm: 2.50,
      baseCharge: 50.00,
      isActive: true
    },
    {
      name: 'Regional',
      maxDistanceKm: 100,
      ratePerKm: 3.00,
      baseCharge: 75.00,
      isActive: true
    },
    {
      name: 'Remote',
      maxDistanceKm: 500,
      ratePerKm: 3.50,
      baseCharge: 100.00,
      isActive: true
    }
  ];

  for (const zone of deliveryZones) {
    await prisma.deliveryZone.upsert({
      where: { name: zone.name },
      update: zone,
      create: zone
    });
  }

  console.log('✅ DeliveryZone seeded');
}

async function seedTemplatingRate() {
  await prisma.templatingRate.upsert({
    where: { id: 1 },
    update: {
      name: 'Standard Templating',
      baseCharge: 150.00,
      ratePerKm: 2.00,
      isActive: true
    },
    create: {
      name: 'Standard Templating',
      baseCharge: 150.00,
      ratePerKm: 2.00,
      isActive: true
    }
  });

  console.log('✅ TemplatingRate seeded');
}
```

### Step 7: Create API Endpoints

Create `src/app/api/admin/pricing/delivery-zones/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/delivery-zones
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN', 'MANAGER']);
    
    const zones = await prisma.deliveryZone.findMany({
      orderBy: { maxDistanceKm: 'asc' }
    });
    
    return NextResponse.json(zones);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/admin/pricing/delivery-zones
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const body = await request.json();
    
    const zone = await prisma.deliveryZone.create({
      data: body
    });
    
    return NextResponse.json(zone, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/admin/pricing/delivery-zones/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// PUT /api/admin/pricing/delivery-zones/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const body = await request.json();
    const id = parseInt(params.id);
    
    const zone = await prisma.deliveryZone.update({
      where: { id },
      data: body
    });
    
    return NextResponse.json(zone);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

// DELETE /api/admin/pricing/delivery-zones/[id]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const id = parseInt(params.id);
    
    await prisma.deliveryZone.delete({
      where: { id }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/admin/pricing/templating-rates/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/admin/pricing/templating-rates
export async function GET(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN', 'MANAGER']);
    
    const rates = await prisma.templatingRate.findMany();
    
    return NextResponse.json(rates);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/admin/pricing/templating-rates
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const body = await request.json();
    
    const rate = await prisma.templatingRate.create({
      data: body
    });
    
    return NextResponse.json(rate, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/admin/pricing/templating-rates/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// PUT /api/admin/pricing/templating-rates/[id]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request, ['ADMIN']);
    
    const body = await request.json();
    const id = parseInt(params.id);
    
    const rate = await prisma.templatingRate.update({
      where: { id },
      data: body
    });
    
    return NextResponse.json(rate);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/distance/calculate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { 
  calculateDistance, 
  getDeliveryZone, 
  calculateDeliveryCost,
  calculateTemplatingCost 
} from '@/lib/services/distance-service';

// POST /api/distance/calculate
export async function POST(request: NextRequest) {
  try {
    await requireAuth(request);
    
    const { destination } = await request.json();
    
    if (!destination) {
      return NextResponse.json(
        { error: 'destination address required' },
        { status: 400 }
      );
    }
    
    const origin = process.env.WORKSHOP_ADDRESS;
    
    if (!origin) {
      return NextResponse.json(
        { error: 'WORKSHOP_ADDRESS not configured' },
        { status: 500 }
      );
    }
    
    // Calculate distance
    const distanceResult = await calculateDistance(origin, destination);
    
    // Get delivery zones
    const zones = await prisma.deliveryZone.findMany({
      where: { isActive: true },
      orderBy: { maxDistanceKm: 'asc' }
    });
    
    const zone = getDeliveryZone(distanceResult.distanceKm, zones);
    
    let deliveryCost = null;
    if (zone) {
      deliveryCost = calculateDeliveryCost(distanceResult.distanceKm, zone);
    }
    
    // Get templating rate
    const templatingRate = await prisma.templatingRate.findFirst({
      where: { isActive: true }
    });
    
    let templatingCost = null;
    if (templatingRate) {
      templatingCost = calculateTemplatingCost(
        distanceResult.distanceKm,
        {
          baseCharge: Number(templatingRate.baseCharge),
          ratePerKm: Number(templatingRate.ratePerKm)
        }
      );
    }
    
    return NextResponse.json({
      distanceKm: distanceResult.distanceKm,
      durationMinutes: distanceResult.durationMinutes,
      originAddress: distanceResult.originAddress,
      destinationAddress: distanceResult.destinationAddress,
      deliveryZone: zone,
      deliveryCost,
      templatingCost
    });
  } catch (error: any) {
    console.error('Distance calculation error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

### Step 8: Update Quote Builder UI

Update `src/app/(dashboard)/quotes/[id]/builder/page.tsx` to add:

1. **Delivery Section:**
   - Address input field
   - "Calculate Distance" button
   - Display: Distance (km), Zone, Delivery Cost
   - Save to quote

2. **Templating Section:**
   - Checkbox: "Templating Required"
   - If checked, uses same distance for calculation
   - Display: Templating Cost

Example UI component:

```typescript
'use client';

import { useState } from 'react';

export function DeliverySection({ quoteId }: { quoteId: number }) {
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);

  async function handleCalculate() {
    setLoading(true);
    try {
      const res = await fetch('/api/distance/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ destination: address })
      });
      
      const data = await res.json();
      setResult(data);
      
      // Update quote
      await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          deliveryAddress: data.destinationAddress,
          deliveryDistanceKm: data.distanceKm,
          deliveryZoneId: data.deliveryZone?.id,
          deliveryCost: data.deliveryCost
        })
      });
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border rounded p-4">
      <h3 className="font-semibold mb-3">Delivery</h3>
      
      <input
        type="text"
        value={address}
        onChange={(e) => setAddress(e.target.value)}
        placeholder="Enter delivery address"
        className="border rounded px-3 py-2 w-full mb-2"
      />
      
      <button
        onClick={handleCalculate}
        disabled={loading || !address}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        {loading ? 'Calculating...' : 'Calculate Distance'}
      </button>
      
      {result && (
        <div className="mt-4 text-sm">
          <p><strong>Distance:</strong> {result.distanceKm.toFixed(1)} km</p>
          <p><strong>Duration:</strong> {result.durationMinutes} min</p>
          {result.deliveryZone && (
            <>
              <p><strong>Zone:</strong> {result.deliveryZone.name}</p>
              <p><strong>Delivery Cost:</strong> ${result.deliveryCost.toFixed(2)}</p>
            </>
          )}
          {!result.deliveryZone && (
            <p className="text-amber-600">Distance exceeds standard zones - custom quote required</p>
          )}
        </div>
      )}
    </div>
  );
}
```

### Step 9: Run Migration and Seed

```bash
npx prisma migrate dev --name add_delivery_templating
npx ts-node prisma/seed-pricing.ts
```

### TypeScript Compatibility

```typescript
// ✅ GOOD - Convert Decimals
const cost = Number(zone.baseCharge) + (distance * Number(zone.ratePerKm));
```

### Verification Checklist

- [ ] Google Maps API key configured
- [ ] Distance calculation returns correct km
- [ ] Correct zone selected based on distance
- [ ] Delivery cost calculated correctly
- [ ] Templating cost calculated correctly
- [ ] Costs saved to Quote model
- [ ] UI displays all information
- [ ] `npx prisma studio` shows delivery zones

### Git Instructions

```bash
git add -A
git commit -m "feat: Add delivery zones and templating with Google Maps integration"
git push origin main
```

---

## Prompt 9.5: Add Quote-Level Pricing Overrides

### Context

Minimums and rates can be overridden at the quote level for:
- Special customer circumstances
- Negotiated agreements
- Promotional pricing
- Edge cases requiring manual adjustment

**Audit Requirement:** Overrides must track who made them and why.

### Step 1: Add Schema

Add to `prisma/schema.prisma`:

```prisma
enum OverrideType {
  WAIVE_MINIMUM      // Remove minimum charge enforcement
  CUSTOM_RATE        // Override the rate entirely
  DISCOUNT_PERCENT   // Apply percentage discount to calculated amount
  FIXED_DISCOUNT     // Apply fixed dollar discount
}

model QuotePricingOverride {
  id            Int           @id @default(autoincrement())
  quoteId       Int
  quote         Quote         @relation(fields: [quoteId], references: [id], onDelete: Cascade)
  
  overrideType  OverrideType
  
  // What's being overridden (one of these will be set)
  serviceType   ServiceType?  // For service rates (cutting, polishing, installation)
  edgeTypeId    Int?          // For edge profiles
  edgeType      EdgeType?     @relation(fields: [edgeTypeId], references: [id])
  cutoutTypeId  Int?          // For cutouts
  cutoutType    CutoutType?   @relation(fields: [cutoutTypeId], references: [id])
  
  // Override values
  customRate      Decimal?    @db.Decimal(10, 2)
  discountPercent Decimal?    @db.Decimal(5, 2)
  discountAmount  Decimal?    @db.Decimal(10, 2)
  
  // Audit
  reason        String?       // Why override was applied
  createdBy     Int
  createdByUser User          @relation(fields: [createdBy], references: [id])
  createdAt     DateTime      @default(now())
  
  @@unique([quoteId, serviceType])
  @@unique([quoteId, edgeTypeId])
  @@unique([quoteId, cutoutTypeId])
}

// Update Quote model
model Quote {
  // ... existing fields ...
  pricingOverrides QuotePricingOverride[]
}

// Update User model
model User {
  // ... existing fields ...
  pricingOverrides QuotePricingOverride[]
}

// Update EdgeType, CutoutType to support relation
model EdgeType {
  // ... existing fields ...
  quotePricingOverrides QuotePricingOverride[]
}

model CutoutType {
  // ... existing fields ...
  quotePricingOverrides QuotePricingOverride[]
}
```

### Step 2: Create Migration

```bash
npx prisma migrate dev --name add_quote_pricing_overrides
```

### Step 3: Create API Endpoints

Create `src/app/api/quotes/[id]/overrides/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/quotes/[id]/overrides
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request);
    
    const quoteId = parseInt(params.id);
    
    const overrides = await prisma.quotePricingOverride.findMany({
      where: { quoteId },
      include: {
        edgeType: true,
        cutoutType: true,
        createdByUser: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });
    
    return NextResponse.json(overrides);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

// POST /api/quotes/[id]/overrides
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const user = await requireAuth(request, ['ADMIN', 'MANAGER']);
    
    const quoteId = parseInt(params.id);
    const body = await request.json();
    
    const override = await prisma.quotePricingOverride.create({
      data: {
        ...body,
        quoteId,
        createdBy: user.id
      }
    });
    
    return NextResponse.json(override, { status: 201 });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

Create `src/app/api/quotes/[id]/overrides/[oid]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// PUT /api/quotes/[id]/overrides/[oid]
export async function PUT(
  request: NextRequest,
  { params }: { params: { id: string; oid: string } }
) {
  try {
    await requireAuth(request, ['ADMIN', 'MANAGER']);
    
    const overrideId = parseInt(params.oid);
    const body = await request.json();
    
    const override = await prisma.quotePricingOverride.update({
      where: { id: overrideId },
      data: body
    });
    
    return NextResponse.json(override);
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}

// DELETE /api/quotes/[id]/overrides/[oid]
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string; oid: string } }
) {
  try {
    await requireAuth(request, ['ADMIN', 'MANAGER']);
    
    const overrideId = parseInt(params.oid);
    
    await prisma.quotePricingOverride.delete({
      where: { id: overrideId }
    });
    
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }
}
```

### Step 4: Update Pricing Calculator Helper

Create helper function in `src/lib/services/pricing-calculator.ts`:

```typescript
import { QuotePricingOverride, ServiceType, OverrideType } from '@prisma/client';

interface ApplyOverrideParams {
  baseAmount: number;
  serviceType?: ServiceType;
  edgeTypeId?: number;
  cutoutTypeId?: number;
  overrides: QuotePricingOverride[];
}

export function applyPricingOverride({
  baseAmount,
  serviceType,
  edgeTypeId,
  cutoutTypeId,
  overrides
}: ApplyOverrideParams): number {
  // Find matching override
  const override = overrides.find(o => {
    if (serviceType && o.serviceType === serviceType) return true;
    if (edgeTypeId && o.edgeTypeId === edgeTypeId) return true;
    if (cutoutTypeId && o.cutoutTypeId === cutoutTypeId) return true;
    return false;
  });
  
  if (!override) return baseAmount;
  
  switch (override.overrideType) {
    case 'WAIVE_MINIMUM':
      // Return calculated amount even if below minimum
      // (Minimum enforcement happens elsewhere)
      return baseAmount;
      
    case 'CUSTOM_RATE':
      // Use custom rate instead of calculated
      return Number(override.customRate || 0);
      
    case 'DISCOUNT_PERCENT':
      // Apply percentage discount
      const percent = Number(override.discountPercent || 0);
      return baseAmount * (1 - percent / 100);
      
    case 'FIXED_DISCOUNT':
      // Apply fixed amount discount
      const discount = Number(override.discountAmount || 0);
      return Math.max(0, baseAmount - discount);
      
    default:
      return baseAmount;
  }
}

export function hasMinimumWaiver(
  serviceType: ServiceType | undefined,
  overrides: QuotePricingOverride[]
): boolean {
  return overrides.some(
    o => o.serviceType === serviceType && o.overrideType === 'WAIVE_MINIMUM'
  );
}
```

### Step 5: Create UI Component

Create `src/app/(dashboard)/quotes/[id]/builder/components/PricingOverrides.tsx`:

```typescript
'use client';

import { useState, useEffect } from 'react';
import { ServiceType, OverrideType } from '@prisma/client';

interface PricingOverridesProps {
  quoteId: number;
}

export function PricingOverrides({ quoteId }: PricingOverridesProps) {
  const [overrides, setOverrides] = useState<any[]>([]);
  const [showForm, setShowForm] = useState(false);
  
  const [formData, setFormData] = useState({
    overrideType: 'DISCOUNT_PERCENT' as OverrideType,
    serviceType: '' as ServiceType | '',
    customRate: '',
    discountPercent: '',
    discountAmount: '',
    reason: ''
  });

  async function loadOverrides() {
    const res = await fetch(`/api/quotes/${quoteId}/overrides`);
    const data = await res.json();
    setOverrides(data);
  }

  useEffect(() => {
    loadOverrides();
  }, [quoteId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    
    try {
      await fetch(`/api/quotes/${quoteId}/overrides`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      setShowForm(false);
      loadOverrides();
      
      // Reset form
      setFormData({
        overrideType: 'DISCOUNT_PERCENT',
        serviceType: '',
        customRate: '',
        discountPercent: '',
        discountAmount: '',
        reason: ''
      });
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDelete(overrideId: number) {
    if (!confirm('Remove this pricing override?')) return;
    
    await fetch(`/api/quotes/${quoteId}/overrides/${overrideId}`, {
      method: 'DELETE'
    });
    
    loadOverrides();
  }

  return (
    <div className="border rounded p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="font-semibold">Pricing Overrides</h3>
        <button
          onClick={() => setShowForm(!showForm)}
          className="text-sm text-blue-600"
        >
          {showForm ? 'Cancel' : '+ Add Override'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="mb-4 space-y-3 bg-gray-50 p-4 rounded">
          <div>
            <label className="block text-sm font-medium mb-1">Override Type</label>
            <select
              value={formData.overrideType}
              onChange={(e) => setFormData({ ...formData, overrideType: e.target.value as OverrideType })}
              className="border rounded px-3 py-2 w-full"
              required
            >
              <option value="WAIVE_MINIMUM">Waive Minimum Charge</option>
              <option value="CUSTOM_RATE">Custom Rate</option>
              <option value="DISCOUNT_PERCENT">Percentage Discount</option>
              <option value="FIXED_DISCOUNT">Fixed Discount</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Service Type</label>
            <select
              value={formData.serviceType}
              onChange={(e) => setFormData({ ...formData, serviceType: e.target.value as ServiceType })}
              className="border rounded px-3 py-2 w-full"
              required
            >
              <option value="">Select...</option>
              <option value="CUTTING">Cutting</option>
              <option value="POLISHING">Polishing</option>
              <option value="INSTALLATION">Installation</option>
              <option value="WATERFALL_END">Waterfall End</option>
            </select>
          </div>

          {formData.overrideType === 'CUSTOM_RATE' && (
            <div>
              <label className="block text-sm font-medium mb-1">Custom Rate ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.customRate}
                onChange={(e) => setFormData({ ...formData, customRate: e.target.value })}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
          )}

          {formData.overrideType === 'DISCOUNT_PERCENT' && (
            <div>
              <label className="block text-sm font-medium mb-1">Discount (%)</label>
              <input
                type="number"
                step="0.01"
                value={formData.discountPercent}
                onChange={(e) => setFormData({ ...formData, discountPercent: e.target.value })}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
          )}

          {formData.overrideType === 'FIXED_DISCOUNT' && (
            <div>
              <label className="block text-sm font-medium mb-1">Discount Amount ($)</label>
              <input
                type="number"
                step="0.01"
                value={formData.discountAmount}
                onChange={(e) => setFormData({ ...formData, discountAmount: e.target.value })}
                className="border rounded px-3 py-2 w-full"
                required
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">Reason (required)</label>
            <textarea
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
              className="border rounded px-3 py-2 w-full"
              rows={2}
              required
            />
          </div>

          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded text-sm"
          >
            Add Override
          </button>
        </form>
      )}

      {overrides.length > 0 && (
        <div className="space-y-2">
          {overrides.map((override) => (
            <div key={override.id} className="bg-amber-50 border border-amber-200 rounded p-3 text-sm">
              <div className="flex justify-between items-start">
                <div>
                  <p className="font-medium">
                    {override.overrideType.replace('_', ' ')}
                    {' '}on{' '}
                    {override.serviceType || override.edgeType?.name || override.cutoutType?.name}
                  </p>
                  {override.reason && (
                    <p className="text-gray-600 text-xs mt-1">Reason: {override.reason}</p>
                  )}
                  <p className="text-gray-500 text-xs mt-1">
                    By {override.createdByUser.name} on {new Date(override.createdAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => handleDelete(override.id)}
                  className="text-red-600 text-xs"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {overrides.length === 0 && !showForm && (
        <p className="text-gray-500 text-sm">No pricing overrides applied</p>
      )}
    </div>
  );
}
```

### Step 6: Run Migration

```bash
npx prisma migrate dev --name add_quote_pricing_overrides
```

### Verification Checklist

- [ ] Migration runs successfully
- [ ] Can add override to waive minimum
- [ ] Can add custom rate override
- [ ] Can add percentage discount
- [ ] Can add fixed discount
- [ ] Overrides saved with reason and user
- [ ] Overrides display correctly in UI
- [ ] Can delete overrides
- [ ] Audit trail shows who/when/why

### Git Instructions

```bash
git add -A
git commit -m "feat: Add quote-level pricing overrides with audit trail"
git push origin main
```

---

## Prompt 9.6: Refactor Pricing Calculator (COMPREHENSIVE)

### Context

This is the most complex prompt in Phase 9. The existing pricing calculator (`src/lib/services/pricing-calculator.ts`) needs a complete refactor to:

1. Use `ServiceRate` for cutting/polishing/installation
2. Apply thickness-specific rates (20mm vs 40mm+)
3. Calculate cutting on **FULL PERIMETER**
4. Calculate polishing on **FINISHED EDGES ONLY**
5. Add edge profile costs (additional to base polishing)
6. Apply minimums with override support
7. Include delivery and templating costs
8. Display **BOTH** Lm and m² for each piece
9. Apply PricingRule discounts
10. Calculate GST (10%)

### Step 1: Backup Existing Calculator

```bash
cp src/lib/services/pricing-calculator.ts src/lib/services/pricing-calculator.backup.ts
```

### Step 2: Define New Types

Update or create `src/lib/types/pricing.ts`:

```typescript
export interface PieceCalculation {
  pieceId: number;
  pieceName: string;
  
  // Measurements (display BOTH Lm and m²)
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  perimeterLm: number;      // Linear meters (full perimeter)
  areaM2: number;           // Square meters
  finishedEdgesLm: number;  // Only marked/finished edges
  
  // Costs by category
  materialCost: number;
  cuttingCost: number;
  polishingCost: number;
  edgeProfileCost: number;  // Additional for profile types
  cutoutsCost: number;
  
  // Detailed breakdown
  breakdown: LineItem[];
}

export interface LineItem {
  description: string;
  quantity: number;
  unit: string;          // "Lm", "m²", "each", "km"
  rate: number;
  amount: number;
  category: 'material' | 'cutting' | 'polishing' | 'edge' | 'cutout' | 'install' | 'delivery' | 'templating' | 'waterfall';
}

export interface DiscountBreakdown {
  ruleName: string;
  type: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
  amount: number;
}

export interface QuoteCalculation {
  pieces: PieceCalculation[];
  
  // Totals by category
  materialTotal: number;
  cuttingTotal: number;
  polishingTotal: number;
  cutoutsTotal: number;
  installationTotal: number;
  deliveryTotal: number;
  templatingTotal: number;
  
  // Summary
  subtotal: number;
  discounts: DiscountBreakdown[];
  discountTotal: number;
  taxableAmount: number;
  gst: number;          // 10%
  total: number;
  
  // Full breakdown for PDF/display
  allLineItems: LineItem[];
}
```

### Step 3: Create New Calculator

Replace content of `src/lib/services/pricing-calculator.ts`:

```typescript
import { prisma } from '@/lib/db';
import { 
  ServiceType, 
  QuotePricingOverride,
  PieceFeature 
} from '@prisma/client';
import { 
  PieceCalculation,
  LineItem,
  DiscountBreakdown,
  QuoteCalculation 
} from '@/lib/types/pricing';
import { applyPricingOverride, hasMinimumWaiver } from './pricing-calculator-helpers';

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the appropriate rate based on thickness
 */
function getThicknessRate(
  rate20mm: number | string,
  rate40mm: number | string,
  thickness: number
): number {
  return thickness >= 40 ? Number(rate40mm) : Number(rate20mm);
}

/**
 * Calculate full perimeter in linear meters
 */
function calculatePerimeter(lengthMm: number, widthMm: number): number {
  return 2 * (lengthMm + widthMm) / 1000;
}

/**
 * Calculate area in square meters
 */
function calculateArea(lengthMm: number, widthMm: number): number {
  return (lengthMm * widthMm) / 1_000_000;
}

/**
 * Calculate finished edges only (those marked for polishing)
 * Based on PieceFeature records with featureType === 'EDGE'
 */
function calculateFinishedEdges(features: PieceFeature[]): number {
  const edgeFeatures = features.filter(f => f.featureType === 'EDGE');
  
  const totalMm = edgeFeatures.reduce((sum, feature) => {
    return sum + (feature.length || 0);
  }, 0);
  
  return totalMm / 1000; // Convert to linear meters
}

/**
 * Apply minimum charge if applicable
 */
function applyMinimum(
  calculated: number,
  minimumCharge: number | null | undefined,
  minimumQty: number | null | undefined,
  quantity: number,
  hasWaiver: boolean
): number {
  if (hasWaiver) return calculated;
  
  if (minimumCharge && calculated < Number(minimumCharge)) {
    return Number(minimumCharge);
  }
  
  if (minimumQty && quantity < Number(minimumQty)) {
    // Apply rate as if minimum quantity was used
    const rate = calculated / quantity;
    return rate * Number(minimumQty);
  }
  
  return calculated;
}

// ============================================
// MAIN CALCULATION FUNCTION
// ============================================

export async function calculateQuote(
  quoteId: number
): Promise<QuoteCalculation> {
  // Fetch quote with all related data
  const quote = await prisma.quote.findUnique({
    where: { id: quoteId },
    include: {
      pieces: {
        include: {
          material: true,
          features: {
            include: {
              edgeType: true,
              cutoutType: true
            }
          }
        }
      },
      customer: {
        include: {
          clientType: true,
          clientTier: true
        }
      },
      pricingOverrides: {
        include: {
          edgeType: true,
          cutoutType: true,
          createdByUser: {
            select: {
              id: true,
              name: true
            }
          }
        }
      },
      deliveryZone: true
    }
  });
  
  if (!quote) {
    throw new Error('Quote not found');
  }
  
  // Fetch service rates
  const serviceRates = await prisma.serviceRate.findMany({
    where: { isActive: true }
  });
  
  const cuttingRate = serviceRates.find(r => r.serviceType === 'CUTTING');
  const polishingRate = serviceRates.find(r => r.serviceType === 'POLISHING');
  const installRate = serviceRates.find(r => r.serviceType === 'INSTALLATION');
  const waterfallRate = serviceRates.find(r => r.serviceType === 'WATERFALL_END');
  
  // Fetch templating rate if needed
  const templatingRate = quote.templatingRequired 
    ? await prisma.templatingRate.findFirst({ where: { isActive: true } })
    : null;
  
  const allLineItems: LineItem[] = [];
  const pieceCalculations: PieceCalculation[] = [];
  
  let materialTotal = 0;
  let cuttingTotal = 0;
  let polishingTotal = 0;
  let cutoutsTotal = 0;
  
  // ============================================
  // CALCULATE EACH PIECE
  // ============================================
  
  for (const piece of quote.pieces) {
    const thickness = piece.thickness || 20;
    const perimeterLm = calculatePerimeter(piece.length, piece.width);
    const areaM2 = calculateArea(piece.length, piece.width);
    const finishedEdgesLm = calculateFinishedEdges(piece.features);
    
    const pieceBreakdown: LineItem[] = [];
    
    // -----------------
    // MATERIAL
    // -----------------
    const materialCost = areaM2 * Number(piece.material?.pricePerSqm || 0);
    materialTotal += materialCost;
    
    pieceBreakdown.push({
      description: `${piece.material?.name || 'Material'} - ${piece.name}`,
      quantity: areaM2,
      unit: 'm²',
      rate: Number(piece.material?.pricePerSqm || 0),
      amount: materialCost,
      category: 'material'
    });
    
    // -----------------
    // CUTTING (full perimeter)
    // -----------------
    let cuttingCost = 0;
    if (cuttingRate) {
      const rate = getThicknessRate(
        cuttingRate.rate20mm,
        cuttingRate.rate40mm,
        thickness
      );
      cuttingCost = perimeterLm * rate;
      
      // Apply override if exists
      cuttingCost = applyPricingOverride({
        baseAmount: cuttingCost,
        serviceType: 'CUTTING',
        overrides: quote.pricingOverrides
      });
      
      // Apply minimum
      cuttingCost = applyMinimum(
        cuttingCost,
        cuttingRate.minimumCharge,
        cuttingRate.minimumQty,
        perimeterLm,
        hasMinimumWaiver('CUTTING', quote.pricingOverrides)
      );
      
      cuttingTotal += cuttingCost;
      
      pieceBreakdown.push({
        description: `Cutting - ${piece.name}`,
        quantity: perimeterLm,
        unit: 'Lm',
        rate,
        amount: cuttingCost,
        category: 'cutting'
      });
    }
    
    // -----------------
    // POLISHING (finished edges only)
    // -----------------
    let polishingCost = 0;
    if (polishingRate && finishedEdgesLm > 0) {
      const rate = getThicknessRate(
        polishingRate.rate20mm,
        polishingRate.rate40mm,
        thickness
      );
      polishingCost = finishedEdgesLm * rate;
      
      // Apply override if exists
      polishingCost = applyPricingOverride({
        baseAmount: polishingCost,
        serviceType: 'POLISHING',
        overrides: quote.pricingOverrides
      });
      
      // Apply minimum
      polishingCost = applyMinimum(
        polishingCost,
        polishingRate.minimumCharge,
        polishingRate.minimumQty,
        finishedEdgesLm,
        hasMinimumWaiver('POLISHING', quote.pricingOverrides)
      );
      
      polishingTotal += polishingCost;
      
      pieceBreakdown.push({
        description: `Polishing (Base) - ${piece.name}`,
        quantity: finishedEdgesLm,
        unit: 'Lm',
        rate,
        amount: polishingCost,
        category: 'polishing'
      });
    }
    
    // -----------------
    // EDGE PROFILE COSTS (additional to base polishing)
    // -----------------
    let edgeProfileCost = 0;
    const edgeFeatures = piece.features.filter(f => f.featureType === 'EDGE' && f.edgeType);
    
    for (const edge of edgeFeatures) {
      if (edge.edgeType) {
        const edgeRate = getThicknessRate(
          edge.edgeType.rate20mm,
          edge.edgeType.rate40mm,
          thickness
        );
        
        const edgeLengthLm = (edge.length || 0) / 1000;
        let cost = edgeLengthLm * edgeRate;
        
        // Apply override if exists
        cost = applyPricingOverride({
          baseAmount: cost,
          edgeTypeId: edge.edgeType.id,
          overrides: quote.pricingOverrides
        });
        
        // Apply minimum if curved edge
        if (edge.edgeType.isCurved) {
          cost = applyMinimum(
            cost,
            edge.edgeType.minimumCharge,
            edge.edgeType.minimumLength,
            edgeLengthLm,
            false // Check if there's an edge-specific waiver
          );
        }
        
        edgeProfileCost += cost;
        
        if (cost > 0) {
          pieceBreakdown.push({
            description: `${edge.edgeType.name} Edge - ${piece.name}`,
            quantity: edgeLengthLm,
            unit: 'Lm',
            rate: edgeRate,
            amount: cost,
            category: 'edge'
          });
        }
      }
    }
    
    // -----------------
    // CUTOUTS
    // -----------------
    let cutoutsCost = 0;
    const cutoutFeatures = piece.features.filter(f => f.featureType === 'CUTOUT' && f.cutoutType);
    
    for (const cutout of cutoutFeatures) {
      if (cutout.cutoutType) {
        const quantity = cutout.quantity || 1;
        let cost = Number(cutout.cutoutType.baseRate) * quantity;
        
        // Apply override if exists
        cost = applyPricingOverride({
          baseAmount: cost,
          cutoutTypeId: cutout.cutoutType.id,
          overrides: quote.pricingOverrides
        });
        
        cutoutsCost += cost;
        cutoutsTotal += cost;
        
        pieceBreakdown.push({
          description: `${cutout.cutoutType.name} - ${piece.name}`,
          quantity,
          unit: 'each',
          rate: Number(cutout.cutoutType.baseRate),
          amount: cost,
          category: 'cutout'
        });
      }
    }
    
    // -----------------
    // WATERFALL ENDS (if marked)
    // -----------------
    const waterfallFeatures = piece.features.filter(f => f.featureType === 'WATERFALL_END');
    
    for (const waterfall of waterfallFeatures) {
      if (waterfallRate) {
        const rate = getThicknessRate(
          waterfallRate.rate20mm,
          waterfallRate.rate40mm,
          thickness
        );
        
        const cost = rate;
        
        pieceBreakdown.push({
          description: `Waterfall End - ${piece.name}`,
          quantity: 1,
          unit: 'each',
          rate,
          amount: cost,
          category: 'waterfall'
        });
      }
    }
    
    // Store piece calculation
    pieceCalculations.push({
      pieceId: piece.id,
      pieceName: piece.name || `Piece ${piece.id}`,
      lengthMm: piece.length,
      widthMm: piece.width,
      thicknessMm: thickness,
      perimeterLm,
      areaM2,
      finishedEdgesLm,
      materialCost,
      cuttingCost,
      polishingCost,
      edgeProfileCost,
      cutoutsCost,
      breakdown: pieceBreakdown
    });
    
    allLineItems.push(...pieceBreakdown);
  }
  
  // ============================================
  // INSTALLATION
  // ============================================
  
  const totalArea = pieceCalculations.reduce((sum, p) => sum + p.areaM2, 0);
  let installationTotal = 0;
  
  if (installRate && totalArea > 0) {
    // Determine predominant thickness (simple: use max)
    const maxThickness = Math.max(...pieceCalculations.map(p => p.thicknessMm));
    const rate = getThicknessRate(
      installRate.rate20mm,
      installRate.rate40mm,
      maxThickness
    );
    
    installationTotal = totalArea * rate;
    
    // Apply override if exists
    installationTotal = applyPricingOverride({
      baseAmount: installationTotal,
      serviceType: 'INSTALLATION',
      overrides: quote.pricingOverrides
    });
    
    allLineItems.push({
      description: 'Installation',
      quantity: totalArea,
      unit: 'm²',
      rate,
      amount: installationTotal,
      category: 'install'
    });
  }
  
  // ============================================
  // DELIVERY
  // ============================================
  
  let deliveryTotal = 0;
  if (quote.deliveryZone && quote.deliveryDistanceKm) {
    deliveryTotal = Number(quote.deliveryZone.baseCharge) + 
      (Number(quote.deliveryDistanceKm) * Number(quote.deliveryZone.ratePerKm));
    
    allLineItems.push({
      description: `Delivery - ${quote.deliveryZone.name} Zone`,
      quantity: Number(quote.deliveryDistanceKm),
      unit: 'km',
      rate: Number(quote.deliveryZone.ratePerKm),
      amount: deliveryTotal,
      category: 'delivery'
    });
  }
  
  // ============================================
  // TEMPLATING
  // ============================================
  
  let templatingTotal = 0;
  if (templatingRate && quote.templatingDistanceKm) {
    templatingTotal = Number(templatingRate.baseCharge) + 
      (Number(quote.templatingDistanceKm) * Number(templatingRate.ratePerKm));
    
    allLineItems.push({
      description: 'Templating',
      quantity: Number(quote.templatingDistanceKm),
      unit: 'km',
      rate: Number(templatingRate.ratePerKm),
      amount: templatingTotal,
      category: 'templating'
    });
  }
  
  // ============================================
  // SUBTOTAL & DISCOUNTS
  // ============================================
  
  const subtotal = 
    materialTotal + 
    cuttingTotal + 
    polishingTotal + 
    cutoutsTotal + 
    installationTotal + 
    deliveryTotal + 
    templatingTotal;
  
  // Apply customer discounts from PricingRule
  // TODO: Implement existing PricingRule logic here
  // For now, placeholder:
  const discounts: DiscountBreakdown[] = [];
  let discountTotal = 0;
  
  if (quote.customer?.clientTier?.discountPercent) {
    const tierDiscount = subtotal * (Number(quote.customer.clientTier.discountPercent) / 100);
    discounts.push({
      ruleName: `${quote.customer.clientTier.name} Tier Discount`,
      type: 'PERCENTAGE',
      value: Number(quote.customer.clientTier.discountPercent),
      amount: tierDiscount
    });
    discountTotal += tierDiscount;
  }
  
  // ============================================
  // FINAL TOTALS
  // ============================================
  
  const taxableAmount = subtotal - discountTotal;
  const gst = taxableAmount * 0.10;  // 10% GST
  const total = taxableAmount + gst;
  
  return {
    pieces: pieceCalculations,
    materialTotal,
    cuttingTotal,
    polishingTotal,
    cutoutsTotal,
    installationTotal,
    deliveryTotal,
    templatingTotal,
    subtotal,
    discounts,
    discountTotal,
    taxableAmount,
    gst,
    total,
    allLineItems
  };
}
```

Create helper file `src/lib/services/pricing-calculator-helpers.ts`:

```typescript
import { QuotePricingOverride, ServiceType, OverrideType } from '@prisma/client';

interface ApplyOverrideParams {
  baseAmount: number;
  serviceType?: ServiceType;
  edgeTypeId?: number;
  cutoutTypeId?: number;
  overrides: QuotePricingOverride[];
}

export function applyPricingOverride({
  baseAmount,
  serviceType,
  edgeTypeId,
  cutoutTypeId,
  overrides
}: ApplyOverrideParams): number {
  const override = overrides.find(o => {
    if (serviceType && o.serviceType === serviceType) return true;
    if (edgeTypeId && o.edgeTypeId === edgeTypeId) return true;
    if (cutoutTypeId && o.cutoutTypeId === cutoutTypeId) return true;
    return false;
  });
  
  if (!override) return baseAmount;
  
  switch (override.overrideType) {
    case 'WAIVE_MINIMUM':
      return baseAmount;
      
    case 'CUSTOM_RATE':
      return Number(override.customRate || 0);
      
    case 'DISCOUNT_PERCENT':
      const percent = Number(override.discountPercent || 0);
      return baseAmount * (1 - percent / 100);
      
    case 'FIXED_DISCOUNT':
      const discount = Number(override.discountAmount || 0);
      return Math.max(0, baseAmount - discount);
      
    default:
      return baseAmount;
  }
}

export function hasMinimumWaiver(
  serviceType: ServiceType | undefined,
  overrides: QuotePricingOverride[]
): boolean {
  return overrides.some(
    o => o.serviceType === serviceType && o.overrideType === 'WAIVE_MINIMUM'
  );
}
```

### Step 4: Update Calculate API Endpoint

Update `src/app/api/quotes/[id]/calculate/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { calculateQuote } from '@/lib/services/pricing-calculator';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await requireAuth(request);
    
    const quoteId = parseInt(params.id);
    
    const calculation = await calculateQuote(quoteId);
    
    return NextResponse.json(calculation);
  } catch (error: any) {
    console.error('Quote calculation error:', error);
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}
```

### Step 5: Update Pricing Summary Component

Update `src/app/(dashboard)/quotes/[id]/builder/components/PricingSummary.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';
import { QuoteCalculation } from '@/lib/types/pricing';

interface PricingSummaryProps {
  quoteId: number;
}

export function PricingSummary({ quoteId }: PricingSummaryProps) {
  const [calculation, setCalculation] = useState<QuoteCalculation | null>(null);
  const [loading, setLoading] = useState(false);

  async function loadCalculation() {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}/calculate`, {
        method: 'POST'
      });
      const data = await res.json();
      setCalculation(data);
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCalculation();
  }, [quoteId]);

  if (loading) return <div>Calculating...</div>;
  if (!calculation) return null;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: 'AUD'
    }).format(amount);
  };

  return (
    <div className="border rounded-lg p-6">
      <h2 className="text-xl font-bold mb-4">Pricing Summary</h2>
      
      {/* Pieces breakdown */}
      <div className="space-y-4 mb-6">
        {calculation.pieces.map((piece) => (
          <div key={piece.pieceId} className="border-b pb-3">
            <h3 className="font-semibold">{piece.pieceName}</h3>
            <div className="text-sm text-gray-600 grid grid-cols-3 gap-2 mt-1">
              <span>Perimeter: {piece.perimeterLm.toFixed(2)} Lm</span>
              <span>Area: {piece.areaM2.toFixed(2)} m²</span>
              <span>Finished Edges: {piece.finishedEdgesLm.toFixed(2)} Lm</span>
            </div>
            
            {piece.breakdown.map((line, idx) => (
              <div key={idx} className="flex justify-between text-sm mt-1">
                <span className="text-gray-600">
                  {line.description} ({line.quantity.toFixed(2)} {line.unit})
                </span>
                <span>{formatCurrency(line.amount)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
      
      {/* Category totals */}
      <div className="space-y-2 text-sm mb-4">
        <div className="flex justify-between">
          <span>Material</span>
          <span>{formatCurrency(calculation.materialTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Cutting</span>
          <span>{formatCurrency(calculation.cuttingTotal)}</span>
        </div>
        <div className="flex justify-between">
          <span>Polishing</span>
          <span>{formatCurrency(calculation.polishingTotal)}</span>
        </div>
        {calculation.cutoutsTotal > 0 && (
          <div className="flex justify-between">
            <span>Cutouts</span>
            <span>{formatCurrency(calculation.cutoutsTotal)}</span>
          </div>
        )}
        {calculation.installationTotal > 0 && (
          <div className="flex justify-between">
            <span>Installation</span>
            <span>{formatCurrency(calculation.installationTotal)}</span>
          </div>
        )}
        {calculation.deliveryTotal > 0 && (
          <div className="flex justify-between">
            <span>Delivery</span>
            <span>{formatCurrency(calculation.deliveryTotal)}</span>
          </div>
        )}
        {calculation.templatingTotal > 0 && (
          <div className="flex justify-between">
            <span>Templating</span>
            <span>{formatCurrency(calculation.templatingTotal)}</span>
          </div>
        )}
      </div>
      
      {/* Subtotal */}
      <div className="border-t pt-2 mb-2">
        <div className="flex justify-between font-semibold">
          <span>Subtotal</span>
          <span>{formatCurrency(calculation.subtotal)}</span>
        </div>
      </div>
      
      {/* Discounts */}
      {calculation.discounts.length > 0 && (
        <div className="space-y-1 text-sm mb-2">
          {calculation.discounts.map((discount, idx) => (
            <div key={idx} className="flex justify-between text-green-600">
              <span>{discount.ruleName}</span>
              <span>-{formatCurrency(discount.amount)}</span>
            </div>
          ))}
        </div>
      )}
      
      {/* Taxable amount */}
      <div className="flex justify-between text-sm mb-1">
        <span>Taxable Amount</span>
        <span>{formatCurrency(calculation.taxableAmount)}</span>
      </div>
      
      {/* GST */}
      <div className="flex justify-between text-sm mb-3">
        <span>GST (10%)</span>
        <span>{formatCurrency(calculation.gst)}</span>
      </div>
      
      {/* Total */}
      <div className="border-t-2 pt-3">
        <div className="flex justify-between text-lg font-bold">
          <span>TOTAL</span>
          <span>{formatCurrency(calculation.total)}</span>
        </div>
      </div>
    </div>
  );
}
```

### Verification Checklist

- [ ] Cutting calculated on full perimeter (all 4 sides)
- [ ] Polishing calculated on finished edges only
- [ ] Thickness variants applied correctly (20mm vs 40mm)
- [ ] Edge profile costs added to base polishing
- [ ] Installation calculated on total area
- [ ] Cutouts calculated correctly by category
- [ ] Delivery included when address set
- [ ] Templating included when enabled
- [ ] Minimums applied where configured
- [ ] Overrides respected
- [ ] Discounts applied
- [ ] GST calculated at 10%
- [ ] Total correct
- [ ] Both Lm and m² displayed for pieces
- [ ] No TypeScript errors

### Git Instructions

```bash
git add -A
git commit -m "feat: Complete pricing calculator refactor with thickness variants and service rates"
git push origin main
```

---

## Prompt 9.7: Admin UI for New Pricing Models

### Context

Create admin pages to manage the new pricing models:
- Service Rates
- Delivery Zones
- Templating Rates

### Step 1: Create Service Rates Admin Page

Create `src/app/(dashboard)/admin/pricing/service-rates/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { ServiceRatesTable } from './components/ServiceRatesTable';

export default async function ServiceRatesPage() {
  const serviceRates = await prisma.serviceRate.findMany({
    orderBy: { serviceType: 'asc' }
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Service Rates</h1>
      <ServiceRatesTable initialRates={serviceRates} />
    </div>
  );
}
```

Create `src/app/(dashboard)/admin/pricing/service-rates/components/ServiceRatesTable.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { ServiceRate, ServiceType, RateUnit } from '@prisma/client';

interface ServiceRatesTableProps {
  initialRates: ServiceRate[];
}

export function ServiceRatesTable({ initialRates }: ServiceRatesTableProps) {
  const [rates, setRates] = useState(initialRates);
  const [editing, setEditing] = useState<number | null>(null);
  const [formData, setFormData] = useState<Partial<ServiceRate>>({});

  function startEdit(rate: ServiceRate) {
    setEditing(rate.id);
    setFormData(rate);
  }

  async function handleSave() {
    if (!editing) return;
    
    try {
      const res = await fetch(`/api/admin/pricing/service-rates/${editing}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      
      const updated = await res.json();
      setRates(rates.map(r => r.id === editing ? updated : r));
      setEditing(null);
    } catch (error) {
      console.error(error);
    }
  }

  function formatCurrency(amount: number | string) {
    return `$${Number(amount).toFixed(2)}`;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50">
          <tr>
            <th className="text-left p-3">Service Type</th>
            <th className="text-left p-3">20mm Rate</th>
            <th className="text-left p-3">40mm Rate</th>
            <th className="text-left p-3">Unit</th>
            <th className="text-left p-3">Min Charge</th>
            <th className="text-left p-3">Status</th>
            <th className="text-left p-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rates.map((rate) => (
            <tr key={rate.id} className="border-t">
              {editing === rate.id ? (
                <>
                  <td className="p-3">{rate.serviceType}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.rate20mm?.toString() || ''}
                      onChange={(e) => setFormData({ ...formData, rate20mm: parseFloat(e.target.value) as any })}
                      className="border rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.rate40mm?.toString() || ''}
                      onChange={(e) => setFormData({ ...formData, rate40mm: parseFloat(e.target.value) as any })}
                      className="border rounded px-2 py-1 w-24"
                    />
                  </td>
                  <td className="p-3">{rate.unit}</td>
                  <td className="p-3">
                    <input
                      type="number"
                      step="0.01"
                      value={formData.minimumCharge?.toString() || ''}
                      onChange={(e) => setFormData({ ...formData, minimumCharge: e.target.value ? parseFloat(e.target.value) as any : null })}
                      className="border rounded px-2 py-1 w-24"
                      placeholder="Optional"
                    />
                  </td>
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={formData.isActive || false}
                      onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                    />
                  </td>
                  <td className="p-3">
                    <button
                      onClick={handleSave}
                      className="text-green-600 mr-2"
                    >
                      Save
                    </button>
                    <button
                      onClick={() => setEditing(null)}
                      className="text-gray-600"
                    >
                      Cancel
                    </button>
                  </td>
                </>
              ) : (
                <>
                  <td className="p-3 font-medium">{rate.name}</td>
                  <td className="p-3">{formatCurrency(rate.rate20mm)}</td>
                  <td className="p-3">{formatCurrency(rate.rate40mm)}</td>
                  <td className="p-3">{rate.unit}</td>
                  <td className="p-3">{rate.minimumCharge ? formatCurrency(rate.minimumCharge) : '-'}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs ${rate.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                      {rate.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="p-3">
                    <button
                      onClick={() => startEdit(rate)}
                      className="text-blue-600"
                    >
                      Edit
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

### Step 2: Create Delivery Zones Admin Page

Create `src/app/(dashboard)/admin/pricing/delivery-zones/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { DeliveryZonesTable } from './components/DeliveryZonesTable';

export default async function DeliveryZonesPage() {
  const zones = await prisma.deliveryZone.findMany({
    orderBy: { maxDistanceKm: 'asc' }
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Delivery Zones</h1>
      <DeliveryZonesTable initialZones={zones} />
    </div>
  );
}
```

Create `src/app/(dashboard)/admin/pricing/delivery-zones/components/DeliveryZonesTable.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { DeliveryZone } from '@prisma/client';

interface DeliveryZonesTableProps {
  initialZones: DeliveryZone[];
}

export function DeliveryZonesTable({ initialZones }: DeliveryZonesTableProps) {
  const [zones, setZones] = useState(initialZones);
  const [editing, setEditing] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [formData, setFormData] = useState<Partial<DeliveryZone>>({});

  async function handleSave() {
    try {
      if (creating) {
        const res = await fetch('/api/admin/pricing/delivery-zones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const newZone = await res.json();
        setZones([...zones, newZone]);
        setCreating(false);
      } else if (editing) {
        const res = await fetch(`/api/admin/pricing/delivery-zones/${editing}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
        const updated = await res.json();
        setZones(zones.map(z => z.id === editing ? updated : z));
        setEditing(null);
      }
      
      setFormData({});
    } catch (error) {
      console.error(error);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this delivery zone?')) return;
    
    try {
      await fetch(`/api/admin/pricing/delivery-zones/${id}`, {
        method: 'DELETE'
      });
      setZones(zones.filter(z => z.id !== id));
    } catch (error) {
      console.error(error);
    }
  }

  function startCreate() {
    setCreating(true);
    setFormData({ isActive: true });
  }

  return (
    <div>
      <button
        onClick={startCreate}
        className="mb-4 bg-blue-600 text-white px-4 py-2 rounded"
      >
        + Add Zone
      </button>
      
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-3">Zone Name</th>
              <th className="text-left p-3">Max Distance (km)</th>
              <th className="text-left p-3">Base Charge</th>
              <th className="text-left p-3">Rate per km</th>
              <th className="text-left p-3">Status</th>
              <th className="text-left p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {creating && (
              <tr className="border-t bg-blue-50">
                <td className="p-3">
                  <input
                    type="text"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Zone name"
                    className="border rounded px-2 py-1 w-full"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    value={formData.maxDistanceKm || ''}
                    onChange={(e) => setFormData({ ...formData, maxDistanceKm: parseInt(e.target.value) })}
                    placeholder="km"
                    className="border rounded px-2 py-1 w-20"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.baseCharge?.toString() || ''}
                    onChange={(e) => setFormData({ ...formData, baseCharge: parseFloat(e.target.value) as any })}
                    placeholder="$"
                    className="border rounded px-2 py-1 w-24"
                  />
                </td>
                <td className="p-3">
                  <input
                    type="number"
                    step="0.01"
                    value={formData.ratePerKm?.toString() || ''}
                    onChange={(e) => setFormData({ ...formData, ratePerKm: parseFloat(e.target.value) as any })}
                    placeholder="$/km"
                    className="border rounded px-2 py-1 w-24"
                  />
                </td>
                <td className="p-3">Active</td>
                <td className="p-3">
                  <button onClick={handleSave} className="text-green-600 mr-2">Save</button>
                  <button onClick={() => { setCreating(false); setFormData({}); }} className="text-gray-600">Cancel</button>
                </td>
              </tr>
            )}
            
            {zones.map((zone) => (
              <tr key={zone.id} className="border-t">
                {editing === zone.id ? (
                  <>
                    <td className="p-3">
                      <input
                        type="text"
                        value={formData.name || ''}
                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                        className="border rounded px-2 py-1 w-full"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        value={formData.maxDistanceKm || ''}
                        onChange={(e) => setFormData({ ...formData, maxDistanceKm: parseInt(e.target.value) })}
                        className="border rounded px-2 py-1 w-20"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.baseCharge?.toString() || ''}
                        onChange={(e) => setFormData({ ...formData, baseCharge: parseFloat(e.target.value) as any })}
                        className="border rounded px-2 py-1 w-24"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="number"
                        step="0.01"
                        value={formData.ratePerKm?.toString() || ''}
                        onChange={(e) => setFormData({ ...formData, ratePerKm: parseFloat(e.target.value) as any })}
                        className="border rounded px-2 py-1 w-24"
                      />
                    </td>
                    <td className="p-3">
                      <input
                        type="checkbox"
                        checked={formData.isActive || false}
                        onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                      />
                    </td>
                    <td className="p-3">
                      <button onClick={handleSave} className="text-green-600 mr-2">Save</button>
                      <button onClick={() => setEditing(null)} className="text-gray-600">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="p-3 font-medium">{zone.name}</td>
                    <td className="p-3">{zone.maxDistanceKm} km</td>
                    <td className="p-3">${Number(zone.baseCharge).toFixed(2)}</td>
                    <td className="p-3">${Number(zone.ratePerKm).toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 rounded text-xs ${zone.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}>
                        {zone.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="p-3">
                      <button onClick={() => { setEditing(zone.id); setFormData(zone); }} className="text-blue-600 mr-2">Edit</button>
                      <button onClick={() => handleDelete(zone.id)} className="text-red-600">Delete</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
```

### Step 3: Create Templating Rates Admin Page

Create `src/app/(dashboard)/admin/pricing/templating/page.tsx`:

```typescript
import { prisma } from '@/lib/db';
import { TemplatingRateForm } from './components/TemplatingRateForm';

export default async function TemplatingRatePage() {
  const rate = await prisma.templatingRate.findFirst({
    where: { isActive: true }
  });

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Templating Rates</h1>
      <TemplatingRateForm initialRate={rate} />
    </div>
  );
}
```

Create `src/app/(dashboard)/admin/pricing/templating/components/TemplatingRateForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { TemplatingRate } from '@prisma/client';

interface TemplatingRateFormProps {
  initialRate: TemplatingRate | null;
}

export function TemplatingRateForm({ initialRate }: TemplatingRateFormProps) {
  const [formData, setFormData] = useState({
    baseCharge: initialRate?.baseCharge.toString() || '',
    ratePerKm: initialRate?.ratePerKm.toString() || ''
  });
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    
    try {
      if (initialRate) {
        await fetch(`/api/admin/pricing/templating-rates/${initialRate.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        await fetch('/api/admin/pricing/templating-rates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...formData, isActive: true })
        });
      }
      
      alert('Templating rate saved successfully');
    } catch (error) {
      console.error(error);
      alert('Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-md border rounded-lg p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">
            Base Charge ($)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.baseCharge}
            onChange={(e) => setFormData({ ...formData, baseCharge: e.target.value })}
            className="border rounded px-3 py-2 w-full"
            required
          />
          <p className="text-xs text-gray-500 mt-1">Fixed charge for templating service</p>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">
            Rate per km ($/km)
          </label>
          <input
            type="number"
            step="0.01"
            value={formData.ratePerKm}
            onChange={(e) => setFormData({ ...formData, ratePerKm: e.target.value })}
            className="border rounded px-3 py-2 w-full"
            required
          />
          <p className="text-xs text-gray-500 mt-1">Additional charge per kilometer traveled</p>
        </div>

        <button
          type="submit"
          disabled={saving}
          className="bg-blue-600 text-white px-4 py-2 rounded w-full"
        >
          {saving ? 'Saving...' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
```

### Step 4: Update Admin Pricing Navigation

Update `src/app/(dashboard)/admin/pricing/page.tsx` to add links:

```typescript
import Link from 'next/link';

export default function PricingAdminPage() {
  const sections = [
    { name: 'Price Books', href: '/admin/pricing', description: 'Manage price books' },
    { name: 'Service Rates', href: '/admin/pricing/service-rates', description: 'Cutting, polishing, installation rates' },
    { name: 'Edge Types', href: '/admin/pricing/edge-types', description: 'Edge profile pricing' },
    { name: 'Cutout Types', href: '/admin/pricing/cutout-types', description: 'Cutout pricing' },
    { name: 'Delivery Zones', href: '/admin/pricing/delivery-zones', description: 'Distance-based delivery pricing' },
    { name: 'Templating', href: '/admin/pricing/templating', description: 'Templating service rates' },
    { name: 'Pricing Rules', href: '/admin/pricing/pricing-rules', description: 'Dynamic pricing rules' },
    { name: 'Client Tiers', href: '/admin/pricing/client-tiers', description: 'Customer tier discounts' },
    { name: 'Client Types', href: '/admin/pricing/client-types', description: 'Customer types' },
  ];

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-6">Pricing Administration</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {sections.map((section) => (
          <Link
            key={section.href}
            href={section.href}
            className="border rounded-lg p-4 hover:border-blue-600 hover:shadow-md transition"
          >
            <h3 className="font-semibold mb-1">{section.name}</h3>
            <p className="text-sm text-gray-600">{section.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
```

### Verification Checklist

- [ ] Service rates page loads
- [ ] Can edit service rates (20mm/40mm variants)
- [ ] Delivery zones page loads
- [ ] Can add/edit/delete delivery zones
- [ ] Templating rate page loads
- [ ] Can update templating rate
- [ ] All changes persist to database
- [ ] Navigation links work correctly
- [ ] No TypeScript errors

### Git Instructions

```bash
git add -A
git commit -m "feat: Admin UI for service rates, delivery zones, and templating"
git push origin main
```

---

## Phase 9 Complete!

You've now completed the entire pricing model refactor. The system now supports:

✅ Thickness-specific rates (20mm vs 40mm+)
✅ Service-based pricing (Cutting, Polishing, Installation, Waterfall)
✅ Edge profile categories with additional costs
✅ Cutout categorization
✅ Delivery zones with Google Maps integration
✅ Templating rates with distance component
✅ Quote-level pricing overrides with audit trail
✅ Complete calculator refactor
✅ Admin UI for all pricing models

**Next Steps:**
- Phase 10: Company Settings & Quote Templates
- Phase 11: Email System

**Estimated Time for Phase 9:** ~12 hours total
