# Stone Henge — Architecture Report

**Date:** 2026-02-28
**Commit:** 348676412b7cc6ef4d39487d421f05a54edfba6f
**Audit ID:** AUDIT-7

---

## 1. Directory Structure

### Top-Level Tree

```
.
├── LexSolv-AI/
├── docs/
│   └── audits/
├── prisma/
│   ├── data/
│   └── migrations/
├── public/
│   └── fonts/
├── scripts/
│   └── hooks/
├── src/
│   ├── app/
│   ├── components/
│   ├── hooks/
│   ├── lib/
│   └── types/
└── uploads/
```

### Source Directory Detail (depth 3)

```
src/
src/app/
  src/app/(dashboard)/admin
  src/app/(dashboard)/customers
  src/app/(dashboard)/dashboard
  src/app/(dashboard)/materials
  src/app/(dashboard)/optimize
  src/app/(dashboard)/quotes
  src/app/(dashboard)/settings
  src/app/(dashboard)/templates
  src/app/(portal)/portal
  src/app/api/admin
  src/app/api/analyze-drawing
  src/app/api/auth
  src/app/api/company
  src/app/api/custom-charge-suggestions
  src/app/api/customers
  src/app/api/distance
  src/app/api/drawing-corrections
  src/app/api/drawings
  src/app/api/edge-templates
  src/app/api/elevation-pipeline
  src/app/api/health
  src/app/api/materials
  src/app/api/pricing
  src/app/api/pricing-rules
  src/app/api/quote-templates
  src/app/api/quotes
  src/app/api/room-presets
  src/app/api/starter-templates
  src/app/api/storage
  src/app/api/suggestions
  src/app/api/suppliers
  src/app/api/templates
  src/app/api/unit-blocks
  src/app/api/upload
  src/app/login
src/components/
  src/components/customers
  src/components/drawing-analysis
  src/components/drawings
  src/components/layout
  src/components/pricing
  src/components/quotes
  src/components/slab-optimizer
  src/components/ui
  src/components/unit-block
  src/components/visual-layout
    src/components/visual-layout/utils
src/hooks/
src/lib/
  src/lib/actions
  src/lib/constants
  src/lib/contexts
  src/lib/prompts
  src/lib/saas
  src/lib/services
  src/lib/storage
  src/lib/types
  src/lib/utils
src/types/
```

### File Counts by Type

| Extension | Count |
|-----------|-------|
| `.ts`     | 246   |
| `.tsx`    | 172   |
| `.css`    | 1     |
| **Total** | **419** |

---

## 2. Routes

### Layouts (4 total)

| Layout File | Auth Mechanism | Notes |
|---|---|---|
| `src/app/layout.tsx` | None | Root HTML shell, font loading, `<Toaster>` |
| `src/app/(dashboard)/layout.tsx` | `getCurrentUser()` → redirect to `/login` | Primary auth gate for all staff pages |
| `src/app/(portal)/layout.tsx` | `getCurrentUser()` + role=CUSTOMER check | Portal gate; non-customers → `/dashboard` |
| `src/app/(dashboard)/admin/pricing/layout.tsx` | None (client component) | Tab navigation; inherits auth from dashboard layout |

### Pages (39 total)

#### Root Pages

| Path | Purpose | Auth |
|---|---|---|
| `/` | Root redirect → `/dashboard` or `/login` | `getCurrentUser()` |
| `/login` | Login form (email/password) | None (public) |

#### Dashboard Group (35 pages) — all protected by dashboard layout

| Path | Purpose | Page-Level Auth |
|---|---|---|
| `/dashboard` | Main dashboard with stats and recent quotes | `requireAuth()` |
| `/admin/pricing` | Pricing config (edge types, cutout types, thickness, tiers, rules, etc.) | None (client) |
| `/admin/pricing/cutouts` | Cutout category rate management | None (client) |
| `/admin/pricing/edges` | Edge category rate management | None (client) |
| `/admin/pricing/services` | Service rate management | None (client) |
| `/admin/pricing/settings` | Pricing settings (waste factor, GST, unit system, etc.) | None (client) |
| `/admin/users` | User management — list, create, edit, roles, permissions | None (client) |
| `/customers` | Customer list | `requireAuth()` |
| `/customers/[id]` | Customer detail (contacts, locations, drawings tabs) | None (client) |
| `/customers/[id]/edit` | Edit customer form | None (client) |
| `/customers/new` | Create new customer | None (client) |
| `/materials` | Materials list with suppliers tab | None (client) |
| `/materials/[id]/edit` | Edit material form | None (client) |
| `/materials/new` | Create new material | None (client) |
| `/materials/suppliers` | Redirect → `/materials?tab=suppliers` | None (client) |
| `/materials/suppliers/[id]` | Supplier detail page | None (client) |
| `/optimize` | Slab optimization tool | None (client) |
| `/quotes` | Quotes list | `requireAuth()` |
| `/quotes/new` | New quote wizard (Drawing / Template / Manual) | None (server) |
| `/quotes/new/unit-block` | New unit-block quote creation | None (client) |
| `/quotes/[id]` | Quote detail view | None (server) |
| `/quotes/[id]/edit` | Redirect → `/quotes/[id]/builder` | None |
| `/quotes/[id]/builder` | Redirect → `/quotes/[id]?mode=edit` | None |
| `/quotes/[id]/drawings/[drawingId]` | Drawing full view | `getCurrentUser()` |
| `/quotes/[id]/job-view` | Full job view with detailed quote data | None (server) |
| `/quotes/[id]/pieces/[pieceId]` | Expanded piece detail view | None (server) |
| `/quotes/[id]/print` | Printable quote view | None (server) |
| `/quotes/unit-block` | Unit block projects list | None (client) |
| `/quotes/unit-block/[id]` | Unit block project detail | None (client) |
| `/settings` | Settings hub with sub-setting links | None (server) |
| `/settings/company` | Company settings editor | None (client) |
| `/settings/quote-templates` | Quote PDF template management | None (client) |
| `/templates` | Unit type templates list | None (server) |
| `/templates/new` | New template creation | None |
| `/templates/[id]/edit` | Edit template | None (server) |

