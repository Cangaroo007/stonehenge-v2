# Stone Henge — Codebase Inventory

> **Purpose:** Living map of what actually exists in the codebase. Prevents duplicate
> work and wrong assumptions in prompts. Update at the end of every session.
>
> **Location in repo:** `docs/stonehenge-codebase-inventory.md`
> **Last updated:** February 24, 2026
> **Rule reference:** Rule 51 — read this before writing any prompt

---

## HOOKS (`src/hooks/`)

| Hook | What It Does | Wired Into | Key Returns |
|------|-------------|------------|-------------|
| `useAutoSlabOptimiser.ts` | Auto-runs slab optimizer on piece changes. 500ms debounce. Fingerprints pieces to avoid redundant runs. Handles in-flight queue. | `QuoteDetailClient.tsx` line 662 | `optimisationRefreshKey`, `isOptimising`, `optimiserError`, `triggerOptimise` |
| `useQuoteOptions.ts` | Manages A/B quote option tabs | `QuoteDetailClient.tsx` | `recalculateAllOptions` |
| `useQuoteKeyboardShortcuts.ts` | Keyboard shortcuts for quote builder | `QuoteDetailClient.tsx` | — |
| `useUndoRedo.ts` | Undo/redo state management | Unknown — verify before using | — |
| `useUnsavedChanges.ts` | Tracks unsaved state, prompts on nav | Unknown — verify before using | — |
| `useDrawingUrl.ts` | Generates signed URLs for drawing files | Unknown — verify before using | — |

**Before creating any new hook:** `grep -rn "useHookName" src/ --include="*.ts" --include="*.tsx"`

---

## SERVICES (`src/lib/services/`)

### Pricing & Calculation
| Service | What It Does | Key Function |
|---------|-------------|--------------|
| `pricing-calculator-v2.ts` | Main quote pricing engine. Fetches quote by ID internally. PER_SLAB and PER_SQUARE_METRE strategies. | `calculateQuotePrice(id, options)` |
| `multi-slab-calculator.ts` | FFD slab layout algorithm | `calculateCutPlan()` |
| `slab-optimizer.ts` | Slab optimizer logic | — |
| `multi-material-optimizer.ts` | Multi-material optimization | — |
| `quote-option-calculator.ts` | Calculates A/B quote options | — |
| `distance-service.ts` | Delivery distance and zone calculation | `calculateDistance()`, `getDeliveryZone()` |

### Quote Lifecycle
| Service | What It Does |
|---------|-------------|
| `quote-lifecycle-service.ts` | Quote creation, duplication, status transitions |
| `quote-version-service.ts` | Version history |
| `quote-readiness-service.ts` | Readiness checks before PDF/send |
| `quote-validation.ts` | Validation rules |
| `quote-setup-defaults.ts` | Default values on new quote |
| `quote-pdf-service.ts` | PDF generation orchestration |
| `quote-pdf-renderer.ts` | PDF rendering |

### Drawing Analysis
| Service | What It Does |
|---------|-------------|
| `drawing-analyzer.ts` | AI drawing analysis via Claude API |
| `spatial-extractor.ts` | Spatial extraction from drawings |
| `elevation-pipeline.ts` | Elevation analysis pipeline |
| `extraction-mapper.ts` | Maps extracted data to quote pieces |
| `analysis-to-optimizer-adapter.ts` | Transforms analysis output to optimizer input |
| `analysis-to-template-adapter.ts` | Transforms analysis output to template |
| `edge-detector.ts` | Edge detection in drawings |

### Spatial / Room (Series 13 — PARTIALLY BUILT)
| Service | What It Does | Status |
|---------|-------------|--------|
| `room-layout-engine.ts` | Room spatial layout calculations | EXISTS — read before any S13 prompt |
| `linear-layout-engine.ts` | Linear layout for print/PDF | EXISTS — read before any S13 prompt |
| `piece-grouping.ts` | Groups pieces by room | EXISTS |
| `piece-relationship-service.ts` | CRUD for piece relationships | EXISTS — read before any S13 prompt |
| `relationship-suggest-service.ts` | Auto-suggests relationships from piece types | EXISTS — read before any S13 prompt |

### Materials & Suppliers
| Service | What It Does |
|---------|-------------|
| `material-matcher.ts` | Matches materials to supplier lists |
| `price-list-parser.ts` | Parses supplier price lists |
| `price-list-applier.ts` | Applies price list to quote |
| `ai-price-interpreter.ts` | AI-powered price list interpretation |

### Templates
| Service | What It Does |
|---------|-------------|
| `template-applier.ts` | Applies a template to a quote |
| `template-saver.ts` | Saves quote as template |
| `template-cloner.ts` | Clones templates |
| `template-auto-generator.ts` | Auto-generates templates |

### Customers & Contacts
| Service | What It Does |
|---------|-------------|
| `customer-contact-service.ts` | Contact CRUD |
| `customer-location-service.ts` | Location CRUD |

