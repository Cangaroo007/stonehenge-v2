# Pricing API Enhancement Specification

## Overview

The current pricing calculation API (`calculateQuotePrice`) returns **aggregated totals** across all pieces. To support accurate per-piece pricing breakdown in the UI, the API should be enhanced to track and return costs **per piece**.

---

## Current Architecture

### Current Flow

```
1. Fetch all pieces for a quote
2. Calculate materials cost (total across all pieces)
3. Calculate edges cost (total across all edge types)
4. Calculate cutouts cost (total across all cutout types)
5. Apply discounts to aggregated totals
6. Return single CalculationResult with aggregate breakdowns
```

### Current Response Structure

```typescript
interface CalculationResult {
  quoteId: string;
  subtotal: number;
  total: number;
  breakdown: {
    materials: {
      totalAreaM2: number;
      baseRate: number;
      subtotal: number;
      discount: number;
      total: number;
    };
    edges: {
      totalLinearMeters: number;
      byType: EdgeBreakdown[];      // Aggregated by edge type
      subtotal: number;
      discount: number;
      total: number;
    };
    cutouts: {
      items: CutoutBreakdown[];      // Aggregated by cutout type
      subtotal: number;
      discount: number;
      total: number;
    };
  };
}
```

---

## Proposed Enhancement

### Enhanced Flow

```
1. Fetch all pieces for a quote
2. FOR EACH PIECE:
   a. Calculate material cost for this piece
   b. Calculate perimeter (for cutting/polishing)
   c. Calculate edge costs for this piece's edges
   d. Calculate cutout costs for this piece's cutouts
   e. Apply proportional discounts
   f. Store piece-level breakdown
3. Aggregate piece totals for quote-level totals
4. Return enhanced result with both per-piece AND aggregate data
```

### Enhanced Response Structure

```typescript
interface EnhancedCalculationResult extends CalculationResult {
  // Keep existing aggregate breakdown
  breakdown: {
    materials: MaterialBreakdown;
    edges: EdgeBreakdown;
    cutouts: CutoutBreakdown;
    delivery?: DeliveryBreakdown;
    templating?: TemplatingBreakdown;
    
    // NEW: Add per-piece breakdowns
    pieces?: PiecePricingBreakdown[];
  };
}

interface PiecePricingBreakdown {
  pieceId: number;
  pieceName: string;
  dimensions: {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };
  
  // Fabrication costs for this piece
  fabrication: {
    cutting?: {
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage?: number;
    };
    polishing?: {
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage?: number;
    };
    edges: Array<{
      side: 'top' | 'bottom' | 'left' | 'right';
      edgeTypeId: string;
      edgeTypeName: string;
      lengthMm: number;
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage?: number;
    }>;
    cutouts: Array<{
      cutoutTypeId: string;
      cutoutTypeName: string;
      quantity: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
    }>;
    subtotal: number;
  };
  
  // Material costs for this piece
  materials: {
    areaM2: number;
    baseRate: number;
    thicknessMultiplier: number;
    baseAmount: number;
    discount: number;
    total: number;
    discountPercentage?: number;
  };
  
  // Total for this piece
  pieceTotal: number;
}
```

---

## Implementation Steps

### 1. Modify Pricing Calculator Service

**File:** `src/lib/services/pricing-calculator-v2.ts`

#### Step 1.1: Add Per-Piece Calculation Function