#### Portal Group (2 pages) — protected by portal layout (CUSTOMER role only)

| Path | Purpose | Page-Level Auth |
|---|---|---|
| `/portal` | Customer portal dashboard — shows customer's quotes | `getCurrentUser()` |
| `/portal/quotes/[id]` | Quote detail in customer portal | `getCurrentUser()` + `hasPermissionAsync()` |

### API Routes (121 total)

#### Unauthenticated Routes (8 routes)

| Route | Methods | Auth | Purpose |
|---|---|---|---|
| `/api/auth/login` | POST | None | Login endpoint |
| `/api/auth/logout` | POST | None | Logout endpoint |
| `/api/health` | GET | None | Database health check |
| `/api/health/quote-system` | GET | None | Detailed system health |
| `/api/storage/status` | GET | None | R2 storage diagnostics |
| `/api/company/logo/view` | GET | None | Serve company logo from R2 |
| `/api/distance/calculate` | POST | None | Delivery distance/cost calculation |
| `/api/pricing-rules` | GET, POST | **None** | **SECURITY: Pricing rules CRUD with no auth** |

#### Partially Authenticated Routes (3 routes — GET public, PUT protected)

| Route | Methods | Auth |
|---|---|---|
| `/api/pricing/cutout-category-rates` | GET (none), PUT (`requireAuth()`) | Partial |
| `/api/pricing/edge-category-rates` | GET (none), PUT (`requireAuth()`) | Partial |
| `/api/pricing/edge-compatibility` | GET (none), PUT (`requireAuth()`) | Partial |

#### Admin Pricing Routes (21 routes — all `requireAuth()`)

| Route | Methods |
|---|---|
| `/api/admin/pricing/client-tiers` | GET, POST |
| `/api/admin/pricing/client-tiers/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/client-types` | GET, POST |
| `/api/admin/pricing/client-types/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/cutout-types` | GET, POST |
| `/api/admin/pricing/cutout-types/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/edge-types` | GET, POST |
| `/api/admin/pricing/edge-types/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/interpret-price-list` | POST |
| `/api/admin/pricing/machine-defaults` | GET, PUT |
| `/api/admin/pricing/machines` | GET, POST |
| `/api/admin/pricing/machines/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/price-books` | GET, POST |
| `/api/admin/pricing/price-books/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/pricing-rules` | GET, POST |
| `/api/admin/pricing/pricing-rules/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/service-rates` | GET, POST |
| `/api/admin/pricing/service-rates/[id]` | GET, PUT, DELETE |
| `/api/admin/pricing/settings` | GET, PUT |
| `/api/admin/pricing/thickness-options` | GET, POST |
| `/api/admin/pricing/thickness-options/[id]` | GET, PUT, DELETE |

#### Admin Users Routes (2 routes — `getCurrentUser()`)

| Route | Methods |
|---|---|
| `/api/admin/users` | GET, POST |
| `/api/admin/users/[id]` | GET, PUT, DELETE |

#### Company Routes (3 routes — `getCurrentUser()`)

| Route | Methods |
|---|---|
| `/api/company/logo` | POST, DELETE |
| `/api/company/settings` | GET, PUT |
| `/api/company/logo/view` | GET (unauthenticated) |

#### Customer Routes (7 routes — `requireAuth()` + `verifyCustomerOwnership()`)

| Route | Methods |
|---|---|
| `/api/customers` | GET, POST |
| `/api/customers/[id]` | GET, PUT, DELETE |
| `/api/customers/[id]/contacts` | GET, POST |
| `/api/customers/[id]/contacts/[contactId]` | GET, PATCH, DELETE |
| `/api/customers/[id]/drawings` | GET |
| `/api/customers/[id]/locations` | GET, POST |
| `/api/customers/[id]/locations/[locationId]` | GET, PATCH, DELETE |

#### Drawing Routes (8 routes — `getCurrentUser()`)

| Route | Methods |
|---|---|
| `/api/drawings/[id]/details` | GET |
| `/api/drawings/[id]/file` | GET |
| `/api/drawings/[id]/thumbnail` | GET |
| `/api/drawings/[id]/url` | GET |
| `/api/drawings/backfill-thumbnails` | POST |
| `/api/drawings/simple-upload` | POST |
| `/api/drawings/upload-complete` | POST |
| `/api/upload/drawing` | POST |

#### Analysis Routes (6 routes — `requireAuth()`)

| Route | Methods |
|---|---|
| `/api/analyze-drawing` | POST |
| `/api/analyze-drawing/elevation` | POST |
| `/api/analyze-drawing/refine` | POST |
| `/api/elevation-pipeline` | POST |
| `/api/drawing-corrections` | GET, POST |
| `/api/drawing-corrections/stats` | GET |

#### Materials Routes (2 routes — `requireAuth()`)

| Route | Methods |
|---|---|
| `/api/materials` | GET, POST |
| `/api/materials/[id]` | GET, PUT, DELETE |

#### Supplier Routes (5 routes — `requireAuth()` with role restrictions)

| Route | Methods | Role Restriction |
|---|---|---|
| `/api/suppliers` | GET, POST | POST: ADMIN, SALES_MANAGER |
| `/api/suppliers/[id]` | GET, PUT, DELETE | PUT: ADMIN, SALES_MANAGER; DELETE: ADMIN only |
| `/api/suppliers/[id]/materials` | GET | None |
| `/api/suppliers/[id]/price-lists` | GET, POST | POST: ADMIN, SALES_MANAGER |
| `/api/suppliers/[id]/price-lists/[uploadId]/apply` | POST | ADMIN, SALES_MANAGER |

#### Quote Routes (47 routes — `requireAuth()` + `verifyQuoteOwnership()`)

