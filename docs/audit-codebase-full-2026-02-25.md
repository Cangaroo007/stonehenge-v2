# Stonehenge V2 — Full Codebase Audit

> **Date:** 25 February 2026
> **Scope:** Complete application audit — directory structure, pages, API routes, components, services, pricing pipeline, database schema, dead code, and known problem areas.

---

## 1. Directory Structure Overview

```
src/
├── app/
│   ├── (dashboard)/          # Authenticated app shell
│   │   ├── admin/pricing/    # Admin pricing configuration (10 sub-components)
│   │   ├── admin/users/      # User management
│   │   ├── customers/        # Customer CRUD + contacts, drawings
│   │   ├── dashboard/        # Home dashboard
│   │   ├── materials/        # Material & supplier management
│   │   ├── optimize/         # Slab optimisation page
│   │   ├── quotes/           # Core quote flow (detail, builder, print, job-view, etc.)
│   │   ├── settings/         # Company & quote-template settings
│   │   └── templates/        # Unit-block mapping templates
│   ├── (portal)/             # Customer-facing portal (layout + quote view)
│   ├── api/                  # ~90 API route files (see Section 2)
│   ├── login/                # Login page
│   └── layout.tsx, page.tsx  # Root layout + landing redirect
├── components/
│   ├── customers/            # ContactsTab, LocationsTab, UsersTab
│   ├── drawing-analysis/     # ClarificationPanel
│   ├── drawings/             # DrawingThumbnail, DrawingViewerModal, PdfThumbnail
│   ├── layout/               # AppShell, CommandMenu
│   ├── pricing/              # MachineManagement, PriceMappingVerification, TierManagement
│   ├── quotes/               # 48 components (see Section 3)
│   ├── slab-optimizer/       # SlabCanvas, SlabResults
│   ├── ui/                   # Shared primitives (button, card, input, label, etc.)
│   ├── unit-block/           # MultiFileUpload
│   └── visual-layout/        # VisualLayoutTool, SlabCanvas, PiecePalette, etc.
│   └── (top-level)           # DeleteQuoteButton, DistanceCalculator, Header,
│                               QuotePDF, Sidebar, SignatureModal
├── hooks/                    # 6 hooks (useAutoSlabOptimiser, useDrawingUrl,
│                               useQuoteKeyboardShortcuts, useQuoteOptions,
│                               useUndoRedo, useUnsavedChanges)
├── lib/
│   ├── actions/              # Server actions (save-tier-price-list)
│   ├── constants/            # room-presets, slab-sizes
│   ├── contexts/             # UnitContext
│   ├── prompts/              # AI extraction prompts (classification, CAD v1+v2,
│   │                           hand-drawn v1+v2, job-sheet v1+v2, register, schedule)
│   ├── services/             # 40+ service modules (see Section 4)
│   ├── storage/              # R2 storage adapter
│   ├── types/                # TypeScript type definitions (12 files)
│   ├── utils/                # debounce, description-generator, edge-utils, units
│   └── (top-level)           # audit.ts, auth.ts, db.ts, logger.ts, permissions.ts,
│                               quote-version-diff.ts, saas/subscription.ts, utils.ts
├── middleware.ts              # Auth middleware
└── types/                     # Global type declarations (google-maps.d.ts, slab-optimization.ts)
```

**File counts:** ~230 TypeScript/TSX source files.

---

## 2. Pages & API Routes

### 2a. Pages (Dashboard)