```typescript
/**
 * Calculate pricing breakdown for a single piece
 */
function calculatePiecePricing(
  piece: PieceWithFeatures,
  edgeTypes: Map<string, EdgeTypeWithRate>,
  cutoutTypes: Map<string, CutoutTypeWithRate>,
  appliedRules: PricingRuleWithOverrides[],
  context: PricingContext
): PiecePricingBreakdown {
  const breakdown: PiecePricingBreakdown = {
    pieceId: piece.id,
    pieceName: piece.name || `Piece ${piece.id}`,
    dimensions: {
      lengthMm: piece.lengthMm,
      widthMm: piece.widthMm,
      thicknessMm: piece.thicknessMm,
    },
    fabrication: {
      edges: [],
      cutouts: [],
      subtotal: 0,
    },
    materials: {
      areaM2: (piece.lengthMm * piece.widthMm) / 1_000_000,
      baseRate: piece.material?.pricePerSqm.toNumber() ?? 0,
      thicknessMultiplier: getThicknessMultiplier(piece.thicknessMm),
      baseAmount: 0,
      discount: 0,
      total: 0,
    },
    pieceTotal: 0,
  };

  // Calculate perimeter for cutting/polishing
  const perimeter = 2 * (piece.lengthMm + piece.widthMm) / 1000; // in meters
  
  // Calculate edges with discounts
  const edgeSides = ['top', 'bottom', 'left', 'right'] as const;
  for (const side of edgeSides) {
    const edgeTypeId = piece[`edge${side.charAt(0).toUpperCase() + side.slice(1)}`];
    if (!edgeTypeId) continue;
    
    const edgeType = edgeTypes.get(edgeTypeId);
    if (!edgeType) continue;
    
    const edgeLengthMm = side === 'top' || side === 'bottom' 
      ? piece.widthMm 
      : piece.lengthMm;
    const linearMeters = edgeLengthMm / 1000;
    
    // Apply pricing rules for this edge
    const { rate, discount, discountPercentage } = applyEdgeRules(
      edgeType,
      appliedRules,
      piece
    );
    
    const baseAmount = linearMeters * rate;
    const total = baseAmount - discount;
    
    breakdown.fabrication.edges.push({
      side,
      edgeTypeId: edgeType.id,
      edgeTypeName: edgeType.name,
      lengthMm: edgeLengthMm,
      linearMeters,
      rate,
      baseAmount,
      discount,
      total,
      discountPercentage,
    });
  }
  
  // Calculate cutouts
  for (const cutout of piece.cutouts || []) {
    const cutoutType = cutoutTypes.get(cutout.cutoutTypeId);
    if (!cutoutType) continue;
    
    const { rate, discount } = applyCutoutRules(cutoutType, appliedRules, piece);
    const baseAmount = cutout.quantity * rate;
    const total = baseAmount - discount;
    
    breakdown.fabrication.cutouts.push({
      cutoutTypeId: cutout.cutoutTypeId,
      cutoutTypeName: cutout.cutoutTypeName || cutoutType.name,
      quantity: cutout.quantity,
      rate,
      baseAmount,
      discount,
      total,
    });
  }
  
  // Calculate cutting/polishing if edges exist
  if (breakdown.fabrication.edges.length > 0) {
    // Cutting
    const cuttingRate = getCuttingRate(context);
    const cuttingBase = perimeter * cuttingRate;
    const cuttingDiscount = applyCuttingDiscount(cuttingBase, appliedRules);
    
    breakdown.fabrication.cutting = {
      linearMeters: perimeter,
      rate: cuttingRate,
      baseAmount: cuttingBase,
      discount: cuttingDiscount,
      total: cuttingBase - cuttingDiscount,
      discountPercentage: (cuttingDiscount / cuttingBase) * 100,
    };
    
    // Polishing
    const polishingRate = getPolishingRate(context);
    const polishingBase = perimeter * polishingRate;
    const polishingDiscount = applyPolishingDiscount(polishingBase, appliedRules);
    
    breakdown.fabrication.polishing = {
      linearMeters: perimeter,
      rate: polishingRate,
      baseAmount: polishingBase,
      discount: polishingDiscount,
      total: polishingBase - polishingDiscount,
      discountPercentage: (polishingDiscount / polishingBase) * 100,
    };
  }
  
  // Calculate fabrication subtotal
  breakdown.fabrication.subtotal = 
    (breakdown.fabrication.cutting?.total ?? 0) +
    (breakdown.fabrication.polishing?.total ?? 0) +
    breakdown.fabrication.edges.reduce((sum, e) => sum + e.total, 0) +
    breakdown.fabrication.cutouts.reduce((sum, c) => sum + c.total, 0);
  
  // Calculate materials
  const materialBase = breakdown.materials.areaM2 * 
    breakdown.materials.baseRate * 
    breakdown.materials.thicknessMultiplier;
  const materialDiscount = applyMaterialDiscount(materialBase, appliedRules, piece);
  
  breakdown.materials.baseAmount = materialBase;
  breakdown.materials.discount = materialDiscount;
  breakdown.materials.total = materialBase - materialDiscount;
  breakdown.materials.discountPercentage = (materialDiscount / materialBase) * 100;
  
  // Calculate piece total
  breakdown.pieceTotal = breakdown.fabrication.subtotal + breakdown.materials.total;
  
  return breakdown;
}
```

#### Step 1.2: Integrate into Main Calculation