| Route | Methods |
|---|---|
| `/api/quotes` | GET, POST |
| `/api/quotes/batch-create` | POST |
| `/api/quotes/create-draft` | POST |
| `/api/quotes/[id]` | GET, PUT, DELETE |
| `/api/quotes/[id]/calculate` | POST |
| `/api/quotes/[id]/custom-charges` | GET, POST |
| `/api/quotes/[id]/custom-charges/[chargeId]` | PATCH, DELETE |
| `/api/quotes/[id]/drawings` | GET, POST |
| `/api/quotes/[id]/duplicate` | POST |
| `/api/quotes/[id]/edge-allowance` | PATCH |
| `/api/quotes/[id]/import-pieces` | POST |
| `/api/quotes/[id]/machine-operations` | GET |
| `/api/quotes/[id]/manufacturing-export` | GET |
| `/api/quotes/[id]/optimize` | GET, POST |
| `/api/quotes/[id]/options` | GET, POST |
| `/api/quotes/[id]/options/[optionId]` | PUT, DELETE |
| `/api/quotes/[id]/options/[optionId]/calculate` | POST |
| `/api/quotes/[id]/options/[optionId]/overrides` | POST |
| `/api/quotes/[id]/options/[optionId]/overrides/[overrideId]` | PUT, DELETE |
| `/api/quotes/[id]/override` | POST, DELETE |
| `/api/quotes/[id]/pdf` | GET |
| `/api/quotes/[id]/piece-relationships` | GET, POST, DELETE |
| `/api/quotes/[id]/pieces` | GET, POST |
| `/api/quotes/[id]/pieces/[pieceId]` | GET, PATCH, PUT, DELETE |
| `/api/quotes/[id]/pieces/[pieceId]/duplicate` | POST |
| `/api/quotes/[id]/pieces/[pieceId]/override` | POST, DELETE |
| `/api/quotes/[id]/pieces/bulk-delete` | DELETE |
| `/api/quotes/[id]/pieces/bulk-edges` | PATCH |
| `/api/quotes/[id]/pieces/bulk-move` | PATCH |
| `/api/quotes/[id]/pieces/bulk-update` | PATCH |
| `/api/quotes/[id]/pieces/reorder` | PUT |
| `/api/quotes/[id]/readiness` | GET |
| `/api/quotes/[id]/relationships` | GET, POST |
| `/api/quotes/[id]/relationships/[relationshipId]` | PATCH, DELETE |
| `/api/quotes/[id]/rooms` | POST |
| `/api/quotes/[id]/rooms/reorder` | PUT |
| `/api/quotes/[id]/rooms/[roomId]` | PATCH, DELETE |
| `/api/quotes/[id]/rooms/[roomId]/merge` | POST |
| `/api/quotes/[id]/save-as-template` | POST |
| `/api/quotes/[id]/sign` | POST |
| `/api/quotes/[id]/status` | GET, PUT |
| `/api/quotes/[id]/track-view` | POST |
| `/api/quotes/[id]/versions` | GET |
| `/api/quotes/[id]/versions/compare` | GET |
| `/api/quotes/[id]/versions/[version]` | GET |
| `/api/quotes/[id]/versions/[version]/rollback` | POST |
| `/api/quotes/[id]/views` | GET |

#### Template and Misc Routes (17 routes — all `requireAuth()`)

| Route | Methods |
|---|---|
| `/api/edge-templates` | GET, POST, DELETE |
| `/api/edge-templates/[id]` | GET, PATCH, DELETE |
| `/api/quote-templates` | GET, POST |
| `/api/quote-templates/[id]` | GET, PUT, DELETE |
| `/api/starter-templates` | GET, POST |
| `/api/starter-templates/[id]` | GET, PATCH, DELETE |
| `/api/starter-templates/[id]/apply` | POST |
| `/api/starter-templates/[id]/roles` | GET |
| `/api/templates` | GET, POST |
| `/api/templates/[id]` | GET, PATCH, DELETE |
| `/api/templates/[id]/clone` | POST |
| `/api/templates/[id]/mappings` | GET, POST |
| `/api/templates/[id]/mappings/resolve` | GET |
| `/api/templates/[id]/mappings/[mappingId]` | GET, PATCH, DELETE |
| `/api/templates/from-analysis` | POST |
| `/api/custom-charge-suggestions` | GET |
| `/api/pricing/interpret` | POST |

#### Unit Block Routes (12 routes — all `requireAuth()`)

| Route | Methods |
|---|---|
| `/api/unit-blocks` | GET, POST |
| `/api/unit-blocks/[id]` | GET, PATCH, DELETE |
| `/api/unit-blocks/[id]/auto-generate-templates` | POST |
| `/api/unit-blocks/[id]/calculate` | POST |
| `/api/unit-blocks/[id]/change-report` | GET |
| `/api/unit-blocks/[id]/generate` | GET, POST |
| `/api/unit-blocks/[id]/mapping-status` | GET |
| `/api/unit-blocks/[id]/parse-register` | POST |
| `/api/unit-blocks/[id]/parse-schedule` | POST |
| `/api/unit-blocks/[id]/units` | GET, POST |
| `/api/unit-blocks/[id]/units/[unitId]` | PATCH, DELETE |
| `/api/unit-blocks/[id]/units/[unitId]/changes` | GET, POST |

#### Room Presets and Suggestions (3 routes — `requireAuth()`)

| Route | Methods |
|---|---|
| `/api/room-presets` | GET |
| `/api/room-presets/[id]` | DELETE |
| `/api/suggestions` | GET |

---

## 3. Components (90 total)

### By Folder

| Folder | Files | Lines | % of Total |
|---|---|---|---|
| `quotes/` | ~50 | 21,571 | 71.8% |
| `pricing/` | 3 | 1,852 | 6.2% |
| Root (`components/`) | 5 | 1,412 | 4.7% |
| `visual-layout/` | 6 | 1,313 | 4.4% |
| `customers/` | 3 | 962 | 3.2% |
| `layout/` | 2 | 721 | 2.4% |
| `slab-optimizer/` | 2 | 653 | 2.2% |
| `ui/` | 9 | 607 | 2.0% |
| `drawings/` | 3 | 519 | 1.7% |
| `unit-block/` | 1 | 225 | 0.7% |
| `drawing-analysis/` | 1 | 197 | 0.7% |

### Top 10 Largest by Line Count