| Route | File | Purpose |
|---|---|---|
| `/dashboard` | `dashboard/page.tsx` | Home dashboard |
| `/quotes` | `quotes/page.tsx` | Quotes list (QuotesListClient) |
| `/quotes/new` | `quotes/new/page.tsx` | New quote wizard (supports `?mode=classic`) |
| `/quotes/new/unit-block` | `quotes/new/unit-block/page.tsx` | New unit-block project |
| `/quotes/[id]` | `quotes/[id]/page.tsx` | Quote detail (QuoteDetailClient, unified view+edit) |
| `/quotes/[id]/edit` | `quotes/[id]/edit/page.tsx` | Edit mode redirect |
| `/quotes/[id]/builder` | `quotes/[id]/builder/page.tsx` | **Legacy redirect** → `/quotes/[id]?mode=edit` |
| `/quotes/[id]/print` | `quotes/[id]/print/page.tsx` | Print-optimised quote view |
| `/quotes/[id]/job-view` | `quotes/[id]/job-view/page.tsx` | Manufacturing job view |
| `/quotes/[id]/drawings/[drawingId]` | `drawings/[drawingId]/page.tsx` | Full drawing viewer |
| `/quotes/[id]/pieces/[pieceId]` | `pieces/[pieceId]/page.tsx` | Expanded piece view |
| `/quotes/unit-block/[id]` | `unit-block/[id]/page.tsx` | Unit-block project detail |
| `/quotes/unit-block` | `unit-block/page.tsx` | Unit-block listing |
| `/customers` | `customers/page.tsx` | Customer list |
| `/customers/new` | `customers/new/page.tsx` | New customer form |
| `/customers/[id]` | `customers/[id]/page.tsx` | Customer detail |
| `/customers/[id]/edit` | `customers/[id]/edit/page.tsx` | Customer edit |
| `/materials` | `materials/page.tsx` | Materials list |
| `/materials/new` | `materials/new/page.tsx` | New material |
| `/materials/[id]/edit` | `materials/[id]/edit/page.tsx` | Edit material |
| `/materials/suppliers` | `materials/suppliers/page.tsx` | Supplier list |
| `/materials/suppliers/[id]` | `materials/suppliers/[id]/page.tsx` | Supplier detail |
| `/optimize` | `optimize/page.tsx` | Slab optimisation tool |
| `/admin/pricing` | `admin/pricing/page.tsx` | Pricing admin (tabbed: materials, edges, cutouts, services, settings) |
| `/admin/users` | `admin/users/page.tsx` | User management |
| `/settings` | `settings/page.tsx` | Settings hub |
| `/settings/company` | `settings/company/page.tsx` | Company settings |
| `/settings/quote-templates` | `settings/quote-templates/page.tsx` | Quote template settings |
| `/templates` | `templates/page.tsx` | Unit-block templates list |
| `/templates/new` | `templates/new/page.tsx` | New template |
| `/templates/[id]/edit` | `templates/[id]/edit/page.tsx` | Edit template |

### 2b. Pages (Portal)

| Route | File | Purpose |
|---|---|---|
| `/portal` | `portal/page.tsx` | Customer portal landing |
| `/portal/quotes/[id]` | `portal/quotes/[id]/page.tsx` | Customer quote view + signature |

### 2c. API Routes (~90 files)

**Auth:** `/api/auth/login`, `/api/auth/logout`

**Quotes (core):**
- `/api/quotes` — GET list, POST create
- `/api/quotes/create-draft` — POST quick-draft
- `/api/quotes/batch-create` — POST bulk create
- `/api/quotes/[id]` — GET/PUT/DELETE single quote
- `/api/quotes/[id]/calculate` — POST pricing calculation
- `/api/quotes/[id]/pieces` — GET/POST pieces (includes runtime cost calculation)
- `/api/quotes/[id]/pieces/[pieceId]` — GET/PUT/DELETE single piece
- `/api/quotes/[id]/pieces/[pieceId]/duplicate` — POST
- `/api/quotes/[id]/pieces/[pieceId]/override` — PUT/DELETE price override
- `/api/quotes/[id]/pieces/bulk-delete|bulk-edges|bulk-move|bulk-update|reorder` — POST batch ops
- `/api/quotes/[id]/rooms` — GET/POST rooms
- `/api/quotes/[id]/rooms/[roomId]` — PUT/DELETE room
- `/api/quotes/[id]/rooms/[roomId]/merge` — POST merge rooms
- `/api/quotes/[id]/rooms/reorder` — PUT
- `/api/quotes/[id]/relationships` — GET/POST piece relationships
- `/api/quotes/[id]/relationships/[relationshipId]` — PUT/DELETE
- `/api/quotes/[id]/piece-relationships` — GET (alternative endpoint)
- `/api/quotes/[id]/custom-charges` — GET/POST
- `/api/quotes/[id]/custom-charges/[chargeId]` — PUT/DELETE
- `/api/quotes/[id]/drawings` — GET/POST
- `/api/quotes/[id]/duplicate` — POST
- `/api/quotes/[id]/edge-allowance` — GET/PUT
- `/api/quotes/[id]/import-pieces` — POST (from drawing analysis)
- `/api/quotes/[id]/machine-operations` — GET/PUT
- `/api/quotes/[id]/manufacturing-export` — GET
- `/api/quotes/[id]/optimize` — POST slab optimisation
- `/api/quotes/[id]/override` — PUT/DELETE quote-level price override
- `/api/quotes/[id]/pdf` — GET generate PDF
- `/api/quotes/[id]/readiness` — GET
- `/api/quotes/[id]/save-as-template` — POST
- `/api/quotes/[id]/sign` — POST customer signature
- `/api/quotes/[id]/status` — PUT status transitions
- `/api/quotes/[id]/track-view` — POST analytics
- `/api/quotes/[id]/views` — GET view history
- `/api/quotes/[id]/versions` — GET/POST version history
- `/api/quotes/[id]/versions/[version]` — GET specific version
- `/api/quotes/[id]/versions/[version]/rollback` — POST
- `/api/quotes/[id]/versions/compare` — GET diff two versions

