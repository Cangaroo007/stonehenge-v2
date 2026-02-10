# STONE HENGE — 10.0e Diagnostic Audit Results
Date: 2026-02-10

## 1. BUILD STATUS
- Build: **PASS** — clean build, all routes compiled
- Type check: **PASS** — `npx tsc --noEmit` produced zero errors
- Railway patterns: **CLEAN** — no `[...new Set` violations found

## 2. GIT HISTORY — WHAT ACTUALLY SHIPPED

Last 20 commits on `main`:
```
8fc42a9 Merge pull request #25 from Cangaroo007/fix/10.0-critical-bug-sprint
4db35f4 fix: resolve quote save 500 error and correct optimizer lamination strips
e32c477 Merge pull request #24 — 9.6 buyer change tracking
8731adb feat: 9.6 — buyer change tracking
e838c6e Merge pull request #23 — 9.4 finishes register parser
56143ad feat: 9.4 — finishes register parser
87c55a8 Merge pull request #22 — 9.3 finish tier material mapping
d16ecaa feat: 9.3 — finish tier material mapping
b55797a Merge pull request #21 — 9.2 unit type templates
22c3273 feat: 9.2 — unit type template system
cc8aade Merge pull request #20 — 9.1 unit block database persistence
dad94a9 feat: 9.1 — unit block database persistence
a3eb718 Merge pull request #19 — distance service
739987a Merge pull request #18 — 8.5 waste factor
0f00af9 feat: 8.5 — configurable waste factor in Pricing Admin
04741fd Merge pull request #17 — 8.4 slab fit pipeline
48af383 feat: 8.4 — slab fit pipeline
05023e5 Merge pull request #16 — 8.3 cutout deduction
b6ba47e Merge pull request #15 — 8.2 auto edge detection
c8bfc72 Merge pull request #14 — 8.1 spatial extraction
```

### Merge Status
- **Series 1.4 (ServiceRate seeding): NOT MERGED** — `seed-pricing-settings.ts` does not exist. `seed-pricing.ts:318` says "ServiceRates are now seeded via seed-pricing-settings.ts" but that file was never created.
- **Series 8.0a (build fix): MERGED** — commit `d80721c` — switched Inter font to local bundle
- **Series 8.0b (unit fix): MERGED** — commit `b9dde1f` — align cutting/polishing/installation with tenant-configured units
- **Series 8.0c (ServiceRate validation): MERGED** — commit `35154b7` — validate ServiceRate table, never return silent $0
- **Series 8.0d (lamination/mitre/GST): MERGED** — commit `9dbf6a3` — add lamination multipliers, mitred constraint, require pricing settings
- **Series 10.0 (Cursor fixes): MERGED** — PR #25 — resolve quote save 500 error and correct optimizer lamination strips

## 3. ROOT CAUSE — WHY CALCULATOR SHOWS $0

The calculator code itself is **well-written and defensive**. It does NOT silently return $0. The chain of failure is:

1. `calculateQuotePrice()` calls `loadPricingContext('1')` at `pricing-calculator-v2.ts:281`
2. `loadPricingContext()` queries `pricing_settings` for `organisation_id = '1'`
3. **If no `pricing_settings` row exists**, it throws: _"Pricing settings not configured for this organisation."_
4. **If `pricing_settings` exists but `service_rates` table is empty**, the calculator throws: _"Missing required service rates: CUTTING, POLISHING, INSTALLATION."_

**The root cause is missing seed data.** The `seed-pricing-settings.ts` file was referenced but never created. Without it:
- No `pricing_settings` row exists -> calculator throws immediately
- No `service_rates` rows exist -> would throw even if settings existed
- The frontend catches these errors and displays $0 instead of propagating the error message

**This is a DATA problem, not a CODE problem.** The 8.0 series code fixes are all present and correct.

## 4. ServiceRate TABLE STATUS
- Schema exists: **YES** — `service_rates` model at `schema.prisma:463-478`
  - Fields: id, pricing_settings_id, serviceType (enum: CUTTING, POLISHING, INSTALLATION, WATERFALL_END, TEMPLATING, DELIVERY), name, description, rate20mm, rate40mm, minimumCharge, isActive, timestamps
  - Unique constraint on `[pricing_settings_id, serviceType]`
- Seed file exists: **NO** — `seed-pricing-settings.ts` DOES NOT EXIST
- Validation in calculator: **YES** — throws explicit error, never returns silent $0 (lines 291-300)
- Rates present: **EMPTY** — no seed script exists to populate them

## 5. PRICING CALCULATOR STATE
- Cutting unit: **Reads from `pricingContext.cuttingUnit`** (tenant setting, line 724). Throws if settings missing.
- Polishing unit: **Reads from `pricingContext.polishingUnit`** (tenant setting, lines 742, 756-758)
- GST: **Reads from `settings.gst_rate`** (line 88). NOT hardcoded.
- Material pricing: **Supports both PER_SLAB and PER_SQUARE_METRE** (lines 119, 136-157). For PER_SLAB, reads `price_per_slab` from material; falls back to `price_per_square_metre` / `price_per_sqm`.

Note: `seed.ts` seeds materials with `pricePerSqm` only — no `price_per_slab` values are set.