### Other
| Service | What It Does |
|---------|-------------|
| `manufacturing-export.ts` | Manufacturing export/cut list |
| `cut-list-generator.ts` | Cut list generation |
| `bulk-quote-generator.ts` | Bulk quote generation |
| `buyer-change-tracker.ts` | Tracks buyer change requests |
| `correction-logger.ts` | Logs AI extraction corrections |
| `finish-tier-resolver.ts` | Resolves finish tiers |
| `register-parser.ts` | Parses finishes registers |
| `schedule-parser.ts` | Parses schedules |
| `room-preset-service.ts` | Room name presets |
| `cutout-deductor.ts` | Cutout deduction calculations |

---

## COMPONENTS (`src/components/quotes/`)

### Quote Shell & Layout
| Component | What It Does |
|-----------|-------------|
| `QuoteLayout.tsx` | Main quote wrapper — ALL quote routes render through this |
| `QuoteCostSummaryBar.tsx` | Sticky bottom cost summary |
| `QuoteLevelCostSections.tsx` | Quote-level cost sections (material, services) |
| `QuoteAdjustments.tsx` | Discounts, custom charges |
| `QuoteReadinessChecker.tsx` | Readiness indicator before send |
| `StatusBadge.tsx` | Quote status badge |

### Piece Editing
| Component | What It Does |
|-----------|-------------|
| `InlinePieceEditor.tsx` | Inline piece dimension/edge editing |
| `MiniPieceEditor.tsx` | Compact piece editor |
| `PieceVisualEditor.tsx` | SVG piece diagram with edges and cutouts |
| `PieceRow.tsx` | Single piece row in list view |
| `QuickViewPieceRow.tsx` | Compact piece row with inline editing |
| `PieceContextMenu.tsx` | Right-click context menu on piece |
| `PieceEditorErrorBoundary.tsx` | Error boundary for piece editors |
| `PieceOverrideEditor.tsx` | Per-piece pricing overrides |
| `PieceOverrideIndicator.tsx` | Visual indicator for overridden pieces |
| `OversizePieceIndicator.tsx` | Oversize warning indicator |
| `EdgeProfilePopover.tsx` | Edge profile selection popover |
| `CutoutAddDialog.tsx` | Cutout addition dialog |
| `MachineOperationsAccordion.tsx` | Machine operations display |

### Room & Spatial (Series 13 — COMPONENTS EXIST)
| Component | What It Does | Status |
|-----------|-------------|--------|
| `RoomSpatialView.tsx` | SVG plan view of room with pieces | EXISTS — read before any S13 prompt |
| `RoomPieceSVG.tsx` | Individual piece SVG for room view | EXISTS |
| `RoomLinearView.tsx` | Linear layout for print | EXISTS |
| `RelationshipConnector.tsx` | Visual lines between related pieces | EXISTS |
| `RelationshipEditor.tsx` | UI to create/edit relationships | EXISTS |
| `RelationshipSuggestions.tsx` | Auto-suggestion UI | EXISTS |
| `MiniSpatialDiagram.tsx` | Mini spatial diagram used in cards | EXISTS |

### Materials
| Component | What It Does |
|-----------|-------------|
| `MaterialView.tsx` | Material overview tab |
| `MaterialAssignment.tsx` | Assign material to pieces |
| `MaterialCostSection.tsx` | Material cost display |
| `MaterialGroupOptimisation.tsx` | Per-material-group slab optimisation |
| `BulkMaterialDialog.tsx` | Bulk material change |
| `BulkMaterialSwap.tsx` | Swap material across pieces |

### Options & Comparison
| Component | What It Does |
|-----------|-------------|
| `OptionTabsBar.tsx` | A/B option tabs |
| `OptionComparisonSummary.tsx` | Side-by-side option comparison |
| `CreateOptionDialog.tsx` | Create new quote option |

### Quote Creation
| Component | What It Does |
|-----------|-------------|
| `NewQuoteWizard.tsx` | New quote wizard (Drawing/Template/Manual) |
| `ManualQuoteWizard.tsx` | Manual entry path |
| `DrawingUploadStep.tsx` | Drawing upload step |
| `DrawingsAccordion.tsx` | Drawings accordion |
| `FromTemplateSheet.tsx` | Create from template sheet |
| `TemplateSelector.tsx` | Template selection UI |
| `FloatingActionButton.tsx` | FAB for adding pieces |

### Contacts & Customers
| Component | What It Does |
|-----------|-------------|
| `ContactPicker.tsx` | Contact selection on quote |

### Other UI
| Component | What It Does |
|-----------|-------------|
| `VersionHistoryTab.tsx` | Version history display |
| `VersionDiffView.tsx` | Diff between versions |
| `MultiSelectToolbar.tsx` | Multi-piece selection toolbar |
| `ClassicQuoteBuilder.tsx` | Legacy builder — verify not imported before assuming retired |
| `StreamlinedAnalysisView.tsx` | Drawing analysis results view |
| `RoomNameAutocomplete.tsx` | Room name autocomplete |
| `RoomTypePicker.tsx` | Room type picker |