**Quote Options (multi-option quoting):**
- `/api/quotes/[id]/options` — GET/POST
- `/api/quotes/[id]/options/[optionId]` — GET/PUT/DELETE
- `/api/quotes/[id]/options/[optionId]/calculate` — POST
- `/api/quotes/[id]/options/[optionId]/overrides` — GET/POST
- `/api/quotes/[id]/options/[optionId]/overrides/[overrideId]` — PUT/DELETE

**Customers:**
- `/api/customers` — GET/POST
- `/api/customers/[id]` — GET/PUT/DELETE
- `/api/customers/[id]/contacts` — GET/POST
- `/api/customers/[id]/contacts/[contactId]` — PUT/DELETE
- `/api/customers/[id]/drawings` — GET
- `/api/customers/[id]/locations` — GET/POST
- `/api/customers/[id]/locations/[locationId]` — PUT/DELETE

**Materials & Suppliers:**
- `/api/materials` — GET/POST
- `/api/materials/[id]` — GET/PUT/DELETE
- `/api/suppliers` — GET/POST
- `/api/suppliers/[id]` — GET/PUT/DELETE
- `/api/suppliers/[id]/materials` — GET
- `/api/suppliers/[id]/price-lists` — GET/POST
- `/api/suppliers/[id]/price-lists/[uploadId]/apply` — POST

**Drawings & AI Analysis:**
- `/api/drawings/[id]/details|file|thumbnail|url` — GET
- `/api/drawings/simple-upload` — POST
- `/api/drawings/upload-complete` — POST
- `/api/drawings/backfill-thumbnails` — POST
- `/api/analyze-drawing` — POST (AI drawing analysis)
- `/api/analyze-drawing/elevation` — POST
- `/api/analyze-drawing/refine` — POST
- `/api/drawing-corrections` — GET/POST
- `/api/drawing-corrections/stats` — GET
- `/api/elevation-pipeline` — POST
- `/api/upload/drawing` — POST (legacy)

**Admin Pricing:**
- `/api/admin/pricing/client-tiers` — CRUD
- `/api/admin/pricing/client-types` — CRUD
- `/api/admin/pricing/cutout-types` — CRUD
- `/api/admin/pricing/edge-types` — CRUD
- `/api/admin/pricing/machines` — CRUD
- `/api/admin/pricing/machine-defaults` — GET/PUT
- `/api/admin/pricing/price-books` — CRUD
- `/api/admin/pricing/pricing-rules` — CRUD
- `/api/admin/pricing/service-rates` — CRUD
- `/api/admin/pricing/settings` — GET/PUT
- `/api/admin/pricing/thickness-options` — CRUD
- `/api/admin/pricing/interpret-price-list` — POST (AI)

**Other:**
- `/api/admin/users` — CRUD
- `/api/company/logo` — GET/POST
- `/api/company/logo/view` — GET
- `/api/company/settings` — GET/PUT
- `/api/custom-charge-suggestions` — GET
- `/api/distance/calculate` — POST
- `/api/edge-templates` — CRUD
- `/api/health` — GET, `/api/health/quote-system` — GET
- `/api/pricing-rules` — GET
- `/api/pricing/cutout-category-rates|edge-category-rates|edge-compatibility|interpret` — GET/POST
- `/api/quote-templates` — CRUD
- `/api/room-presets` — CRUD
- `/api/starter-templates` — CRUD + apply/roles sub-routes
- `/api/storage/status` — GET
- `/api/suggestions` — GET
- `/api/templates` — CRUD + clone/mappings sub-routes
- `/api/unit-blocks` — CRUD + generate/calculate/parse sub-routes