| Lines | Component | Risk |
|---|---|---|
| 1,990 | `quotes/PieceVisualEditor.tsx` | CRITICAL |
| 1,284 | `quotes/PieceRow.tsx` | HIGH |
| 1,202 | `quotes/QuickViewPieceRow.tsx` | HIGH |
| 1,183 | `quotes/RoomSpatialView.tsx` | HIGH |
| 938 | `quotes/InlinePieceEditor.tsx` | HIGH |
| 904 | `pricing/TierManagement.tsx` | HIGH |
| 860 | `quotes/ManualQuoteWizard.tsx` | HIGH |
| 687 | `quotes/PartsSection.tsx` | MODERATE |
| 589 | `quotes/QuoteAdjustments.tsx` | MODERATE |
| 581 | `pricing/MachineManagement.tsx` | MODERATE |

### Components Over 500 Lines (12 total — maintenance risk)

| Lines | Component |
|---|---|
| 1,990 | `quotes/PieceVisualEditor.tsx` |
| 1,284 | `quotes/PieceRow.tsx` |
| 1,202 | `quotes/QuickViewPieceRow.tsx` |
| 1,183 | `quotes/RoomSpatialView.tsx` |
| 938 | `quotes/InlinePieceEditor.tsx` |
| 904 | `pricing/TierManagement.tsx` |
| 860 | `quotes/ManualQuoteWizard.tsx` |
| 687 | `quotes/PartsSection.tsx` |
| 589 | `quotes/QuoteAdjustments.tsx` |
| 581 | `pricing/MachineManagement.tsx` |
| 563 | `quotes/BulkMaterialSwap.tsx` |
| 540 | `quotes/FromTemplateSheet.tsx` |

### Duplicate / Overlapping Components

#### Cluster A: Piece Editors (6 components, 5,955 lines) — HIGHEST CONCERN

| Component | Lines | Purpose |
|---|---|---|
| `PieceVisualEditor.tsx` | 1,990 | Full SVG-based visual edge editor. Handles rectangular, L-shape, U-shape. |
| `PieceRow.tsx` | 1,284 | Full accordion row embedding `PieceVisualEditor` + `InlinePieceEditor`. |
| `QuickViewPieceRow.tsx` | 1,202 | Two-tier row. Comment: "Extends, never replaces PieceRow." Duplicates interface definitions. |
| `InlinePieceEditor.tsx` | 938 | Full inline form embedding `PieceVisualEditor`. |
| `MiniPieceEditor.tsx` | 489 | Compact editor with **its own SVG rendering** (duplicates `PieceVisualEditor` logic). |
| `PieceOverrideEditor.tsx` | 250 | Option-level piece override editor. |

**Issue:** `PieceRow` and `QuickViewPieceRow` duplicate identical interface definitions (`MachineOption`, `MachineOperationDefault`, `InlineEditMaterial`, `InlineEditEdgeType`). `MiniPieceEditor` re-implements SVG edge rendering instead of composing `PieceVisualEditor`.

#### Cluster B: Bulk Material Operations (2 components, 1,040 lines) — HIGH CONCERN

| Component | Lines | Purpose |
|---|---|---|
| `BulkMaterialSwap.tsx` | 563 | Full-page bulk material swap panel |
| `BulkMaterialDialog.tsx` | 477 | Modal dialog for bulk material assignment |

**Issue:** Nearly identical functionality (filter pieces → select → pick material → apply) with different containers (panel vs modal). Same `onApply` signature, same interfaces. Strong consolidation candidate.

#### Cluster C: SlabCanvas Naming Collision (2 components, 818 lines) — LOW CONCERN

| Component | Lines | Technology |
|---|---|---|
| `slab-optimizer/SlabCanvas.tsx` | 445 | SVG — read-only visualization |
| `visual-layout/SlabCanvas.tsx` | 373 | HTML Canvas — interactive drag-and-drop |

**Assessment:** Different technologies and purposes despite identical filename. Naming collision is confusing but not a functional duplicate.

#### Cluster D: Spatial/Room Visualization (4 components, 2,536 lines) — MODERATE CONCERN

`MiniSpatialDiagram.tsx` (483 lines) re-implements SVG piece rendering logic that already exists in `RoomPieceSVG.tsx` (477 lines). Both inline the `isRawEdge()` helper function separately.

---

## 4. Services

### Service Files (49 total)

| Lines | Service | Purpose |
|---|---|---|
| 1,833 | `pricing-calculator-v2.ts` | **CRITICAL** — Core pricing engine. Calculates quote prices. |
| 1,188 | `buyer-change-tracker.ts` | **HIGH** — Tracks buyer changes in unit block projects |
| 888 | `slab-optimizer.ts` | Slab layout optimization (single exported function) |
| 778 | `quote-version-service.ts` | Quote versioning and snapshot management |
| 644 | `analysis-to-template-adapter.ts` | Converts AI drawing analysis to quote templates |
| 643 | `quote-pdf-renderer.ts` | PDF generation for quotes |
| 530 | `drawing-analyzer.ts` | AI-powered drawing analysis (3 Anthropic API calls) |
| 527 | `bulk-quote-generator.ts` | Bulk quote generation for unit blocks |
| 492 | `quote-pdf-service.ts` | PDF service orchestration |
| 472 | `quote-lifecycle-service.ts` | Quote status transitions and lifecycle |
| 397 | `template-cloner.ts` | Deep-clone quote templates |
| 373 | `finish-tier-resolver.ts` | Resolve material finish tiers |
| 360 | `pricing-rules-engine.ts` | Rule-based pricing engine |
| 353 | `quote-validation.ts` | Quote data validation |
| 344 | `edge-detector.ts` | Edge profile detection from drawings |
| 343 | `room-layout-engine.ts` | Spatial room layout calculation |
| 342 | `piece-grouping.ts` | Group pieces by room/material |
| 338 | `multi-material-optimizer.ts` | Multi-material slab optimization |
| 336 | `template-auto-generator.ts` | Auto-generate templates from analysis |
| 334 | `manufacturing-export.ts` | Manufacturing/cut list export |
| 310 | `quote-readiness-service.ts` | Quote readiness checks |
| 308 | `multi-slab-calculator.ts` | Multi-slab cost calculations |
| 303 | `template-applier.ts` | Apply templates to quotes |
| 269 | `ai-price-interpreter.ts` | AI-powered price list interpretation |
| 267 | `cutout-deductor.ts` | Cutout cost deduction logic |
| 248 | `quote-option-calculator.ts` | Quote option pricing |
| 234 | `room-preset-service.ts` | Room preset management |
| 220 | `extraction-mapper.ts` | Map extracted data to schema |
| 219 | `price-list-applier.ts` | Apply parsed price lists |
| 212 | `register-parser.ts` | AI-powered register document parsing |
| 210 | `schedule-parser.ts` | AI-powered schedule document parsing |
| 209 | `template-saver.ts` | Template persistence |
| 196 | `relationship-suggest-service.ts` | Suggest piece relationships |
| 189 | `piece-relationship-service.ts` | Piece relationship CRUD |
| 187 | `cut-list-generator.ts` | Cut list generation |
| 179 | `material-matcher.ts` | Material matching/lookup |
| 178 | `analysis-to-optimizer-adapter.ts` | Convert analysis to optimizer input |
| 156 | `quote-setup-defaults.ts` | Default values for new quotes |
| 146 | `linear-layout-engine.ts` | Linear room layout calculation |
| 146 | `drawingService.ts` | Drawing file management |
| 138 | `price-list-parser.ts` | AI-powered price list parsing |
| 119 | `distance-service.ts` | Google Maps distance calculation |
| 106 | `customer-contact-service.ts` | Customer contact CRUD |
| 102 | `customer-location-service.ts` | Customer location CRUD |
| 100 | `pricing-rules-engine.test.ts` | (test file) |
| 98 | `pdfThumbnail.ts` | PDF thumbnail generation |
| 90 | `elevation-pipeline.ts` | Elevation drawing pipeline |
| 73 | `spatial-extractor.ts` | Spatial data extraction from drawings |
| 71 | `correction-logger.ts` | Drawing correction logging |