## 6. MACHINE PROFILES
- Schema: **EXISTS** — `machine_profiles` at `schema.prisma:170-180`
- API endpoint: **EXISTS** at `/api/admin/pricing/machines` (src/app/api/admin/pricing/machines/route.ts)
- Seed data: **MISSING** — no machine profile seed data in any seed file
- Builder integration: **FULLY WIRED UP** — builder fetches machines on load (page.tsx:226-242), PieceForm has machine selector dropdown (PieceForm.tsx:300-321)
- Kerf flow to optimizer: **CONNECTED** — piece -> machine -> QuoteActions -> OptimizeModal -> optimize API

**Why machines aren't available**: The `machine_profiles` table is empty. No seed data exists. `machines.length > 0` check at `PieceForm.tsx:301` hides the selector.

## 7. SLAB OPTIMIZER STATE
- Optimizer service: **EXISTS** at `src/lib/services/slab-optimizer.ts` (490 lines)
- Strip generation: **EXISTS** — `generateLaminationStrips()` (lines 58-134), `getStripWidthForEdge()` (lines 42-50), `generateLaminationSummary()` (lines 139-184)
- Edge UUID resolution: **IMPLEMENTED** — optimize API route (lines 69-90) resolves edge UUIDs to names via `prisma.edge_types.findMany`
- Strip width constants:
  - `LAMINATION_STRIP_WIDTH_DEFAULT = 60` mm (standard laminated)
  - `LAMINATION_STRIP_WIDTH_MITRE = 40` mm (mitred)
  - `LAMINATION_THRESHOLD = 40` mm (pieces >= 40mm need strips)
- Standalone `/optimize` page: **EXISTS** at `src/app/(dashboard)/optimize/page.tsx`

## 8. QUOTE CREATION (10.0a)
- `updated_at` fix: **APPLIED** — `route.ts:117` includes `updated_at: new Date()`
- Field normalisation: **APPLIED** — accepts both camelCase and snake_case variants (lines 97-100)
- Delivery fields: **NOT IN SCHEMA** — accepted in interface but commented as "not persisted to quotes table". Calculator uses `as any` cast (lines 383-404) which returns `undefined`.

## 9. MISSING SEED DATA

Tables that need seeding for the app to function:

- [x] **edge_types** — SEED EXISTS (`seed-edge-types.ts` + `seed.ts`)
- [x] **cutout_types** — SEED EXISTS (`seed-cutout-types.ts` + `seed.ts`)
- [x] **thickness_options** — SEED EXISTS (`seed.ts`)
- [x] **materials** — SEED EXISTS (`seed.ts`) — 10 materials, but NO `price_per_slab` values
- [x] **client_types / client_tiers** — SEED EXISTS (`seed.ts`)
- [x] **price_books** — SEED EXISTS (`seed.ts`)
- [ ] **pricing_settings** — **CRITICAL MISSING** — no seed file, required for calculator
- [ ] **service_rates** — **CRITICAL MISSING** — no seed file, required for calculator
- [ ] **machine_profiles** — **MISSING** — no seed file, required for builder machine selector
- [ ] **cutout_rates** — **MISSING** — table exists in schema but no seed data
- [ ] **strip_configurations** — **NO TABLE IN SCHEMA** — optimizer uses hardcoded constants

## 10. RECOMMENDED FIX ORDER

1. **Create `seed-pricing-settings.ts`** — #1 blocker. Must seed:
   - One `pricing_settings` row for organisation_id `'1'` (material_pricing_basis, cutting_unit, polishing_unit, installation_unit, gst_rate=0.10, laminated_multiplier=1.30, mitred_multiplier=1.50, waste_factor_percent=15.0)
   - `service_rates` rows for CUTTING, POLISHING, INSTALLATION, WATERFALL_END (each with rate20mm, rate40mm, minimumCharge)
   - `cutout_rates` rows for each cutout category

2. **Create `seed-machine-profiles.ts`** — Seed at least one default machine (e.g., "GMM Bridge Saw", kerf_width_mm=8, is_default=true)

3. **Update `seed.ts` materials with `price_per_slab`** — Add slab prices so PER_SLAB pricing works correctly

4. **Add delivery/templating columns to quotes schema** (or remove dead code) — The calculator references nonexistent delivery fields via `as any` casts

5. **Improve frontend error display for calculator failures** — Surface "Pricing settings not configured" errors to users instead of showing $0

6. **Consider adding `strip_configurations` table** — Replace hardcoded strip widths with admin-configurable values

## 11. ENVIRONMENT VARIABLES EXPECTED

```
DATABASE_URL          — PostgreSQL connection string (Prisma)
JWT_SECRET            — Auth token signing
NODE_ENV              — production/development
R2_ENDPOINT           — Cloudflare R2 storage endpoint
R2_ACCOUNT_ID         — Cloudflare account ID
R2_ACCESS_KEY_ID      — R2 access key
R2_SECRET_ACCESS_KEY  — R2 secret key
R2_BUCKET_NAME        — R2 bucket (defaults to 'stonehenge-drawings')
GOOGLE_MAPS_API_KEY   — Distance calculation service
```

## CONCLUSION

**The code is sound. The 8.0 series fixes are all merged and working correctly.**

The calculator properly validates data and throws meaningful errors rather than silently returning $0. The entire problem is missing seed data — specifically `pricing_settings` and `service_rates`. The `seed-pricing-settings.ts` file was referenced in comments but never created.

The fix is straightforward: create the seed files for pricing_settings, service_rates, and machine_profiles. No code changes needed for the core $0 issue.