---

## 3. Component Inventory — `src/components/quotes/`

48 components. Key groups:

### Piece rendering (the most complex area)

| Component | Lines | Status | Used By |
|---|---|---|---|
| **QuickViewPieceRow** | 1,036 | ACTIVE | QuoteDetailClient (primary piece renderer) |
| **PieceRow** | 1,141 | ACTIVE | QuoteDetailClient (detailed/cost breakdown mode) |
| **PieceVisualEditor** | 1,412 | ACTIVE | QuickViewPieceRow accordion tier |
| **InlinePieceEditor** | 489 | ACTIVE | PieceRow inline editing |
| **MiniPieceEditor** | — | ACTIVE | ManualQuoteWizard |
| PieceContextMenu | — | ACTIVE | QuoteDetailClient right-click menu |
| PieceEditorErrorBoundary | — | ACTIVE | Error boundary wrapper |
| PieceOverrideEditor | — | ACTIVE | Manual price override UI |
| PieceOverrideIndicator | — | ACTIVE | Shows override badge |
| OversizePieceIndicator | — | ACTIVE | Warns on oversize pieces |
| MiniSpatialDiagram | — | ACTIVE | Mini SVG in QuickViewPieceRow |

### Quote-level components

| Component | Purpose | Status |
|---|---|---|
| QuoteLayout | Shared quote page shell (Rule 1 compliance) | ACTIVE |
| QuoteCostSummaryBar | Floating cost summary | ACTIVE |
| QuoteLevelCostSections | Cost breakdown sections | ACTIVE |
| QuoteAdjustments | Discount/markup controls | ACTIVE |
| QuoteReadinessChecker | Pre-send validation | ACTIVE |
| StatusBadge | Quote status badge | ACTIVE |
| FloatingActionButton | Mobile FAB for quick actions | ACTIVE |
| MultiSelectToolbar | Bulk piece operations toolbar | ACTIVE |

### Drawing & analysis

| Component | Purpose | Status |
|---|---|---|
| DrawingUploadStep | Drawing upload wizard step | ACTIVE |
| DrawingsAccordion | Drawing list in quote detail | ACTIVE |
| StreamlinedAnalysisView | AI analysis results display | ACTIVE |
| NewQuoteWizard | New quote creation flow | ACTIVE |
| ManualQuoteWizard | Manual piece entry flow | ACTIVE |
| FromTemplateSheet | Create quote from template | ACTIVE |

### Edge & cutout

| Component | Purpose | Status |
|---|---|---|
| EdgeProfilePopover | Edge type picker popover | ACTIVE |
| CutoutAddDialog | Add cutout dialog | ACTIVE |

### Material

| Component | Purpose | Status |
|---|---|---|
| MaterialAssignment | Material picker for pieces | ACTIVE |
| MaterialCostSection | Material cost display | ACTIVE |
| MaterialGroupOptimisation | Group optimisation display | ACTIVE |
| BulkMaterialDialog | Bulk material assignment | ACTIVE |
| BulkMaterialSwap | Swap materials across pieces | ACTIVE |
| **MaterialView** | Material-grouped view tab | **DEAD** (commented out in v12.J1) |

### Room views

| Component | Purpose | Status |
|---|---|---|
| RoomLinearView | Linear room layout | ACTIVE |
| RoomSpatialView | Spatial room layout | ACTIVE |
| RoomPieceSVG | SVG rendering for room pieces | ACTIVE |
| RoomNameAutocomplete | Room name suggestions | ACTIVE |
| RoomTypePicker | Room type selection | ACTIVE |
| RelationshipConnector | Visual piece-to-piece connections | ACTIVE |
| RelationshipEditor | Edit piece relationships | ACTIVE |
| RelationshipSuggestions | AI-suggested relationships | ACTIVE |

### Options & versioning

| Component | Purpose | Status |
|---|---|---|
| OptionTabsBar | Multi-option tab bar | ACTIVE |
| OptionComparisonSummary | Compare option costs | ACTIVE |
| CreateOptionDialog | Create new quote option | ACTIVE |
| VersionHistoryTab | Version history display | ACTIVE |
| VersionDiffView | Diff between versions | ACTIVE |