### Services Over 1000 Lines (Refactor Candidates)

| Service | Lines | Severity |
|---|---|---|
| `pricing-calculator-v2.ts` | 1,833 | CRITICAL — nearly 2x threshold |
| `buyer-change-tracker.ts` | 1,188 | HIGH — 18% over threshold |

### Core Service Public APIs

#### `pricing-calculator-v2.ts` (1,833 lines)

```
export interface EnhancedCalculationResult extends CalculationResult { ... }
export interface ServiceBreakdown { ... }
export async function loadPricingContext(organisationId: string): Promise<PricingContext>
export function calculateMaterialCost(...)
export async function calculateQuotePrice(...)
```

#### `slab-optimizer.ts` (888 lines)

```
export function optimizeSlabs(input: OptimizationInput): OptimizationResult
```

Single exported function. Lines 1-349 are internal types/helpers; `optimizeSlabs` spans lines 350-888.

#### `shapes.ts` (420 lines)

```
export type ShapeType = 'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE'
export interface LShapeConfig { ... }
export interface UShapeConfig { ... }
export type ShapeConfig = LShapeConfig | UShapeConfig | null
export interface ShapeGeometry { ... }
export function calculateLShapeGeometry(config)
export function calculateUShapeGeometry(config)
export interface OptimizerRect { ... }
export function decomposeShapeIntoRects(piece)
export function getBoundingBox(piece)
export function getShapeEdgeLengths(...)
export function getCuttingPerimeterLm(...)
export function getFinishableEdgeLengthsMm(...)
export function getShapeGeometry(...)
```

### Other Notable Lib Files

| Lines | File | Purpose |
|---|---|---|
| 570 | `types/ui-contracts.ts` | UI type definitions |
| 420 | `types/shapes.ts` | Shape geometry types + functions |
| 418 | `types/pricing.ts` | Pricing type definitions |
| 369 | `saas/subscription.ts` | SaaS tier/subscription logic |
| 362 | `types/drawing-analysis.ts` | Drawing analysis types |
| 359 | `permissions.ts` | Permission system |
| 314 | `quote-version-diff.ts` | Quote version diff utility |
| 291 | `audit.ts` | Audit logging utility |
| 255 | `constants/room-presets.ts` | Room preset definitions |
| 246 | `storage/r2.ts` | Cloudflare R2 storage client |
| 228 | `auth.ts` | Authentication (JWT + bcrypt) |

---

## 5. Database Schema

### Models (58 total)

**Database:** PostgreSQL via Prisma ORM
**Schema file:** `prisma/schema.prisma` (1,525 lines)
**Enums:** 17 defined

#### Core Business Models

| Model | Fields | Key Relations |
|---|---|---|
| `quotes` | 69 | → companies, user, customers, customer_contacts, price_books, self-ref (revisions) |
| `quote_pieces` | 33 | → materials, quote_rooms, piece_relationships (×2) |
| `quote_rooms` | 7 | → quotes |
| `customers` | 24 | → companies, client_tiers, client_types, price_books |
| `materials` | 26 | → companies, suppliers |
| `user` | 25 | → companies, customers, customer_contacts |
| `companies` | 29 | (parent entity — referenced by most models) |

#### Pricing Models

| Model | Fields | Key Relations |
|---|---|---|
| `pricing_settings` | 23 | (parent entity for rates) |
| `pricing_rules_engine` | 23 | → client_tiers, client_types, customers |
| `pricing_rules` | 10 | (legacy/simpler rules) |
| `price_books` | 13 | (pricing grouping) |
| `price_book_rules` | 6 | → price_books, pricing_rules_engine |
| `pricing_rule_cutouts` | 8 | → cutout_types, pricing_rules_engine |
| `pricing_rule_edges` | 8 | → edge_types, pricing_rules_engine |
| `pricing_rule_materials` | 8 | → materials, pricing_rules_engine |
| `service_rates` | 13 | → pricing_settings |
| `cutout_rates` | 10 | → pricing_settings |
| `cutout_category_rates` | 7 | → cutout_types, pricing_settings |
| `edge_type_category_rates` | 8 | → edge_types, pricing_settings |
| `material_edge_compatibility` | 8 | → edge_types, pricing_settings |

#### Master Data Models

| Model | Fields | Key Relations |
|---|---|---|
| `edge_types` | 18 | → material_edge_compatibility |
| `cutout_types` | 10 | (parent entity) |
| `client_tiers` | 13 | (parent entity) |
| `client_types` | 9 | (parent entity) |
| `thickness_options` | 9 | (standalone) |
| `machine_profiles` | 10 | (parent entity) |
| `machine_operation_defaults` | 7 | → machine_profiles |