```typescript
export async function calculateQuotePrice(
  quoteId: string,
  options: PricingOptions = {}
): Promise<EnhancedCalculationResult> {
  // ... existing setup code ...
  
  // NEW: Calculate per-piece breakdowns
  const pieceBreakdowns: PiecePricingBreakdown[] = [];
  
  for (const room of quote.rooms) {
    for (const piece of room.pieces) {
      const pieceBreakdown = calculatePiecePricing(
        piece,
        edgeTypesMap,
        cutoutTypesMap,
        appliedRules,
        context
      );
      pieceBreakdowns.push(pieceBreakdown);
    }
  }
  
  // ... existing aggregate calculations ...
  
  // Return enhanced result
  return {
    ...existingResult,
    breakdown: {
      ...existingResult.breakdown,
      pieces: pieceBreakdowns,  // NEW: Add per-piece data
    },
  };
}
```

### 2. Update Type Definitions

**File:** `src/lib/types/pricing.ts`

```typescript
export interface PiecePricingBreakdown {
  pieceId: number;
  pieceName: string;
  dimensions: {
    lengthMm: number;
    widthMm: number;
    thicknessMm: number;
  };
  fabrication: {
    cutting?: {
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage?: number;
    };
    polishing?: {
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage?: number;
    };
    edges: Array<{
      side: 'top' | 'bottom' | 'left' | 'right';
      edgeTypeId: string;
      edgeTypeName: string;
      lengthMm: number;
      linearMeters: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
      discountPercentage?: number;
    }>;
    cutouts: Array<{
      cutoutTypeId: string;
      cutoutTypeName: string;
      quantity: number;
      rate: number;
      baseAmount: number;
      discount: number;
      total: number;
    }>;
    subtotal: number;
  };
  materials: {
    areaM2: number;
    baseRate: number;
    thicknessMultiplier: number;
    baseAmount: number;
    discount: number;
    total: number;
    discountPercentage?: number;
  };
  pieceTotal: number;
}

export interface EnhancedCalculationResult extends CalculationResult {
  breakdown: CalculationResult['breakdown'] & {
    pieces?: PiecePricingBreakdown[];
  };
}
```

### 3. Update Frontend Component

**File:** `src/app/(dashboard)/quotes/[id]/builder/components/PricingSummary.tsx`

Replace the approximation logic with direct use of the API data:

```typescript
// OLD: Approximation
const pieceBreakdowns = useMemo(() => {
  // ... complex approximation logic ...
}, [calculation, pieces]);

// NEW: Use API data directly
const pieceBreakdowns = calculation?.breakdown.pieces || [];
```

Update the component to use the accurate per-piece data:

```typescript
{pieceBreakdowns.map((pieceData) => (
  <div key={pieceData.pieceId} className="mb-4 pb-4 border-b">
    <div className="font-semibold text-sm mb-2">
      {pieceData.pieceName} ({formatDimensions(
        pieceData.dimensions.lengthMm,
        pieceData.dimensions.widthMm,
        pieceData.dimensions.thicknessMm,
        unitSystem
      )})
    </div>
    
    {/* Cutting */}
    {pieceData.fabrication.cutting && (
      <div className="ml-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Cutting: {pieceData.fabrication.cutting.linearMeters.toFixed(1)} Lm × {formatCurrency(pieceData.fabrication.cutting.rate)}</span>
          <span>Base: {formatCurrency(pieceData.fabrication.cutting.baseAmount)}</span>
        </div>
        {pieceData.fabrication.cutting.discount > 0 && (
          <div className="flex justify-end text-green-600 text-xs">
            Disc: -{formatCurrency(pieceData.fabrication.cutting.discount)} 
            ({pieceData.fabrication.cutting.discountPercentage?.toFixed(0)}%)
          </div>
        )}
        <div className="flex justify-end font-medium">
          Total: {formatCurrency(pieceData.fabrication.cutting.total)}
        </div>
      </div>
    )}
    
    {/* Polishing */}
    {pieceData.fabrication.polishing && (
      // ... similar structure ...
    )}
    
    {/* Edges */}
    {pieceData.fabrication.edges.map((edge, idx) => (
      <div key={idx} className="ml-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <span>Edge ({edge.edgeTypeName}, {edge.side}): {edge.linearMeters.toFixed(1)} Lm × {formatCurrency(edge.rate)}</span>
          <span>Base: {formatCurrency(edge.baseAmount)}</span>
        </div>
        {/* ... discount and total ... */}
      </div>
    ))}
    
    {/* Cutouts */}
    {pieceData.fabrication.cutouts.map((cutout, idx) => (
      // ... similar structure ...
    ))}
    
    <div className="ml-4 pt-2 border-t font-semibold flex justify-between">
      <span>PIECE SUBTOTAL:</span>
      <span>{formatCurrency(pieceData.pieceTotal)}</span>
    </div>
  </div>
))}
```