### Other

| Component | Purpose | Status |
|---|---|---|
| ContactPicker | Customer contact selector | ACTIVE |
| ClassicQuoteBuilder | Legacy builder (used by `/quotes/new?mode=classic`) | ACTIVE |
| OptimizerStatusBar | Slab optimisation status | ACTIVE |
| TemplateSelector | Template picker | ACTIVE |
| MachineOperationsAccordion | Machine ops display | ACTIVE |

---

## 4. Service Layer — `src/lib/services/`

40+ service modules. Grouped by domain:

### Pricing (the core pipeline)

| Service | Lines | Purpose |
|---|---|---|
| **pricing-calculator-v2.ts** | 1,401 | Main calculation orchestrator — loads context, calls engine, adds delivery/templating/discounts |
| **pricing-rules-engine.ts** | 348 | Pure calculation engine (no DB access) — materials, edges, cutouts, services |
| pricing-rules-engine.test.ts | — | Unit tests for engine |
| multi-slab-calculator.ts | — | Slab cut-plan calculation (wastage, grain matching) |
| distance-service.ts | — | Delivery zone + cost calculation, templating cost |
| finish-tier-resolver.ts | — | Resolves material fabrication category for pricing |
| quote-option-calculator.ts | — | Options-specific pricing (with overrides) |

### Quote lifecycle

| Service | Purpose |
|---|---|
| quote-lifecycle-service.ts | Status transitions (draft → sent → accepted, etc.) |
| quote-version-service.ts | Version snapshot creation and comparison |
| quote-readiness-service.ts | Pre-send validation checks |
| quote-validation.ts | Input validation |
| quote-setup-defaults.ts | Default values for new quotes |
| quote-pdf-service.ts | PDF generation orchestrator |
| quote-pdf-renderer.ts | PDF rendering with React PDF |

### Drawing analysis (AI)

| Service | Purpose |
|---|---|
| drawing-analyzer.ts | AI drawing classification + extraction (uses v1+v2 prompts) |
| extraction-mapper.ts | Maps AI extraction output to piece data |
| spatial-extractor.ts | Extracts spatial relationships from drawings |
| edge-detector.ts | Detects edge profiles from drawing analysis |
| elevation-pipeline.ts | Elevation drawing processing pipeline |
| correction-logger.ts | Logs user corrections for AI improvement |

### Slab optimisation

| Service | Purpose |
|---|---|
| slab-optimizer.ts | Main slab layout optimiser |
| multi-material-optimizer.ts | Multi-material slab optimisation |
| analysis-to-optimizer-adapter.ts | Adapts drawing analysis to optimiser input |

### Material & supplier

| Service | Purpose |
|---|---|
| material-matcher.ts | Fuzzy material matching |
| price-list-parser.ts | Parse uploaded supplier price lists |
| price-list-applier.ts | Apply parsed prices to materials |
| ai-price-interpreter.ts | AI-assisted price list interpretation |

### Templates

| Service | Purpose |
|---|---|
| template-applier.ts | Apply template to quote |
| template-auto-generator.ts | Auto-generate templates from analysis |
| template-cloner.ts | Clone templates |
| template-saver.ts | Save template from quote |
| analysis-to-template-adapter.ts | Convert analysis to template format |

### Unit-block / multi-dwelling

| Service | Purpose |
|---|---|
| bulk-quote-generator.ts | Generate quotes from unit-block schedule |
| register-parser.ts | Parse unit register documents |
| schedule-parser.ts | Parse construction schedules |
| buyer-change-tracker.ts | Track buyer selection changes |

### Other services

| Service | Purpose |
|---|---|
| piece-grouping.ts | Group pieces by room/material |
| piece-relationship-service.ts | Manage piece-to-piece relationships |
| relationship-suggest-service.ts | AI-suggested piece relationships |
| room-preset-service.ts | Room preset CRUD |
| room-layout-engine.ts | Room spatial layout calculation |
| linear-layout-engine.ts | Linear layout calculation |
| cut-list-generator.ts | Manufacturing cut list generation |
| manufacturing-export.ts | Export for manufacturing systems |
| customer-contact-service.ts | Customer contact CRUD |
| customer-location-service.ts | Customer location CRUD |
| drawingService.ts | Drawing storage operations |
| pdfThumbnail.ts | PDF thumbnail generation |