#### Quote Lifecycle Models

| Model | Fields | Key Relations |
|---|---|---|
| `quote_versions` | 18 | → quotes, user |
| `quote_options` | 15 | → quotes |
| `quote_option_overrides` | 15 | → quote_options |
| `quote_signatures` | 16 | → quotes, user |
| `quote_views` | 8 | → quotes, user |
| `quote_custom_charges` | 9 | → quotes |
| `quote_files` | 10 | → quotes |
| `quote_drawing_analyses` | 10 | → quotes |

#### Drawing Models

| Model | Fields | Key Relations |
|---|---|---|
| `drawings` | 15 | → customers, quotes |
| `drawing_corrections` | 15 | → drawings, quote_drawing_analyses |

#### Customer Models

| Model | Fields | Key Relations |
|---|---|---|
| `customer_contacts` | 18 | → customers, user |
| `customer_locations` | 14 | → customers |

#### Unit Block Models

| Model | Fields | Key Relations |
|---|---|---|
| `unit_block_projects` | 31 | → companies, customers, user |
| `unit_block_units` | 25 | → unit_block_projects, quotes, unit_type_templates |
| `unit_type_templates` | 14 | → unit_block_projects |
| `unit_block_files` | 11 | → unit_block_projects |
| `finish_tier_mappings` | 11 | → unit_type_templates |
| `buyer_change_snapshots` | 8 | → unit_block_units, quotes |
| `buyer_change_records` | 12 | → unit_block_units |

#### Template Models

| Model | Fields | Key Relations |
|---|---|---|
| `edge_profile_templates` | 14 | (standalone — no FK relations) |
| `starter_templates` | 11 | (standalone — no FK relations) |
| `quote_templates` | 36 | → companies |
| `piece_relationships` | 11 | → quote_pieces (×2) |
| `custom_room_presets` | 11 | → companies |

#### System Models

| Model | Fields | Key Relations |
|---|---|---|
| `settings` | 4 | (standalone key-value) |
| `audit_logs` | 10 | → user |
| `user_permissions` | 5 | → user |
| `slab_optimizations` | 13 | → quotes |
| `piece_features` | 9 | → quote_pieces, pricing_rules |
| `suppliers` | 17 | → companies |
| `price_list_uploads` | 15 | → suppliers |

### Potentially Dead Models (A-11)

| Model | File Refs | Assessment |
|---|---|---|
| `quote_files` | 1 | **Strong candidate** — likely replaced by `drawings` model (34 refs) |
| `cutout_rates` | 1 | Likely superseded by `cutout_category_rates` (fabrication-aware version) |
| `buyer_change_snapshots` | 1 | Niche unit-block feature, recently added |
| `buyer_change_records` | 1 | Niche unit-block feature, recently added |
| `customer_contacts` | 1 | Recently added (Feb 27), may not be fully integrated |
| `customer_locations` | 1 | Recently added (Feb 27), may not be fully integrated |
| `custom_room_presets` | 1 | Recently added (Feb 18), limited adoption |

### Migration History

- **Total migrations:** 52
- **Date range:** January 23 – March 10, 2026 (~7 weeks)
- **Rate:** ~1 migration per day — indicates rapid schema evolution
- **Last 10 migrations:** `add_contacts_and_locations`, `add_quote_status_lifecycle`, `add_room_notes`, `add_quote_templates`, `add_company_id_to_core_tables`, `extend_quote_templates_sections`, `add_custom_charges_and_discount`, `add_drawing_corrections`, `add_requires_grain_match_to_quote_pieces`, `add_optimizer_slab_count`, `add_shape_fields_to_pieces`, `add_no_strip_edges_to_pieces`

### Schema Observations

1. **`quotes` model has 69 fields** — accumulated responsibilities suggest it should be decomposed
2. **Two parallel pricing systems:** `pricing_rules` (legacy) and `pricing_rules_engine` (new). Dead code likely exists in the older system.
3. **No tenant isolation on several lookup tables:** `client_tiers`, `client_types`, `cutout_types`, `edge_types`, `thickness_options`, `price_books`, `pricing_rules`, `pricing_rules_engine` all lack `company_id`
4. **Inconsistent naming:** Schema mixes `snake_case` (`created_at`) and `camelCase` (`isActive`, `sortOrder`)
5. **Self-referential quotes:** `QuoteRevisions` self-join could cause N+1 queries if not managed

---

## 6. Security

### Auth Mechanism

**Custom JWT + bcrypt authentication** (NO third-party auth provider like Clerk)

- **Password hashing:** bcrypt with 10 salt rounds
- **Token format:** JWT (HS256) via `jose` library
- **Token storage:** HTTP-only cookie (`stonehenge-token`)
- **Token expiration:** 7 days
- **Cookie settings:** `httpOnly: true`, `secure` in production, `sameSite: lax`

### Two-Layer Auth Architecture

1. **Middleware layer** (`src/middleware.ts`): Global JWT gate on ALL `/api/*` routes. Whitelists only: `/api/auth/login`, `/api/auth/logout`, `/api/health`, `/api/company/logo/view`
2. **Handler layer** (`requireAuth()`/`getCurrentUser()`): Per-route auth with role checks and company scoping

### Auth Coverage

| Metric | Count |
|---|---|
| **Total API routes** | 121 |
| **Middleware-protected** | 117 (all except 4 whitelisted) |
| **In-handler auth (`requireAuth`/`getCurrentUser`)** | 113 |
| **No in-handler auth** | 8 |

### Unprotected Routes (A-02)

Routes without in-handler auth checks (middleware may still protect some):

| Route | Middleware Protected? | Risk |
|---|---|---|
| `/api/auth/login` | No (whitelisted) | Expected — login endpoint |
| `/api/auth/logout` | No (whitelisted) | Expected — logout endpoint |
| `/api/health` | No (whitelisted) | Expected — health check |
| `/api/health/quote-system` | No (prefix match) | LOW — exposes system config counts |
| `/api/company/logo/view` | No (whitelisted) | LOW — serves logo image |
| `/api/distance/calculate` | YES (middleware) | LOW — no company scoping, exposes COMPANY_ADDRESS |
| `/api/pricing-rules` | YES (middleware) | **HIGH — no role check, no company scoping on GET/POST** |
| `/api/storage/status` | YES (middleware) | MODERATE — leaks R2 infrastructure details |

