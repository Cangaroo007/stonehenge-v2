import { calculateMaterialCost } from './pricing-calculator-v2';

const decimal = (value: number) => ({ toNumber: () => value });

describe('calculateMaterialCost', () => {
  it('keeps collection-only material labels generic while using the pricing material', () => {
    const result = calculateMaterialCost(
      [
        {
          length_mm: 1200,
          width_mm: 600,
          thickness_mm: 20,
          material_id: 42,
          material_name: 'Cosentino - Dekton',
          material_collection_only: true,
          material_collection_name: 'Dekton',
          materials: {
            id: 42,
            name: 'Hidden Most Expensive Colour',
            slab_length_mm: 3200,
            slab_width_mm: 1600,
            price_per_sqm: decimal(300),
            price_per_slab: decimal(1200),
            price_per_square_metre: decimal(300),
            margin_override_percent: null,
            supplier: null,
          },
        },
      ],
      'PER_SLAB',
      1,
      undefined,
      true
    );

    expect(result.subtotal).toBe(1200);
    expect(result.materialName).toBe('Cosentino - Dekton');
    expect(result.byMaterial?.[0]?.materialName).toBe('Cosentino - Dekton');
  });

  it('does not add catalogue slab pricing on top of piece material overrides', () => {
    const result = calculateMaterialCost(
      [
        {
          length_mm: 800,
          width_mm: 500,
          thickness_mm: 20,
          material_id: 42,
          materials: {
            id: 42,
            name: 'Alpha Zero Full Slab Fallback',
            slab_length_mm: 3200,
            slab_width_mm: 1600,
            price_per_sqm: decimal(450),
            price_per_slab: decimal(2304),
            price_per_square_metre: decimal(450),
            margin_override_percent: null,
            supplier: null,
          },
          overrideMaterialCost: decimal(224.4),
        },
      ],
      'PER_SLAB',
      1,
      undefined,
      false
    );

    expect(result.subtotal).toBe(224.4);
    expect(result.byMaterial).toBeUndefined();
  });

  it('combines overridden piece material costs with normal catalogue pieces once', () => {
    const result = calculateMaterialCost(
      [
        {
          length_mm: 800,
          width_mm: 500,
          thickness_mm: 20,
          material_id: 42,
          materials: {
            id: 42,
            name: 'Offcut',
            slab_length_mm: 3200,
            slab_width_mm: 1600,
            price_per_sqm: decimal(450),
            price_per_slab: decimal(2304),
            price_per_square_metre: decimal(450),
            margin_override_percent: null,
            supplier: null,
          },
          overrideMaterialCost: decimal(224.4),
        },
        {
          length_mm: 1200,
          width_mm: 600,
          thickness_mm: 20,
          material_id: 42,
          materials: {
            id: 42,
            name: 'Offcut',
            slab_length_mm: 3200,
            slab_width_mm: 1600,
            price_per_sqm: decimal(450),
            price_per_slab: decimal(2304),
            price_per_square_metre: decimal(450),
            margin_override_percent: null,
            supplier: null,
          },
        },
      ],
      'PER_SQUARE_METRE',
      undefined,
      0,
      false
    );

    expect(result.subtotal).toBe(548.4);
    expect(result.byMaterial?.[0]?.totalCost).toBe(324);
  });
});