---

## 5. Pricing Pipeline — End-to-End Trace

### 5a. The calculate endpoint

**Entry point:** `POST /api/quotes/[id]/calculate` → `src/app/api/quotes/[id]/calculate/route.ts`

**Flow:**
1. Auth + ownership verification
2. Parse optional body (`priceBookId`, `customerId`, `forceRecalculate`)
3. Call `calculateQuotePrice(id, options)` from `pricing-calculator-v2.ts`
4. Persist to DB: `subtotal`, `tax_amount`, `total`, `calculated_at`, `calculation_breakdown` (full JSON)
5. Return full result to frontend (continues even if DB persist fails)

### 5b. The pricing calculator (pricing-calculator-v2.ts, 1,401 lines)

**`calculateQuotePrice()` orchestration:**

1. **Load pricing context** — reads `pricing_settings` for the organisation (material basis, cutting unit, polishing unit, GST rate, grain matching surcharge %)
2. **Load all reference data** — service rates, edge category rates, cutout category rates, thickness options
3. **Load quote** — with all pieces, rooms, materials, custom charges, customer (with tier + type), price book
4. **For each piece** — map to `EnginePiece` format:
   - Calculate area in m² from `length_mm × width_mm`
   - Map edges (top/bottom/left/right) to edge categories with length
   - Map cutouts to cutout categories
   - Apply piece-level overrides if any
5. **Call pricing-rules-engine** — `calculateEngineQuote()` (pure function, no DB)
6. **Add delivery cost** — via `distance-service.ts` (zone-based + per-km rate)
7. **Add templating cost** — via `distance-service.ts`
8. **Apply discounts** — percentage or fixed, applies to subtotal or specific line items
9. **Apply custom charges** — user-added line items
10. **Calculate GST** — configurable rate from pricing settings
11. **Apply quote-level override** if set
12. **Return** `EnhancedCalculationResult` with full breakdown

### 5c. The pricing rules engine (pricing-rules-engine.ts, 348 lines)

Pure calculation function. Computes:
- **Material cost** — per-slab or per-m² based on org setting
- **Edge costs** — by category rate × length, with 20mm vs 40mm+ thickness variants
- **Cutout costs** — by category rate × quantity, with minimum charges
- **Service costs** — cutting, polishing, installation, waterfall (by configured unit)
- Returns subtotal of all line items

### 5d. Dual pricing in the pieces endpoint (KNOWN ISSUE)

**`GET /api/quotes/[id]/pieces`** (`src/app/api/quotes/[id]/pieces/route.ts`) also performs runtime pricing:

- Lines 52–71: `computeMaterialCost()` — recalculates material cost based on `pricing_settings.material_pricing_basis`
- Lines 77–78: Computes `materialCost` and `featuresCost`
- Lines 95–96: Returns `material_cost` and `total_cost` (overrides DB stored values)

**Risk:** This is a **second, simplified pricing path** that only considers material cost + features cost. It does NOT include edges, cutouts, services, delivery, or discounts. The `total_cost` returned from the pieces endpoint will differ from the full `calculate` endpoint. This dual pricing creates potential confusion in the UI if components use piece-level `total_cost` vs quote-level `calculate` results.

### 5e. Pricing data flow diagram

```
                    ┌─────────────────────────────────┐
                    │  POST /api/quotes/[id]/calculate │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │  pricing-calculator-v2.ts        │
                    │  calculateQuotePrice()           │
                    │                                  │
                    │  1. loadPricingContext()          │
                    │  2. Load service/edge/cutout rates│
                    │  3. Load quote + pieces           │
                    │  4. Map pieces → EnginePiece[]    │
                    │  5. ──► pricing-rules-engine ──►  │
                    │  6. + delivery (distance-service)  │
                    │  7. + templating                   │
                    │  8. + discounts + custom charges   │
                    │  9. + GST                          │
                    │  10. + quote-level override        │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │  DB persist:                     │
                    │    quotes.subtotal               │
                    │    quotes.tax_amount             │
                    │    quotes.total                  │
                    │    quotes.calculated_at          │
                    │    quotes.calculation_breakdown  │
                    └─────────────────────────────────┘
```

---

## 6. Dead Code Candidates

### 6a. Confirmed dead components