### Partially Authenticated Routes

These routes have unauthenticated GET but authenticated PUT (middleware still gates them):

- `/api/pricing/cutout-category-rates`
- `/api/pricing/edge-category-rates`
- `/api/pricing/edge-compatibility`

### Auth Pattern Inconsistency

Two different auth functions used across the codebase:
- **`requireAuth()`** — structured error responses, role checking, company scoping
- **`getCurrentUser()`** — returns user or null, manual error handling

Admin routes (pricing management, user management) do not enforce admin-only access at the API level — they rely on page-level UI gating.

### Security Concerns

1. **JWT fallback secret:** Hardcoded `'fallback-dev-secret-do-not-use-in-production'` if `JWT_SECRET` is unset. Only a `console.warn`, not a startup failure.
2. **7-day token with no rotation:** No refresh token mechanism. No token blocklist for revocation.
3. **No RBAC on admin API routes:** Only supplier routes enforce role-based access (`['ADMIN', 'SALES_MANAGER']`). All other admin routes accept any authenticated user.

---

## 7. External Integrations

### Anthropic AI (Claude)

| Detail | Value |
|---|---|
| **SDK** | `@anthropic-ai/sdk` v0.39.0 |
| **Model** | `claude-sonnet-4-20250514` (all services) |
| **Env var** | `ANTHROPIC_API_KEY` |

**Files using Anthropic SDK (7):**

| File | Usage |
|---|---|
| `services/drawing-analyzer.ts` | Drawing analysis (3 API calls per analysis) |
| `services/spatial-extractor.ts` | Spatial data extraction |
| `services/schedule-parser.ts` | Schedule document parsing |
| `services/register-parser.ts` | Register document parsing |
| `services/price-list-parser.ts` | Price list parsing |
| `services/ai-price-interpreter.ts` | Price interpretation |
| `api/analyze-drawing/route.ts` | Drawing analysis API endpoint |

### Cloudflare R2 Storage

| Detail | Value |
|---|---|
| **SDK** | `@aws-sdk/client-s3` v3.978.0 + `@aws-sdk/s3-request-presigner` v3.978.0 |
| **Core module** | `src/lib/storage/r2.ts` |
| **Env vars** | `R2_ENDPOINT`, `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` |
| **Consumer files** | 15 |
| **Fallback** | In-memory mock when R2 not configured |

### Google Maps

| Detail | Value |
|---|---|
| **SDK** | `@googlemaps/google-maps-services-js` v3.4.0 |
| **Core module** | `src/lib/services/distance-service.ts` |
| **Env var** | `GOOGLE_MAPS_API_KEY` |
| **Fallback** | Mock when API key not configured |

### Clerk

**NOT USED.** Zero imports found. The project uses custom JWT auth.

### Environment Variables Required

| Variable | Required? | Used In |
|---|---|---|
| `DATABASE_URL` | Yes | Prisma (implicit) |
| `JWT_SECRET` | Yes (has fallback) | `auth.ts`, `middleware.ts` |
| `ANTHROPIC_API_KEY` | For AI features | `analyze-drawing/route.ts`, service files |
| `R2_ENDPOINT` | For file storage | `storage/r2.ts` |
| `R2_ACCOUNT_ID` | For file storage | `storage/r2.ts` |
| `R2_ACCESS_KEY_ID` | For file storage | `storage/r2.ts` |
| `R2_SECRET_ACCESS_KEY` | For file storage | `storage/r2.ts` |
| `R2_BUCKET_NAME` | For file storage | `storage/r2.ts` |
| `GOOGLE_MAPS_API_KEY` | For distance calc | `distance-service.ts` |
| `COMPANY_ADDRESS` | For distance calc | `pricing-calculator-v2.ts`, `distance/calculate/route.ts` |
| `NODE_ENV` | Standard | Multiple files |
| `LOG_LEVEL` | Optional | `logger.ts` |
| `DATABASE_PUBLIC_URL` | Deploy only | `railway.toml` |
| `PORT` | Deploy only | `railway.toml` |

**Missing:** No `.env.example` file exists in the repository.

---

## 8. Technical Debt

### TODO/FIXME Comments (7 items)

| File | Line | Comment |
|---|---|---|
| `components/DistanceCalculator.tsx` | 79 | `TODO: Re-enable after fixing Google Maps loading issue` |
| `services/quote-pdf-service.ts` | 115 | `TODO: read GST from pricing_settings after MT2` |
| `services/quote-pdf-service.ts` | 405 | `TODO: read GST from pricing_settings after MT2` |
| `services/edge-detector.ts` | 89 | `TODO: Load tenant-specific notation from database` |
| `api/company/settings/route.ts` | 67 | `TODO: Add proper permission checking` |
| `api/admin/users/route.ts` | 196 | `TODO: Send invitation email if sendInvite is true` |
| `api/quotes/[id]/sign/route.ts` | 149 | `TODO: Send confirmation email to customer and sales team` |

### console.log Count

**0** — The project uses a custom `logger` module (`src/lib/logger.ts`).

### TypeScript `any` Usage

**96 occurrences across 28 files**

Top offenders:

| File | Count |
|---|---|
| `quotes/[id]/builder/components/OptimizationDisplay.tsx` | 26 |
| `services/pricing-calculator-v2.ts` | 15 |
| `api/quotes/[id]/pieces/[pieceId]/override/route.ts` | 10 |
| `api/quotes/[id]/route.ts` | 5 |
| `quotes/[id]/QuoteDetailClient.tsx` | 4 |
| `saas/subscription.ts` | 4 |
| `api/admin/pricing/machines/[id]/route.ts` | 4 |

### ESLint/TypeScript Suppressions (9 occurrences)