---

## Benefits of Enhancement

### 1. **Accuracy**
- Exact costs per piece, not approximations
- Precise discount calculations per item
- Correct edge-specific pricing

### 2. **Transparency**
- Customers can see exactly what they're paying for each piece
- Easier to understand pricing breakdown
- Better for quoting individual pieces

### 3. **Flexibility**
- Support for piece-specific discounts in the future
- Easier to add piece-level pricing rules
- Better support for custom pricing per piece

### 4. **Debugging**
- Easier to trace pricing issues
- Can verify calculations per piece
- Better audit trail

---

## Performance Considerations

### Current Performance
- Calculates ~50ms for a typical 5-piece quote
- Single pass through pieces

### Enhanced Performance
- Estimated ~80-100ms for same quote
- Additional per-piece tracking overhead
- **Still acceptable** for real-time calculation

### Optimization Strategies
1. **Parallel Processing**: Calculate pieces in parallel (if needed)
2. **Caching**: Cache piece calculations if dimensions/features unchanged
3. **Lazy Loading**: Only calculate per-piece breakdowns when requested (add query param)

Example with lazy loading:
```typescript
// Client request with flag
POST /api/quotes/[id]/calculate
{
  "includePerPieceBreakdown": true
}

// API only calculates per-piece data if requested
if (body.includePerPieceBreakdown) {
  result.breakdown.pieces = calculatePieceBreakdowns(...);
}
```

---

## Migration Strategy

### Phase 1: Add New Fields (Non-Breaking)
- Add `pieces` array to breakdown (optional)
- Keep existing aggregate calculations
- Both old and new data available

### Phase 2: Update Frontend (Gradual)
- Update PricingSummary to use new data when available
- Fallback to approximation if not available
- No breaking changes

### Phase 3: Make Default (After Testing)
- Always include per-piece breakdowns
- Remove approximation logic from frontend
- Update all pricing displays

---

## Testing Strategy

### Unit Tests
```typescript
describe('calculatePiecePricing', () => {
  it('should calculate cutting cost correctly', () => {
    const piece = createTestPiece({ lengthMm: 2400, widthMm: 800 });
    const result = calculatePiecePricing(piece, ...);
    
    expect(result.fabrication.cutting?.linearMeters).toBe(6.4);
    expect(result.fabrication.cutting?.total).toBeGreaterThan(0);
  });
  
  it('should apply discounts correctly', () => {
    const piece = createTestPiece({ thicknessMm: 40 });
    const rules = [createDiscountRule({ percentage: 10 })];
    const result = calculatePiecePricing(piece, edgeTypes, cutoutTypes, rules, context);
    
    expect(result.fabrication.cutting?.discountPercentage).toBe(10);
  });
});
```

### Integration Tests
```typescript
describe('Enhanced Pricing API', () => {
  it('should return per-piece breakdowns', async () => {
    const result = await calculateQuotePrice(testQuoteId, {
      includePerPieceBreakdown: true
    });
    
    expect(result.breakdown.pieces).toBeDefined();
    expect(result.breakdown.pieces?.length).toBeGreaterThan(0);
    
    // Sum of piece totals should equal aggregate total
    const sumOfPieces = result.breakdown.pieces.reduce(
      (sum, p) => sum + p.pieceTotal, 0
    );
    expect(sumOfPieces).toBeCloseTo(result.subtotal, 2);
  });
});
```

---

## Estimated Effort

- **API Enhancement**: 4-6 hours
- **Type Definitions**: 1 hour
- **Frontend Update**: 2-3 hours
- **Testing**: 3-4 hours
- **Documentation**: 1-2 hours

**Total: ~12-16 hours**

---

## Priority

**Recommendation: Medium Priority**

Current approximation works well for most use cases. Enhancement provides:
- Better accuracy (important for large quotes)
- Better transparency (important for customer trust)
- Better maintainability (easier to debug)

Can be implemented after other critical features are complete.