---

## API ROUTES (`src/app/api/quotes/[id]/`)

| Route folder | Methods | What It Does |
|-------------|---------|-------------|
| `route.ts` | GET, PATCH, DELETE | Main quote CRUD |
| `calculate/` | POST | Runs `calculateQuotePrice()`, persists subtotal/total/gst/calculated_at to DB |
| `optimize/` | GET, POST | Slab optimizer. POST now writes `optimizer_slab_count` and `optimizer_run_at` to quotes table (Prompt B, Feb 24) |
| `pieces/` | GET, POST | Piece CRUD |
| `piece-relationships/` | GET, POST | Piece relationship CRUD |
| `relationships/` | GET, POST, PATCH, DELETE | Verify if duplicate of above before S13 work |
| `rooms/` | GET, POST, PATCH | Room CRUD |
| `drawings/` | GET, POST, DELETE | Drawing file management |
| `options/` | GET, POST, PATCH | A/B quote options |
| `versions/` | GET, POST | Version history |
| `views/` | GET, POST | View tracking |
| `pdf/` | GET, POST | PDF generation |
| `status/` | PATCH | Status transitions |
| `readiness/` | GET | Readiness check |
| `duplicate/` | POST | Duplicate quote |
| `save-as-template/` | POST | Save as template |
| `import-pieces/` | POST | Import pieces from drawing/template |
| `custom-charges/` | GET, POST, PATCH, DELETE | Custom charges |
| `machine-operations/` | GET, POST, PATCH | Machine operation defaults |
| `manufacturing-export/` | GET | Manufacturing export |
| `override/` | POST | Pricing overrides |
| `edge-allowance/` | GET, PATCH | Slab edge allowance |
| `track-view/` | POST | View tracking |
| `sign/` | POST | Quote signing |

---

## SCHEMA FIELDS ADDED MID-PROJECT

Fields on models that are non-obvious — most commonly missed when writing prompts.

| Model | Field | Type | Added | Notes |
|-------|-------|------|-------|-------|
| `quotes` | `optimizer_slab_count` | `Int?` | Prompt B, Feb 24 | Written by optimize endpoint after each run |
| `quotes` | `optimizer_run_at` | `DateTime?` | Prompt B, Feb 24 | Timestamp of last optimizer run |
| `quotes` | `subtotal` | `Decimal?` | S12 | Written by calculate endpoint |
| `quotes` | `tax_amount` | `Decimal?` | S12 | Written by calculate endpoint |
| `quotes` | `total` | `Decimal?` | S12 | Written by calculate endpoint |
| `quotes` | `calculated_at` | `DateTime?` | S12 | Written by calculate endpoint |
| `materials` | `slabLength_mm` | `Int?` | S11/S12 | Per-material slab dims — null means use type default from constants |
| `materials` | `slabWidth_mm` | `Int?` | S11/S12 | Per-material slab dims |
| `materials` | `fabricationCategory` | `enum` | S11 | ENGINEERED/NATURAL_HARD/NATURAL_SOFT/PREMIUM/SINTERED |

---

## KEY WIRING FACTS

Non-obvious connections between components, hooks, and routes.

| Fact | Detail |
|------|--------|
| `useAutoSlabOptimiser` is already wired | Into `QuoteDetailClient.tsx` line 662. Already triggers `triggerRecalculate()` on completion via `optimisationRefreshKey` at line 675. |
| `calculateQuotePrice` takes only `(id, options)` | Fetches everything from DB internally. No call sites to update when adding input fields — fix goes inside the service. |
| Calculate endpoint persists results to DB | Writes `subtotal`, `tax_amount`, `total`, `calculated_at` after every run. PDF reads these persisted values. |
| Series 13 spatial work is partially built | `RoomSpatialView`, `RelationshipEditor`, `RelationshipConnector`, `RelationshipSuggestions`, `RoomPieceSVG`, `RoomLinearView`, `room-layout-engine`, `linear-layout-engine`, `piece-relationship-service`, `relationship-suggest-service` all exist. Read every one of these before writing any Series 13 prompt. |
| Two relationship routes exist | `piece-relationships/` and `relationships/` are both present. Confirm which is canonical before Series 13 work. |
| `ClassicQuoteBuilder.tsx` may be retired | Confirm it is not imported anywhere: `grep -rn "ClassicQuoteBuilder" src/` |
| Optimizer debounce is 500ms | Confirmed in `useAutoSlabOptimiser.ts` line 170. Do not create another hook with different timing. |
| Pricing calculator receives quote ID, not a data object | `calculateQuotePrice(quoteId: string, options: PricingOptions)` — it runs its own DB queries internally. |

---

## HOW TO KEEP THIS CURRENT

**At the end of every session, run:**
```bash
git diff main --name-only | grep -E "hooks/|services/|components/quotes/|api/quotes"
```

Add any new files to the relevant table above. Add any new schema fields to the mid-project fields table. Add any new wiring facts discovered during the session.

**Takes 5 minutes. Saves hours.**