| Type | Count |
|---|---|
| `eslint-disable` (react-hooks/exhaustive-deps) | 4 |
| `eslint-disable` (@next/next/no-img-element) | 3 |
| `eslint-disable` (@typescript-eslint/no-explicit-any) | 1 |
| `@ts-ignore` | 0 |
| `@ts-nocheck` | 0 |

### Import Count

**1,272 import statements** across 374 files.

### Technical Debt Summary (by severity)

| # | Item | Severity |
|---|---|---|
| 1 | 96 TypeScript `any` usages (26 in one component) | HIGH |
| 2 | Hardcoded GST rate at 10% (2 locations in PDF service) | MODERATE |
| 3 | Missing email notifications (user invite, quote signing) | MODERATE |
| 4 | Google Maps loading issue (disabled in DistanceCalculator) | MODERATE |
| 5 | No permission checking on company settings API | MODERATE |
| 6 | Tenant-specific edge notation not loaded from DB | LOW |
| 7 | 9 ESLint suppressions (mostly hook deps and img elements) | LOW |

---

## 9. Test Coverage

### Test Framework

- **Framework:** Jest (v30.2.0) with `ts-jest` (v29.4.6)
- **Config:** `jest.config.ts` — node environment, `@/` path alias, matches `*.test.ts`
- **Test files found:** **1** (`src/lib/services/pricing-rules-engine.test.ts`, 100 lines)

### Coverage Estimate

**Effectively 0%.** Only one test file exists for one service. No component tests, no API route tests, no integration tests.

### Scripts Available

```
scripts/
├── generate-thumbnails.ts
├── hooks/
├── install-hooks.sh
├── test-classification.ts
├── verify-task1-recalculate.ts
└── verify-task2-check-allocations.ts
```

---

## 10. Build / Deploy

### Package Scripts

```json
{
  "prepare": "sh scripts/install-hooks.sh",
  "dev": "next dev",
  "build": "prisma generate && next build",
  "start": "next start",
  "lint": "next lint",
  "db:migrate": "prisma migrate deploy",
  "db:seed": "prisma db seed",
  "seed:pricing": "npx ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed-pricing.ts",
  "seed:pricing-settings": "npx tsx prisma/seed-pricing-settings.ts"
}
```

### Key Dependency Versions

| Package | Version |
|---|---|
| Next.js | 14.1.0 |
| Prisma | ^5.22.0 |
| React | (bundled with Next.js 14.1) |
| Jest | ^30.2.0 |
| TypeScript | (strict mode enabled) |
| `@anthropic-ai/sdk` | ^0.39.0 |
| `@aws-sdk/client-s3` | ^3.978.0 |
| `@googlemaps/google-maps-services-js` | ^3.4.0 |

**Total dependencies:** 30 runtime + 13 dev = 43

### TypeScript Configuration

- **Strict mode:** YES (`"strict": true`)
- **Module:** ESNext with bundler resolution
- **JSX:** preserve
- **Incremental:** true
- **Path alias:** `@/*` → `./src/*`

### Deployment (Railway)

```toml
[build]
buildCommand = "npx prisma generate && npm run build"

[build.cache]
paths = ["node_modules", ".next/cache"]

[deploy]
startCommand = "DATABASE_URL=\"$DATABASE_PUBLIC_URL\" npx prisma migrate deploy && \
  (DATABASE_URL=\"$DATABASE_PUBLIC_URL\" node prisma/seed-production.js || echo 'Seed skipped') && \
  HOSTNAME=0.0.0.0 PORT=${PORT:-3000} node_modules/.bin/next start"
```

Deploy process: Prisma migrate → production seed (non-fatal) → Next.js start

### Missing Configuration

- No `.env.example` file documenting required environment variables
- No Docker configuration
- No CI/CD pipeline configuration visible in repo

---

## Key Risks

### 1. Near-Zero Test Coverage
Only 1 test file exists across the entire application (419 source files). Any refactoring or bug fix carries high regression risk. The pricing calculator (1,833 lines) has no tests despite being the most critical business logic.

### 2. Security Gaps in API Authorization
`/api/pricing-rules` has no auth at all (GET/POST). Multiple admin routes lack role-based access control at the API level. Several lookup tables have no tenant isolation (`company_id`), meaning data is shared across all companies.

### 3. Component Complexity Concentration
The `quotes/` component folder contains 71.8% of all component code (21,571 lines in ~50 components). 12 components exceed 500 lines. The piece editor cluster alone spans 5,955 lines across 6 overlapping components with duplicated logic.

### 4. Service File Size and Monolithic Functions
`pricing-calculator-v2.ts` at 1,833 lines and `buyer-change-tracker.ts` at 1,188 lines exceed the 1000-line threshold. `slab-optimizer.ts` has a single exported function spanning 538 lines.

### 5. JWT Security Weaknesses
Hardcoded fallback secret (`'fallback-dev-secret-do-not-use-in-production'`), 7-day token expiry with no refresh/rotation, and no token revocation mechanism. A compromised token is valid for a full week.

---

## Recommended Priorities

### 1. Add Authentication to `/api/pricing-rules`
This is the highest-severity security issue. The route allows unauthenticated CRUD on pricing rules. Add `requireAuth()` with appropriate role restrictions immediately.

### 2. Add Role-Based Access to Admin API Routes
Admin pricing, user management, and company settings routes accept any authenticated user. Add `requireAuth(['ADMIN'])` or `requireAuth(['ADMIN', 'SALES_MANAGER'])` guards.

### 3. Fix JWT Security
- Remove hardcoded fallback secret; fail startup if `JWT_SECRET` is unset
- Reduce token expiry or implement refresh token rotation
- Add `.env.example` documenting all required environment variables

### 4. Establish Test Infrastructure
- Add integration tests for the pricing calculator (highest-value test target)
- Add API route tests for auth-critical endpoints
- Set up CI pipeline to enforce test execution

### 5. Decompose Large Components and Services
- Split `PieceVisualEditor.tsx` (1,990 lines) into composable sub-components
- Consolidate `BulkMaterialSwap` + `BulkMaterialDialog` into a shared component
- Extract duplicated interfaces from `PieceRow`/`QuickViewPieceRow` into shared types
- Break `pricing-calculator-v2.ts` into focused modules (material cost, service cost, delivery cost, etc.)
