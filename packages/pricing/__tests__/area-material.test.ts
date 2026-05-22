// packages/pricing/__tests__/area-material.test.ts

import { Decimal } from "decimal.js";
import { describe, expect, it } from "vitest";

import { calcAreaMaterial } from "../src/index.js";

import { CAESARSTONE_5143 } from "./_fixtures.js";

describe("calcAreaMaterial", () => {
  it("3200×600 rectangle in Caesarstone @ $450/m² is $864.00", () => {
    const line = calcAreaMaterial(new Decimal("1.92"), CAESARSTONE_5143);
    expect(line.lineTotal.toFixed(2)).toBe("864.00");
    expect(line.unit).toBe("m²");
    expect(line.quantity.equals(new Decimal("1.92"))).toBe(true);
    expect(line.unitRate.equals(new Decimal("450.00"))).toBe(true);
  });

  it("zero area produces zero line total", () => {
    const line = calcAreaMaterial(new Decimal("0"), CAESARSTONE_5143);
    expect(line.lineTotal.equals(new Decimal("0"))).toBe(true);
  });
});
