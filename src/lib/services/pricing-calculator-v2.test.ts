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
});
