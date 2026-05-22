// packages/pricing/src/functions/area-material.ts
//
// calc.area.material — area × material rate. Pure function. Input area is
// already a `Decimal` so the caller is responsible for the m² conversion
// (see `computeAreaM2` in geometry).

import { Decimal } from "decimal.js";

import type { MaterialRate, QuoteLineItem } from "../types.js";

export function calcAreaMaterial(
  areaM2: Decimal,
  material: MaterialRate,
): QuoteLineItem {
  const unitRate = new Decimal(material.ratePerM2);
  const lineTotal = areaM2.times(unitRate);
  return {
    description: `${material.name} — area`,
    quantity: areaM2,
    unit: "m²",
    unitRate,
    lineTotal,
  };
}
