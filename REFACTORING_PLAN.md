# Stonehenge Refactoring Analysis & Improvement Plan

## Executive Summary

Stonehenge is a Next.js 14 stone installation quoting application with a complex but functional calculation system. The codebase is mature but has architectural limitations preventing it from efficiently handling large unit block developments and lacks visual tooling for stone layout.

**Current Lines of Code:** 971 lines in pricing-calculator-v2.ts (too monolithic)

---

## Current Architecture Analysis

### Tech Stack (Confirmed)
- **Frontend:** Next.js 14 + React 18 + TypeScript + Tailwind CSS
- **Backend:** Next.js API Routes + Prisma ORM
- **Database:** PostgreSQL
- **Storage:** AWS S3 (R2) for files
- **Integrations:** Google Maps (distance), Anthropic AI (drawing analysis), PDF generation

### Current Data Model
```
Quote → QuoteRoom → QuotePiece
```
**Problem:** Flat structure with no concept of multi-unit projects, phases, or project hierarchy.

### Current Calculation System (pricing-calculator-v2.ts)

**Strengths:**
- Comprehensive pricing logic (material, edges, cutouts, services)
- Support for thickness variants (20mm vs 40mm+)
- Pricing rules engine with client tiers
- Manual overrides at quote and piece level
- Delivery & templating cost calculation

**Critical Issues:**

1. **Monolithic Calculator (971 lines)**
   - Single file does everything
   - Hard to test, maintain, or extend
   - No separation of concerns

2. **Inefficient Calculation Flow**
   - Multiple database queries per calculation
   - No caching of expensive operations
   - Join costs calculated as side-effect in loop
   - Material cost distribution logic is convoluted

3. **No Unit Block Support**
   - Quote = one project only
   - No volume pricing tiers
   - No phasing/schedule support
   - No unit-level tracking

4. **No Visual Tool Infrastructure**
   - No canvas/SVG framework
   - No slab visualization
   - No interactive layout selection

5. **Missing Industry Features**
   - No waste factor management
   - No slab remnant tracking
   - No production scheduling
   - No bulk import for large projects

---

## Improvement Plan

### Phase 1: Refactor Calculation Engine (Week 1-2)

**Goal:** Break down monolithic calculator into testable, maintainable modules

#### 1.1 Create Modular Calculator Structure
```
src/lib/calculators/
├── index.ts                 # Main calculator facade
├── types.ts                 # Shared calculator types
├── material-calculator.ts   # Material + slab optimization
├── edge-calculator.ts       # Edge profile costs
├── cutout-calculator.ts     # Cutout costs
├── service-calculator.ts    # Cutting, polishing, installation
├── join-calculator.ts       # Slab join costs
├── delivery-calculator.ts   # Distance + zone pricing
├── templating-calculator.ts # Templating costs
├── pricing-rules-engine.ts  # Apply discounts/overrides
└── cache/
    ├── calculation-cache.ts # Redis/memory cache layer
    └── invalidation.ts      # Cache invalidation logic
```

#### 1.2 Key Refactoring Changes

**Material Calculator:**
```typescript
// BEFORE: Convoluted distribution logic in single function
// AFTER: Clean separation
interface MaterialCalculation {
  strategy: 'PER_SLAB' | 'PER_SQUARE_METRE';
  slabCount: number;
  unitCost: Decimal;
  totalCost: Decimal;
  wasteFactor: number;
}

class MaterialCalculator {
  calculate(options: MaterialOptions): MaterialCalculation {
    // Clear, testable logic
  }
  
  estimateSlabs(pieces: Piece[], material: Material): SlabEstimate {
    // Use existing optimizer but make it injectable
  }
}
```

**Service Calculator:**
```typescript
// Separate cutting, polishing, installation into strategies
interface ServiceStrategy {
  calculate(piece: Piece, context: PricingContext): ServiceCost;
}

class CuttingStrategy implements ServiceStrategy { ... }
class PolishingStrategy implements ServiceStrategy { ... }
class InstallationStrategy implements ServiceStrategy { ... }
```

**Caching Layer:**
```typescript
// Cache expensive calculations
- Slab optimization results
- Distance calculations (Google Maps API)
- Pricing rule lookups
- Material price lookups
```

### Phase 2: Unit Block Development Support (Week 3-4)

**Goal:** Add project hierarchy for multi-unit developments

#### 2.1 New Data Model