| File | Lines | Evidence |
|---|---|---|
| `src/components/quotes/MaterialView.tsx` | — | Import commented out in QuoteDetailClient (v12.J1: toggle removed). Zero active references. |
| `src/app/(dashboard)/quotes/[id]/builder/components/PieceList.tsx` | ~554 | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/QuoteHeader.tsx` | ~115 | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/QuoteTotals.tsx` | ~119 | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/AdditionalCharges.tsx` | — | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/MaterialsBreakdown.tsx` | — | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/OptimizeModal.tsx` | — | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/PieceBreakdownDisplay.tsx` | — | Not imported anywhere. Builder page redirects. |
| `src/app/(dashboard)/quotes/[id]/builder/components/RoomGrouping.tsx` | ~281 | Not imported anywhere. Builder page redirects. |

**Note:** Builder components that ARE actively imported (by QuoteDetailClient or other active components): PieceForm, PricingSummary, QuoteActions, DrawingImport, DrawingReferencePanel, DeliveryTemplatingCard, OptimizationDisplay, MachineDetailsPanel, CutoutSelector, SlabEdgeAllowancePrompt.

### 6b. Retired references

- **QuoteForm** — zero active references in codebase. Only a `QuoteFormatType` type exists in `quote-template.ts`.
- **v1 extraction prompts** (`extraction-cad.ts`, `extraction-hand-drawn.ts`, `extraction-job-sheet.ts`) — still actively imported by `drawing-analyzer.ts` alongside v2 versions. NOT dead yet but candidates for cleanup once v2 is stable.

---

## 7. Database Schema Summary

**PostgreSQL** via Prisma ORM. **57 models** in `prisma/schema.prisma` (1,517 lines).

### Core domain models

| Model | Purpose |
|---|---|
| `quotes` | Master quote record (status, subtotal, tax, total, calculated_at, calculation_breakdown JSON, customer FK, etc.) |
| `quote_pieces` | Individual stone pieces (dimensions, material FK, edges, area, costs, sort_order, room FK) |
| `quote_rooms` | Room groupings within a quote |
| `quote_custom_charges` | User-added line items |
| `quote_versions` | Version snapshots |
| `quote_signatures` | Customer signatures |
| `quote_views` | View tracking / analytics |
| `quote_options` | Multi-option quoting |
| `quote_option_overrides` | Per-option price overrides |
| `quote_files` | Attached files |
| `quote_drawing_analyses` | AI drawing analysis results |
| `quote_templates` | Reusable quote templates |

### Piece details

| Model | Purpose |
|---|---|
| `piece_features` | Features (cutouts, edges) on pieces |
| `piece_relationships` | Piece-to-piece relationships (joins, mitre joints, etc.) |

### Pricing configuration

| Model | Purpose |
|---|---|
| `pricing_settings` | Org-level pricing config (material basis, units, GST rate, grain matching %) |
| `pricing_rules` | Legacy pricing rules |
| `pricing_rules_engine` | Rule engine rules (client type/tier conditions) |
| `pricing_rule_cutouts/edges/materials` | Rule detail tables |
| `price_books` | Price book headers |
| `price_book_rules` | Price book rule entries |
| `service_rates` | Service rates (cutting, polishing, installation, waterfall) |
| `edge_types` | Edge profile definitions with pricing |
| `edge_type_category_rates` | Edge rates by category |
| `cutout_types` | Cutout type definitions |
| `cutout_rates` | Cutout pricing |
| `cutout_category_rates` | Cutout rates by category |
| `thickness_options` | Available thickness options |
| `edge_profile_templates` | Edge profile template definitions |
| `material_edge_compatibility` | Material–edge compatibility matrix |
| `machine_profiles` | Machine definitions |
| `machine_operation_defaults` | Default machine ops per operation type |

### Customer & org

| Model | Purpose |
|---|---|
| `companies` | Multi-tenant company records |
| `customers` | Customer records (linked to client_tier, client_type) |
| `customer_contacts` | Customer contacts |
| `customer_locations` | Customer addresses/locations |
| `client_tiers` | Pricing tiers (e.g. Gold, Silver) with discount matrices |
| `client_types` | Client type categories |

### Materials & suppliers

| Model | Purpose |
|---|---|
| `materials` | Material catalogue (prices, slab dimensions, supplier FK) |
| `suppliers` | Supplier records |
| `price_list_uploads` | Uploaded supplier price lists |

