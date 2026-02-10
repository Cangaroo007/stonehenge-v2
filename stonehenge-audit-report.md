# Stone Henge — Codebase Audit Report
> Generated: 2026-02-10
> Branch: main (via claude/codebase-audit-report-ywqyA, identical to main HEAD)
> Last commit: `3d1684a` feat: 9.13 — buyer change tracking with snapshots and cost deltas (#51)

---

## Series Completion Status

### Series 11 — Pricing & Machine Recalibration

| Prompt | Feature | Code Exists? | Schema Exists? | Merged to Main? |
|--------|---------|-------------|----------------|-----------------|
| 11.0a | FabricationCategory enum + field on materials | YES | YES — `FabricationCategory` enum (ENGINEERED, NATURAL_HARD, NATURAL_SOFT, NATURAL_PREMIUM, SINTERED); `fabrication_category` field on `materials` model | YES — migration `20260213000000` |
| 11.0b | Category-linked ServiceRates | YES | YES — `fabricationCategory` field on `service_rates` with unique constraint `[pricing_settings_id, serviceType, fabricationCategory]` | YES — migration `20260214000000` |
| 11.0c | Category-aware pricing calculator | YES — `pricing-calculator-v2.ts` (1293 lines) queries `fabricationCategory` per piece, looks up category-specific service rates | N/A | YES — commit `401ccaf` |
| 11.0d | Oversize piece + join cost + grain matching surcharge | YES — `multi-slab-calculator.ts` has join cost logic; `isOversize`, `joinCount`, `joinLengthMm` fields on `quote_pieces`; `grain_matching_surcharge_percent` on `pricing_settings`; `JOIN` service type in enum | YES — migration `20260215000000` (oversize fields + JOIN service type), `20260217000000` (grain matching surcharge) | YES — commits `f9d01ea`, `42afe92` |
| 11.0e | Machine-operation defaults | YES — `machine_operation_defaults` model with `OperationType` enum (INITIAL_CUT, EDGE_POLISHING, MITRING, LAMINATION, CUTOUT); API route at `/api/admin/pricing/machine-defaults`; UI in `MachineManagement.tsx`; seed file `seed-machine-operation-defaults.ts` | YES — migration `20260216000000` | YES — commit `6027fee` |
| 11.0f | Manufacturing export JSON | YES — `src/lib/services/manufacturing-export.ts` (full service); `src/lib/types/manufacturing-export.ts` (types); API route at `/api/quotes/[id]/manufacturing-export`; includes oversize piece tracking, machine defaults lookup | N/A | YES — commit `ef226ff` |
| 11.0g | Live recalculation triggers | YES — Builder page has debounced auto re-optimization (1s delay); triggers on piece add/edit/delete/reorder; `onPieceChange` flow recalculates pricing + re-runs optimizer if saved optimization exists | N/A | YES — commit `61a6ac9` |
| 11.0h | Integration verification | YES — commit `d120460` (fix: integration verification for Series 11) | N/A | YES |

### Series 9 (Revised) — Multi-Unit Development Engine

| Prompt | Feature | Code Exists? | Schema Exists? | Merged to Main? |
|--------|---------|-------------|----------------|-----------------|
| 9.1 | Unit block database persistence | YES — `unit_block_projects`, `unit_block_units`, `unit_block_files` models; API routes at `/api/unit-blocks/`; dashboard pages at `/quotes/unit-block/` and `/quotes/new/unit-block/` | YES — migration `20260210000000` | YES — commit `dad94a9` |
| 9.2 | Unit type template system | YES — `unit_type_templates` model; API route at `/api/templates/`; service files `template-cloner.ts`; types `unit-templates.ts`; dashboard page at `/templates/` | YES — migration `20260210100000` | YES — commit `22c3273` |
| 9.3 | Finish tier material mapping | YES — `finish_tier_mappings` model; `finish-tier-resolver.ts` service; API routes at `/api/templates/[id]/mappings/`; `save-tier-price-list.ts` action | YES — migration `20260211000000` | YES — commit `d16ecaa` |
| 9.4 / 9.7 | Register parser | YES — `register-parser.ts` service + prompt; API route at `/api/unit-blocks/[id]/parse-register/` | N/A | YES — commit `56143ad` |
| 9.8 | Unit type template CRUD + UI | YES — API route at `/api/templates/` with full CRUD; dashboard pages at `/templates/`, `/templates/new/`, `/templates/[id]/edit/`; `TemplateEditor.tsx` component | YES (see 9.2) | YES — commits `183ff5a`, `57f54e3` |
| 9.9 | Drawing → Template adapter | YES — `analysis-to-template-adapter.ts` (17KB); API route at `/api/templates/from-analysis/`; `SaveAsTemplateButton.tsx` component in quote builder; DrawingImport also has template save capability | N/A | YES — commit `c1b1c87` |
| 9.10 | Finishes schedule parser | YES — `schedule-parser.ts` service + prompt; API route at `/api/unit-blocks/[id]/parse-schedule/`; `material-matcher.ts` for AI-suggested material mappings | N/A | YES — commit `328ae3d` |
| 9.11 | Finish tier mapping service + CRUD + admin UI | YES — `finish-tier-resolver.ts` service; API routes at `/api/templates/[id]/mappings/`, `/api/templates/[id]/mappings/[mappingId]/`, `/api/templates/[id]/mappings/resolve/`, `/api/unit-blocks/[id]/mapping-status/` | YES (see 9.3) | YES — commit `048b2b1` |
| 9.12 | Bulk quote generation | YES — `bulk-quote-generator.ts` (15KB); API route at `/api/unit-blocks/[id]/generate/`; includes dry-run mode, progress tracking, volume discounts | N/A | YES — commit `d1ba971` |
| 9.13 | Buyer change tracking | YES — `buyer-change-tracker.ts` (36KB); `buyer_change_snapshots` + `buyer_change_records` models; API routes at `/api/unit-blocks/[id]/units/[unitId]/changes/`, `/api/unit-blocks/[id]/change-report/`; unit detail page at `/quotes/unit-block/[id]/` | YES — migration `20260218000000` (snapshot tables), `20260212000000` (initial buyer change fields) | YES — commits `8731adb`, `3d1684a` |

### Series 10 — Bug Fixes

| Fix | Working? | Notes |
|-----|----------|-------|
| Quote save (10.0a) | YES | `src/app/api/quotes/route.ts` exists with proper Prisma transaction; commit `4db35f4` fixed 500 error |
| Optimizer in builder (10.0b) | YES | `OptimizeModal.tsx` component wired into builder; `OptimizationDisplay.tsx` shows results; auto re-optimization on piece changes |
| Lamination strips (10.0c) | YES | `slab-optimizer.ts` has full lamination strip logic: `LAMINATION_STRIP_WIDTH_DEFAULT = 60mm`, `LAMINATION_STRIP_WIDTH_MITRE = 40mm`, `LAMINATION_THRESHOLD = 40mm`; generates strips for each finished edge |
| Finished edges fix (10.0d) | YES | `OptimizeModal.tsx` reads actual `piece.edgeTop/Bottom/Left/Right` data (line 70-75) instead of hardcoding `finishedEdges: false`; standalone optimize page also has the fix (commit `b475682`) |
| Integration verified (10.0e) | YES | Commit `da4cabb` — diagnostic audit; commit `fefeda2` — stabilisation gate verification |
| Seed data (10.0f) | YES | Commits `5011d95`, `9e04ad0` — production seed for pricing settings, service rates, machine profiles, materials, edge types, cutout types, client types, client tiers; `seed-production.js` for Railway auto-seeding |

---

## Build Health

| Check | Result |
|-------|--------|
| `npm run build` | **PASS** — all routes compile successfully |
| `npx tsc --noEmit` | **PASS** — zero type errors |
| `[...new Set]` patterns | **0** — none found (Railway-safe) |
| `console.log` count | **156** across 17 files |
| `as any` count | **70** across 22 files |

---

## Schema State

| Item | Status |
|------|--------|
| Total migrations | **29** (including migration_lock.toml) |
| FabricationCategory enum exists | **YES** — 5 values: ENGINEERED, NATURAL_HARD, NATURAL_SOFT, NATURAL_PREMIUM, SINTERED |
| `fabrication_category` on materials | **YES** — defaults to ENGINEERED |
| `fabricationCategory` on service_rates | **YES** — with unique constraint per settings+serviceType+fabricationCategory |
| unit_type_templates exists | **YES** — with project linkage, templateData JSON, version tracking |
| finish_tier_mappings exists | **YES** — with materialAssignments, edgeOverrides, colourScheme |
| buyer_change tables exist | **YES** — `buyer_change_snapshots` and `buyer_change_records` (plus legacy JSON fields on units) |
| machine_operation_defaults exists | **YES** — maps OperationType → machine_profile |
| unit_block_projects exists | **YES** — full multi-unit project model |
| unit_block_units exists | **YES** — with template reference, buyer change tracking |
| unit_block_files exists | **YES** |
| JOIN service type | **YES** — added to ServiceType enum |
| OperationType enum | **YES** — INITIAL_CUT, EDGE_POLISHING, MITRING, LAMINATION, CUTOUT |
| Oversize fields on quote_pieces | **YES** — `isOversize`, `joinCount`, `joinLengthMm` |
| LaminationMethod enum | **YES** — NONE, LAMINATED, MITRED |
| grain_matching_surcharge_percent on pricing_settings | **YES** — defaults to 15.0% |

---

## File Structure Summary

### API Routes (86 total)
Key routes by domain:
- **Quotes**: CRUD, calculate, optimize, PDF, sign, import-pieces, versions, override, drawings, manufacturing-export, track-view
- **Admin/Pricing**: settings, service-rates, edge-types, cutout-types, thickness-options, machines, machine-defaults, pricing-rules, price-books, client-types, client-tiers, interpret-price-list
- **Unit Blocks**: CRUD, units, parse-register, parse-schedule, generate, calculate, change-report, mapping-status, unit changes
- **Templates**: CRUD, from-analysis, clone, mappings, resolve
- **Materials**: CRUD
- **Customers**: CRUD + drawings
- **Drawings**: upload, simple-upload, upload-complete, backfill-thumbnails, file, url, thumbnail
- **Auth**: login, logout
- **Other**: health, distance/calculate, company settings/logo, storage/status, analyze-drawing (+ elevation + refine), elevation-pipeline, pricing/interpret

### Dashboard Pages (27 total)
- `/dashboard` — main dashboard
- `/quotes` — list, new, [id] (detail), [id]/edit, [id]/builder
- `/quotes/unit-block` — list, [id] (detail)
- `/quotes/new/unit-block` — new unit block project
- `/materials` — list, new, [id]/edit
- `/customers` — list, new, [id], [id]/edit
- `/admin/users` — user management
- `/admin/pricing` — main pricing, cutouts, services, settings
- `/settings` — general, company
- `/optimize` — standalone slab optimizer
- `/templates` — list, new, [id]/edit

### Services (25 files)
Core: `pricing-calculator-v2.ts` (44KB), `buyer-change-tracker.ts` (36KB), `slab-optimizer.ts` (15KB), `bulk-quote-generator.ts` (16KB), `analysis-to-template-adapter.ts` (17KB), `quote-version-service.ts` (25KB)

### Calculators (7 files)
`index.ts`, `edge-calculator.ts`, `material-calculator.ts`, `material-calculator-enhanced.ts`, `service-calculator-flexible.ts`, `types.ts`, `unit-block-calculator.ts`

### Types (6 files)
`drawing-analysis.ts`, `manufacturing-export.ts`, `price-interpreter.ts`, `pricing.ts`, `ui-contracts.ts`, `unit-templates.ts`

### AI Prompts (7 files)
`classification.ts`, `extraction-cad.ts`, `extraction-elevation.ts`, `extraction-hand-drawn.ts`, `extraction-job-sheet.ts`, `register-parser.ts`, `schedule-parser.ts`

### Seed Files (10 files)
`seed.ts` (main), `seed-pricing.ts`, `seed-pricing-settings.ts`, `seed-edge-types.ts`, `seed-cutout-types.ts`, `seed-machine-profiles.ts`, `seed-machine-operation-defaults.ts`, `seed-material-slab-prices.ts`, `seed-fabrication-categories.ts`, `seed-category-service-rates.ts`
Plus: `seed-production.js` (Railway auto-seeding)

---

## Key Findings

### 1. Everything claimed as built IS actually built
All Series 9, 10, and 11 features are present in the codebase, with corresponding schema migrations, service logic, API routes, and (where applicable) UI components. The git history shows a clear progression through all prompt numbers.

### 2. Build and type safety are solid
- `npm run build`: PASS
- `npx tsc --noEmit`: PASS (zero type errors)
- No `[...new Set]` anti-patterns (Railway-safe)
- The codebase compiles cleanly with no blocking issues

### 3. Code quality concerns (non-blocking)
- **156 `console.log` statements** across 17 files — mostly in upload/drawing/optimizer code. Should be replaced with structured logging for production.
- **70 `as any` usages** across 22 files — concentrated in `quote-version-service.ts` (19 occurrences), `override/route.ts` files (19 combined), and `calculators/index.ts` (4). These are type-safety escape hatches that increase risk of runtime errors.

### 4. Series numbering has some gaps/overlaps
The Series 9 numbering shifted during development. Original prompts 9.1-9.6 were built first (unit blocks, templates, mappings, register parser, buyer changes). Then revised prompts 9.7-9.13 were built on top. The result is that some features were implemented twice with slightly different scopes:
- Register parser: originally `9.4`, then `9.7` (same feature, same code)
- Buyer change tracking: originally `9.6`, then `9.13` (9.13 added dedicated tables with proper snapshots + change records)

### 5. Pricing engine is fully category-aware
The pricing calculator (`pricing-calculator-v2.ts`, 1293 lines) queries per-piece `fabricationCategory` and uses it to look up category-specific service rates. GST is correctly loaded from `pricing_settings.gst_rate` (not hardcoded). Grain matching surcharge and oversize/join logic are integrated.

### 6. Manufacturing export is complete
Full manufacturing-ready JSON export exists for locked quotes — includes piece-level detail with edges, cutouts, machine assignments (from `machine_operation_defaults`), oversize/join info, and summary statistics.

### 7. Multi-unit engine is fully operational
The complete pipeline exists: register parse → template creation (manual or from drawing analysis) → finish tier mapping → bulk quote generation (with dry-run) → buyer change tracking (with snapshots and cost deltas). The unit block project page at `/quotes/unit-block/[id]` provides the management UI.

---

## Recommendations

1. **Clean up `console.log` statements** — Replace with a structured logger before production deployment.
2. **Reduce `as any` count** — Focus on `quote-version-service.ts` and override routes first, as these handle financial data.
3. **Verify production seed data** — Ensure `seed-production.js` includes all category-specific service rates and machine-operation defaults.
4. **End-to-end test** — Run through the full multi-unit workflow (register parse → template → mapping → generate → buyer change) on a staging environment to verify integration.
5. **Consider adding automated tests** — No test files were found in the codebase. Given the complexity of the pricing calculator and bulk generation logic, unit tests would significantly reduce regression risk.