```prisma
// Project hierarchy
model Project {
  id              String   @id @default(cuid())
  name            String
  type            ProjectType  // SINGLE_DWELLING, UNIT_BLOCK, COMMERCIAL
  customerId      Int
  
  // For unit blocks
  units           Unit[]
  phases          ProjectPhase[]
  
  // Aggregate pricing
  volumeTier      VolumeTier?
  
  quotes          Quote[]  // One quote per unit or combined
}

model Unit {
  id          String   @id @default(cuid())
  projectId   String
  unitNumber  String   // "Unit 101", "Apt 5B"
  floor       Int?
  building    String?  // For multi-building projects
  status      UnitStatus // PENDING, IN_PROGRESS, COMPLETED
  
  quotes      Quote[]
}

model ProjectPhase {
  id          String   @id @default(cuid())
  projectId   String
  name        String   // "Phase 1 - Foundations", "Tower A"
  startDate   DateTime?
  endDate     DateTime?
  units       Unit[]
}

// Volume-based pricing tiers
model VolumeTier {
  id              String   @id @default(cuid())
  name            String   // "Small", "Medium", "Large", "Enterprise"
  minSquareMeters Decimal
  maxSquareMeters Decimal?
  
  // Discounts applied at project level
  materialDiscountPercent Decimal
  fabricationDiscountPercent Decimal
  installationDiscountPercent Decimal
}
```

#### 2.2 Unit Block Calculation Features

**Volume-Based Pricing:**
```typescript
class VolumePricingCalculator {
  calculateProjectPricing(project: Project): ProjectPricing {
    const totalArea = this.calculateTotalArea(project);
    const tier = this.determineVolumeTier(totalArea);
    
    return {
      unitPricing: this.calculatePerUnit(project.units),
      volumeDiscounts: this.applyVolumeDiscounts(tier),
      projectTotal: this.aggregateWithDiscounts(project, tier),
      phasedDelivery: this.calculatePhasedDelivery(project.phases),
    };
  }
}
```

**Per-Unit vs Project Totals:**
- Individual unit quotes with shared material pricing
- Bulk material ordering optimization
- Shared template calculations across units
- Consolidated vs itemized billing options

**Phased Delivery Scheduling:**
```typescript
interface PhaseSchedule {
  phaseId: string;
  units: Unit[];
  estimatedMaterials: MaterialEstimate;
  deliveryDate: Date;
  installationWindow: DateRange;
  phasePricing: PhasePricing;
}
```

### Phase 3: Visual Stone Layout Tool (Week 5-6)

**Goal:** Interactive visual tool for stone selection and layout

#### 3.1 Architecture

```
src/components/visual-layout/
├── VisualLayoutTool.tsx       # Main component
├── Canvas/
│   ├── SlabCanvas.tsx         # HTML5 Canvas-based slab viewer
│   ├── PieceOverlay.tsx       # Draggable piece overlays
│   └── GridOverlay.tsx        # Measurement grid
├── hooks/
│   ├── useSlabImage.ts        # Load slab texture images
│   ├── usePiecePlacement.ts   # Drag/drop logic
│   └── useZoomPan.ts          # Zoom/pan controls
├── utils/
│   ├── coordinate-transform.ts # Canvas ↔ real-world coords
│   └── placement-optimizer.ts  # Auto-placement suggestions
└── types.ts
```

#### 3.2 Features

**Interactive Slab Viewer:**
```typescript
interface VisualLayoutState {
  selectedSlab: SlabImage;
  placedPieces: PlacedPiece[];
  zoom: number;
  pan: { x: number; y: number };
  activeTool: 'select' | 'place' | 'measure';
}

interface PlacedPiece {
  pieceId: string;
  position: { x: number; y: number };  // In mm, relative to slab
  rotation: 0 | 90 | 180 | 270;
  qualityZone: 'A' | 'B' | 'C';  // Stone quality zones
}
```

**Visual Features:**
- Upload slab photos with real dimensions
- Drag-and-drop piece placement
- Rotation controls
- Auto-placement optimizer (minimize waste)
- Quality zone marking (A=best, C=veins/inclusions)
- Cut line visualization
- Remnant tracking

**Technology Options:**

| Approach | Pros | Cons | Recommendation |
|----------|------|------|----------------|
| HTML5 Canvas | Fast, full control | Manual event handling | **Primary** |
| SVG | Scalable, DOM-based | Performance with many elements | Secondary |
| Fabric.js | Rich features | Heavy dependency | Optional |
| Konva.js | React-friendly | Learning curve | Optional |

**Recommended: HTML5 Canvas with custom React hooks**

### Phase 4: Performance & Scalability (Week 7)

**Goal:** Handle 50+ unit projects efficiently

#### 4.1 Database Optimizations