### Drawings

| Model | Purpose |
|---|---|
| `drawings` | Drawing file records |
| `drawing_corrections` | User corrections to AI analysis |

### Unit-block / multi-dwelling

| Model | Purpose |
|---|---|
| `unit_block_projects` | Multi-dwelling project headers |
| `unit_block_units` | Individual units in a project |
| `unit_block_files` | Project files (registers, schedules) |
| `unit_type_templates` | Templates for unit types |
| `finish_tier_mappings` | Finish tier → material mappings |
| `buyer_change_snapshots` | Buyer change tracking snapshots |
| `buyer_change_records` | Individual buyer change records |
| `starter_templates` | Starter template definitions |

### System

| Model | Purpose |
|---|---|
| `user` | User accounts |
| `user_permissions` | Role-based permissions |
| `audit_logs` | Audit trail |
| `settings` | System settings |
| `slab_optimizations` | Stored optimisation results |
| `custom_room_presets` | User-defined room presets |

---

## 8. Known Problem Areas

### 8a. QuoteDetailClient — 4,146 lines (CRITICAL)

`src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx` is **4,146 lines** — more than double the recommended 2,000-line maintenance threshold. This single file is the unified view+edit component tree for all quote operations. It imports 8 builder components, both PieceRow and QuickViewPieceRow, and manages an enormous amount of state. This is the highest-priority refactoring target.

### 8b. Dual pricing calculation paths

As documented in Section 5d, the pieces GET endpoint (`/api/quotes/[id]/pieces`) recalculates material costs at runtime (lines 52–96) using a **simplified formula** (material cost + features cost only). This diverges from the full calculate endpoint which includes edges, cutouts, services, delivery, and discounts. Components that display piece-level `total_cost` may show different numbers than the quote-level totals.

### 8c. Builder page is a redirect shell with orphan components

`/quotes/[id]/builder/page.tsx` redirects to `/quotes/[id]?mode=edit`. However, the `builder/components/` directory still contains **8 orphan components** (PieceList, QuoteHeader, QuoteTotals, AdditionalCharges, MaterialsBreakdown, OptimizeModal, PieceBreakdownDisplay, RoomGrouping) that are not imported by anything. These should be removed.

### 8d. PieceRow vs QuickViewPieceRow overlap

Both are ~1,000+ line components that render piece cards. QuickViewPieceRow is the primary renderer (used in both edit and view modes in QuoteDetailClient). PieceRow is imported but appears to be used for the detailed cost breakdown view. The two components have significant functional overlap (both render dimensions, edges, cutouts, costs, SVG previews). This creates maintenance burden when pricing display logic changes.

### 8e. v1 extraction prompts still active

`drawing-analyzer.ts` imports both v1 and v2 prompt files (`extraction-cad.ts` + `extraction-cad-v2.ts`, etc.). Once v2 prompts are confirmed stable, v1 files can be removed.

---

## 9. Summary Statistics

| Metric | Count |
|---|---|
| Source files (TS/TSX) | ~230 |
| Dashboard pages | ~30 |
| API route files | ~90 |
| Quote components | 48 |
| Service modules | 40+ |
| Custom hooks | 6 |
| Prisma models | 57 |
| Dead code files (confirmed) | 9 components |
| Largest file | QuoteDetailClient.tsx (4,146 lines) |

---

## 10. Recommendations

1. **Split QuoteDetailClient** — Extract state management, view rendering, and edit rendering into separate modules. Target <1,000 lines per file.
2. **Remove 8 orphan builder components** — PieceList, QuoteHeader, QuoteTotals, AdditionalCharges, MaterialsBreakdown, OptimizeModal, PieceBreakdownDisplay, RoomGrouping.
3. **Remove MaterialView.tsx** — Confirmed dead since v12.J1.
4. **Unify piece pricing** — Either remove runtime calculation from pieces GET endpoint, or make it call the same engine as `calculate`. Current dual-path creates data inconsistency risk.
5. **Consolidate PieceRow/QuickViewPieceRow** — Evaluate whether these can share a common base or be merged, reducing the ~2,100 combined lines.
6. **Retire v1 prompts** — Once v2 extraction prompts are validated, remove the v1 files and simplify `drawing-analyzer.ts` imports.