```typescript
// Add indexes for common queries
@@index([customerId, status])
@@index([projectId, unitId])
@@index([createdAt])

// Denormalize for read performance
// Add calculated fields that update on write
model Quote {
  pieceCount        Int      @default(0)
  totalAreaSqm      Decimal  @default(0)
  cachedTotal       Decimal? // Store calculated total
  lastCalculatedAt  DateTime?
}
```

#### 4.2 Calculation Performance

```typescript
// Batch calculations for large projects
class BatchCalculator {
  async calculateProjectBatch(projectId: string): Promise<BatchResult> {
    const units = await this.getUnits(projectId);
    
    // Parallel calculation with concurrency limit
    const results = await Promise.all(
      units.map(unit => this.calculateUnit(unit))
    );
    
    return this.aggregateResults(results);
  }
}
```

#### 4.3 Caching Strategy

```typescript
// Multi-level caching
interface CacheStrategy {
  // L1: In-memory (per-request)
  requestCache: Map<string, CalculationResult>;
  
  // L2: Redis (shared across instances)
  redisCache: RedisClient;
  
  // L3: Materialized view (database)
  materializedView: 'quote_totals_view';
}
```

### Phase 5: Industry-Specific Enhancements (Week 8)

**Goal:** Add features specific to stone installation industry

#### 5.1 Waste Management
```typescript
class WasteOptimizer {
  calculateWasteFactors(project: Project): WasteAnalysis {
    return {
      theoreticalWaste: number;     // Based on geometry
      industryStandard: number;     // Typical 15-20%
      optimizedWaste: number;       // With remnant utilization
      remnantValue: number;         // Reusable offcuts
    };
  }
}
```

#### 5.2 Remnant Tracking
```prisma
model SlabRemnant {
  id           String   @id @default(cuid())
  materialId   Int
  
  // Physical dimensions
  originalSlab String   // Reference to original slab
  lengthMm     Int
  widthMm      Int
  areaSqm      Decimal
  
  // Availability
  isAvailable  Boolean  @default(true)
  reservedFor  String?  // Quote/project ID
  
  // Photos
  photos       String[] // R2 storage keys
}
```

#### 5.3 Production Scheduling
```typescript
interface ProductionSchedule {
  jobId: string;
  stages: ProductionStage[];
  estimatedCompletion: Date;
}

type ProductionStage = 
  | 'TEMPLATE'
  | 'CUTTING'
  | 'EDGE_PROFILE'
  | 'POLISHING'
  | 'QUALITY_CHECK'
  | 'DELIVERY'
  | 'INSTALLATION';
```

---

## Implementation Priority

### Immediate (High Impact, Low Effort)
1. **Refactor calculator** → Better maintainability
2. **Add caching** → Performance boost
3. **Optimize database queries** → Faster calculations

### Short-term (High Impact, Medium Effort)
4. **Unit block data model** → Enable new market
5. **Volume pricing tiers** → Competitive advantage
6. **Basic visual tool** → Differentiator

### Long-term (High Impact, High Effort)
7. **Advanced visual tool** → Full slab visualization
8. **Production scheduling** → Operations integration
9. **Remnant marketplace** → Revenue opportunity

---

## Code Quality Improvements

### Testing Strategy
```
src/lib/calculators/__tests__/
├── material-calculator.test.ts
├── edge-calculator.test.ts
├── integration.test.ts
└── fixtures/
    ├── sample-quotes.ts
    └── expected-results.ts
```

### Type Safety
- Remove `any` types (currently present in cutouts JSON handling)
- Strict null checks
- Branded types for IDs (type QuoteId = string & { __brand: 'QuoteId' })

### Documentation
- JSDoc for all calculator functions
- README for each module
- Architecture Decision Records (ADRs)

---

## Migration Path

### Database Migration
1. Create new tables (Project, Unit, Phase) alongside existing
2. Backfill data from existing quotes
3. Gradual migration with feature flags
4. Deprecate old schema

### Code Migration
1. Create new calculator modules alongside v2
2. Add feature flag: `useCalculatorV3`
3. A/B test on staging
4. Gradual rollout

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Calculation time (50 pieces) | ~2s | <500ms |
| Code coverage | ~0% | >80% |
| Lines per calculator file | 971 | <200 |
| Max units per quote | 1 | 100+ |
| Visual tool availability | None | Available |

---

## Next Steps

1. **Review this plan** with stakeholders
2. **Prioritize phases** based on business needs
3. **Set up testing infrastructure** before refactoring
4. **Create feature branches** for each phase
5. **Begin Phase 1** (calculator refactoring)

---

*Generated: 2026-02-06*
*Analysis based on Stonehenge codebase at commit HEAD*
