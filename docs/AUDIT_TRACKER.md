# Stone Henge — Audit Tracker

> **Updated:** March 10, 2026
> **Status:** ACTIVE

---

## Resolved

| ID | Description | Resolution | PR |
|----|-------------|------------|----|
| A-03 | slab-optimizer.ts not L/U shape aware — oversize splitter fires on bounding box before decomposition | Shape decomposition moved to Step 1 (before oversize splitting). Each leg is now checked individually against slab dimensions. | fix/optimizer-shape-before-oversize |
| A-19 | Phase 1 regression: null crash in calculateLShapeGeometry — TypeError 'Cannot read length_mm of undefined' when shape_config.leg1 is undefined. Quote 55 crashes on edge click. | Null guards added to all geometry functions in shapes.ts. Returns safe zero values when config or leg data is missing. | claude/fix-lshape-null-guard-VDNE5 |
| R-11 | L-shape INNER + R-BTM edges unclickable, unstorable, unpriced | Extra edges now stored in shape_config.edges JSON. Calculator and optimizer consume them. | fix/10e-lshape-edge-storage |
| R-12 | AUDIT_TRACKER.md not enforced — documentation steps skipped by Claude Code | pre-push hook now blocks pushes on fix/* feat/* branches if tracker not updated | fix/enforce-audit-tracker-hook |
| R-13 | Railway build broken by prepare script (no .git dir in CI) | install-hooks.sh now exits silently when .git directory absent | fix/hotfix-railway-prepare-script |
| R-14 | L/U shapes broken: wrong cutting, bounding box display, 2 edges unclickable, $0 finishing | Cutting = decomposed leg perimeters. Finishing = 6/8 outer exposed edges only (join faces excluded). All edges in shape_config.edges. Header shows leg dims. | fix/10-final-lshape-complete |
| R-10 | L-shape cutting formula returns wrong value | ⚠️ FALSE POSITIVE — marked resolved without production verification. Still broken. See A-14. calculateLShapeGeometry used outer perimeter (11.2 Lm) instead of decomposed leg perimeters (12.4 Lm). | claude/fix-lshape-formula-Domy8 |
| R-15 | SYSTEM_STATE.md did not exist — codebase structure undocumented, re-discovered every session | docs/SYSTEM_STATE.md created and enforced via pre-push hook (Rules 52-53) | chore/enforce-system-state |
| R-16 | Rulebook fragmented across v12 + multiple addenda — no single complete source of truth | v13 consolidates all 59 rules into `docs/stonehenge-dev-rulebook.md` at stable path. Addenda removed. | chore/rulebook-v13 |
| R-17 | no_strip_edges field added — wall edge toggle + per-edge strip generation | Schema: `no_strip_edges Json? @default("[]")` on quote_pieces. UI: "Against wall" toggle per edge. Calculator: strips all edges minus wall edges. Optimizer: dead code (generateShapeStrips lines 204-268) cleaned up; generates one strip per non-wall edge with correct dimensions. | claude/wall-edge-no-strip-toggle-HYxEq |
| R-18 | L/U leg slab assignment shows "—" instead of Slab N | findSlabForDecomposedPart() added to PartsSection.tsx — looks up by `pieceId-part-{index}` or `groupId + partIndex`. | claude/fix-lshape-slab-strip-B0GWq |
| R-19 | generateLaminationSummary() swaps strip length/width for L/U shapes | isHorizontalEdge() helper added — matches generateShapeStrips() orientation logic. Horizontal edges → width=length, height=width. | claude/fix-lshape-slab-strip-B0GWq |
| R-20 | L/U strips rendered flat after all legs instead of grouped under parent leg | LSHAPE_LEG_EDGE_MAP and USHAPE_LEG_EDGE_MAP added. Parts reordered at end of derivePartsForPiece so strips follow their parent leg. | claude/fix-lshape-slab-strip-B0GWq |
| R-21 | findSlabForSegment broken for ALL oversize pieces — matches pieceId (synthetic segment ID) instead of parentPieceId | Changed match condition from `pl.pieceId === String(pieceId)` to `pl.parentPieceId === String(pieceId) && pl.isSegment === true`. | claude/fix-slab-display-hQGwQ |
| R-22 | r_top strip shows 60×600 instead of 600×60 — vertical strips display short dimension first | LAMINATION_STRIP parts now render `Math.max(lengthMm, widthMm) × Math.min(lengthMm, widthMm)`. Display-only fix in PartsSection.tsx. | claude/fix-slab-display-hQGwQ |
| R-23 | Strips not visually distinct from parent legs — flat indentation, no hierarchy | Strip rows get `pl-6 text-slate-400 text-sm` class. Names shortened: "Top lamination strip" → "↳ Top strip". | claude/fix-slab-display-hQGwQ |
| R-24 | "Unknown" parent label in lamination summary for oversize segment strips | generateLaminationSummary fallback: when parent not in originalPieces, traces parentPieceId chain through allPieces to find original piece label. | claude/fix-slab-display-hQGwQ |
| R-25 | Parts list expanded oversize L/U legs into segment rows with "Segment X of Y" labels and correct slab assignments | fix/optimizer-display-architecture |
| R-26 | findSlabForDecomposedPartSegment() added — handles compound pieceId format for decomposed-leg segments | fix/optimizer-display-architecture |
| R-27 | reconstructGroupLaminationSummary parent fallback — L/U shapes no longer show "Unknown" | fix/optimizer-display-architecture |
| R-28 | Cost column removed from parts list (interface, calculations, table header, table cell) | fix/optimizer-display-architecture |
| R-29 | Seed slab dimensions corrected: 3000x1400 → 3200x1600 | fix/optimizer-display-architecture |
| R-30 | Material cost now uses flat per-slab price (price_per_slab field) for all PER_SLAB quotes -- single and multi-material. Root cause: line ~308 condition excluded single-material quotes from buildMaterialGroupings result, causing area x rate calculation instead of slabCount x price_per_slab. Pure White: $1,946 -> $1,596. | claude/fix-material-cost-slab-3fvzB |
| R-31 | preprocessOversizePieces generates correct per-segment strips -- Top/Bottom per segment, Left on first segment only, Right on last segment only. parentPieceId = original piece ID. Segments skipped in main strip generation loop. | claude/fix-strip-segmentation-VvJta |
| R-32 | findSlabForStrip updated with occurrence index for multiple strip placements per position. Strip rendering tracks position occurrences to map each segment strip to correct slab. | claude/fix-strip-segmentation-VvJta |
| R-33 | Original oversize piece now skipped in strip generation loop via decomposedPieceIds set — prevents 4941mm ghost strips appearing alongside correct per-segment strips in laminationSummary | fix/strip-segmentation |
| R-34 | decomposedPieceIds now built from normalizedPieces (not empty allPieces) — ghost strips correctly excluded from laminationSummary. Oversize piece strips (4941mm, 3200mm etc.) no longer show in parts list; correct per-segment strips show with slab assignments. | claude/fix-decomposed-piece-ids-rerun-4VVjA |
| R-35 | Recalculate button added to Slab Layout section — users can trigger fresh optimiser run (POST) to refresh stale saved results without developer intervention. | claude/fix-decomposed-piece-ids-rerun-4VVjA |
| R-36 | preprocessOversizeStrips() splits strips exceeding usable slab width into placeable segments. Each segment: parentPieceId = original piece ID, id contains '-part-' (not '-seg-'), label shows "Part N of M". 4941mm strips become 2471+2470mm. 3200mm strips become 1600+1600mm. All strip segments placed on slabs and show in parts list with slab assignments. | claude/strip-oversize-splitting-C5we8 |
| R-35a | findSlabForStrip now falls back to segment lookup when parentPieceId refers to a piece that was split by preprocessOversizePieces. Strips on split pieces (e.g. Quote 58 Back) now render correctly instead of being silently invisible. | claude/fix-strip-lookup-cutouts-iXGyl |
| R-35b | Cutout rows removed from Parts List. Cutouts are not stone parts, do not occupy slab space, and already appear in the Cutouts section. | claude/fix-strip-lookup-cutouts-iXGyl |
| R-37 | preprocessOversizePieces now splits at slab boundary (usableWidth) not midpoint. First segment fills to usableWidth, remainder on next slab. customJoinMm field added to OptimizationPiece type — when set, overrides the first split position. Future NL commands will write this field. Kitchen 4941mm piece now splits 3200+1741 not 2471+2470. | claude/oversize-split-boundary-fix-Npclx |
| R-38 | preprocessOversizePieces now returns segmentWidthMap — a Map from pieceId to the array of segment widths used when splitting. preprocessOversizeStrips accepts this map and uses parent segment widths directly when available, ensuring strip Part 1 = 3160mm matches parent Part 1 = 3160mm. Fallback to even split preserved for strips with no parent map entry. | claude/strip-cuts-match-parent-416hE |
| R-39 | detectSmallSegments() added to OptimizationDisplay. Scans all placed pieces for isSegment=true, skips isLaminationStrip. Hard error below 150mm (unfabricable — red banner), soft warning below 300mm (review recommended — amber banner). Based on Australian fabrication industry standards: engineered quartz min 150mm absolute, 300mm recommended; natural stone min 200-300mm absolute. Advisory only — does not block quote actions. | claude/min-segment-size-warning-2IMDU |
| R-40 | Bug A fix: Lamination label in cost breakdown showed "NONE" while charging non-zero amount. Inline display logic now falls back to "LAMINATED" when stored method is null/"NONE" but charge > 0. Rendering layer only — no calculator changes. Fixed in PieceRow.tsx and QuickViewPieceRow.tsx. | claude/fix-label-badge-display-ABdkH |
| R-41 | Bug B fix: Grain match badge condition expanded to include oversize + non-zero grainMatchingSurcharge path, not just explicit piece.requiresGrainMatch field. Badge now visible on collapsed piece card for oversize pieces with auto-applied surcharge. Auto-applied indicator preserved. Rendering layer only — no calculator changes. Fixed in PieceRow.tsx and QuickViewPieceRow.tsx. | claude/fix-label-badge-display-ABdkH |
| R-42 | Small segment warning added to Optimizer Notices banner. Segments with Math.min(width, height) < 100mm flagged with ⚠️ warning in existing amber Optimizer Notices section (SlabResults + MultiMaterialOptimisationDisplay). Lamination strips excluded. Confirmed trigger: Quote 58 piece 187 Back leg 44×600mm remnant. Display only — no pricing/placement logic touched. | claude/minimum-segment-warning-banner-PuQnr |
| R-43 | BUG-08b: "Unknown" parent label in lamination summary for U-shape segment parents. parentPieceId "187-part-0" not found because the decomposed part was consumed by oversize segmentation. 4th fallback added to reconstructGroupLaminationSummary: strips `-part-{N}` suffix and looks up base piece via its decomposed parts. | claude/fix-lamination-strip-dims-7dNJO |
| R-44 | BUG-08b residual: "Unknown" parentLabel in generateLaminationSummary when originalPieces.find returns piece with no label. Guard changed from `!parent` to `!parent?.label` at slab-optimizer.ts line ~319 so fallback fires for labelless parents too. | claude/fix-lamination-summary-QIESa |
| R-45 | 200mm minimum segment enforcement in preprocessOversizePieces. MIN_SEGMENT_MM=200 constant added. colWidths and rowHeights loops now pull the split back when the remainder would be >0 but <200mm, ensuring every segment is at least 200mm. Eliminates 44mm unfabricable remnants (e.g. Quote 58 piece 187 Back leg). | claude/enforce-segment-length-Ci7r6 |
| C1 | C1 complete — curved shape types added to shapes.ts. RADIUS_END, FULL_CIRCLE, CONCAVE_ARC added to ShapeType union and ShapeConfig. Config interfaces, area helpers (computeRadiusEndArea, computeFullCircleArea, computeConcaveArcArea, computeArcBoundingBox), and getOptimizerRects() implemented. Pure types — no DB migration, no pricing changes. | claude/add-curved-shape-types-rNjWw |
| P1a | Default Arris on all new pieces. 3 piece creation paths (quotes/route.ts, pieces/route.ts, import-pieces/route.ts) now default all 4 edges to Arris (cmlar3etm0002znat72h7jnx0) when no edge is specified. Previously: null or inconsistent defaults. | claude/default-arris-new-pieces-KaHjI |
| C5 | C5 complete — curved shape bounding rect pre-processing in slab-optimizer.ts. RADIUS_END, FULL_CIRCLE, CONCAVE_ARC pieces transformed to bounding rectangles before FFD sort via getOptimizerRects(). trueArea_m2 tracked on Placement for accurate material cost in C6. FFD algorithm unchanged. L/U decomposition unchanged. | claude/c5-curved-optimizer-8N0ck |
| C9 | C9 complete — curved shape waste reporting. Per-slab and group summary shape waste display (purple) in MaterialGroupOptimisation.tsx. getShapeWasteM2() helper uses trueArea_m2 from C5. Only fires for curved shapes. | claude/curved-waste-reporting-G0Nrk |
| SW-1 | Per-edge strip width override schema (strip_width_overrides Json?) + API + optimizer. Replaces single strip_width_override_mm Int? with per-edge JSON overrides. getStripWidthForEdge() looks up overrides[edgeTypeName]. All API routes, manufacturing export, and types updated. InlinePieceEditor UI update deferred to SW-2. | claude/per-edge-strip-widths-COpEr | Mar 4 |
| SW-2 | Per-edge strip width UI. Parts List shows width pill on every strip row (grey=default, amber=overridden, ↺ reset). Inline editable — click to change, auto re-optimises via optimiserRefreshKey. Piece Editor has per-edge table replacing old single stripWidthOverrideMm input. "Apply to all 40mm pieces" button batch-applies overrides. All stripWidthOverrideMm references removed from InlinePieceEditor. | claude/per-edge-strip-width-ui-7jcgJ |
| R-46 | A-01: Wired pricing_rules_engine into calculator subtotal. Rules with adjustmentType=percentage now apply to the appropriate cost bucket (materials, edges, or all). rulesDiscount and rulesAdjustedSubtotal added to return object. appliedRules now includes discountAmount per rule. extractFabricationDiscount() left in place for future use (discount_matrix empty on all tiers). | claude/wire-tier-discounts-AJObr |
| R-47 | MRG-1: Material margin engine. Added material_margin_percent and material_margin_source to quotes table. Added material_margin_percent to client_tiers. Calculator resolves margin from: quote override → client tier → material → supplier → 0% (with warning). Return object includes marginInfo with all available margins and resolution source. Quote API accepts margin updates. | claude/laughing-ritchie-fs4ui |
| R-48 | MRG-2: Material margin UI. MarginSelector component shows current margin source, warning banner when no margin set, radio selector for available margins (tier/supplier/material/custom), per-quote override. PricingSummary shows before-margin, margin amount, after-margin lines. Wired into QuoteDetailClient with triggerRecalculate on change. | claude/material-margin-ui-KGJad |
| R-49 | A-23: Fixed AI Price List uploader supplier validation. Upload now proceeds with "let AI detect" option — no longer blocks on supplier selection. Dropzone always enabled. After AI parse, auto-selects matching supplier from dropdown if detected name matches. Sync step still requires a supplier ID with clearer error message. Warning replaced with blue info hint. | claude/fix-supplier-validation-bREwA |
| R-50 | Pricing admin: Pencil Round / Arris edge rates reset to $0 on every deploy. Hardcoded isPencilRound check in seed-edge-category-rates.ts forced rates to zero. Removed — rates now respect DB values × category multiplier naturally. | fix/edge-unify-1 |
| R-51 | Pricing admin: Cutout types massively duplicated — 2 seed scripts (seed.ts + seed-cutout-types.ts) created overlapping entries with different names. Removed cutout creation from seed.ts, made seed-cutout-types.ts single source of truth. Added 409 duplicate name check to cutout type POST API. | fix/edge-unify-1 |
| R-52 | Pricing admin: Edge types could not be edited or deleted. EdgeTypeForm missing baseRate, isMitred, isCurved fields — edits silently reset values. Added missing fields. Added 409 duplicate name check to edge type POST API. | fix/edge-unify-1 |
| R-53 | Pricing admin: Strip Configurations showed "undefinedmm" — page.tsx expected finalThickness/totalMaterialWidth but API returns stripWidthMm/visibleWidthMm. Column config aligned to actual API fields. | fix/edge-unify-1 |
| R-50 | PX-1: Missing rate detection. getServiceRateSafe() wrapper catches missing rate throws, records in missingRates[], continues with $0. Calculator no longer crashes on missing rates. PricingSummary shows amber banner listing each missing rate with piece name and description. Link to Pricing Admin for resolution. | claude/missing-rate-detection-banner-gTk82 |
| R-51 | PX-2: Extended missing rate detection to edge profiles, cutout rates, edge category rates, cutout category rates, waterfall rates, and engine-level rate throws. All rate lookups now push to missingRates[] instead of silently returning $0 or crashing. Calculator never crashes on any missing rate. 7 detection points total (up from 1 in PX-1). | claude/px2-missing-rate-coverage-xO73i |
| R-52 | PX-3: Pricing Admin Gaps tab. API endpoint scans all rate combinations (service × category, edge × category, cutout × category) and returns missing rates. GapsTab page shows coverage bars, gap tables with "Configure →" links, red badge count on tab. First tab in Pricing Management. | claude/add-pricing-gaps-tab-dgIGl |
| ME-1 | Removed wrong MITRED_PROFILE_CONSTRAINT validation from 4 API routes (calculate, pieces, pieces/[pieceId] ×2, bulk-edges). Constraint was factually incorrect — mitred edges have no traditional profile, the 45° mitre IS the edge. Added mitred_corner_treatment (RAW/SQUARE/ROUND, default RAW) to quote_pieces. Added strip_to_piece_threshold_mm (default 300) to pricing_settings. Updated Pricing Bible to correct constraint matrix. | claude/pricing-schema-correction-WASuU |
| QF-1 | Tenant-configurable default edge profile. Added default_edge_type_id (String?) to pricing_settings. Piece POST handler reads setting and applies to all 4 edges when not explicitly provided. Drawing adapter updated to accept defaultEdgeTypeId param (no longer references hardcoded ARRIS). Pricing Admin dropdown added. Raw remains fallback when setting is null. | claude/qf1-default-edge-profile-ywF7t |
| ME-4 | Promoted strip calculator. Schema: promoted_from_piece_id + promoted_edge_position on quote_pieces. On promote: POST creates new piece, atomically adds edge to parent's no_strip_edges (Task A). On delete: restores parent edge. stripToPieceThresholdMm added to loadPricingContext (Task B). Secondary safeguard in calculator: promotedEdgesByParent map merges promoted edges into noStripEdges even if DB field not patched (Task C). UI: "Promoted strip" badge on promoted pieces, "Already promoted" label replaces promote button for promoted edges. | claude/promoted-strip-calculator-ttPTD |
| PRICING-FIX-1 | Templating guard (cost $0 when templatingRequired=false), waterfall modal, zero-rate warnings, category filtering on edge/cutout admin routes. Verified via full recalculate: Q-00051 $7,028.70, Q-00055 $12,067.85, Q-00058 $11,736.33. Old anchors were stale — deltas reflect accumulated engine improvements since ME-4, A-01, PX-1/2, MRG-1 (not PRICING-FIX-1 regressions). Note: service_rates table has NOT NULL updated_at — all INSERTs must include updated_at or they fail. | claude/verify-pricing-deployment-gQ96n |
| AI-IMPORT-FIX-1 | Price column detection rules for AI price list parser. Per-m² reference column detection (header match, ratio check 4.0–7.0), genuine dual price (Wholesale+VIP headers), single price with discount, single price fallback. Prevents AI treating per-m² column as a second price. | claude/fix-ai-parsing-logic-LFUEK |
| AI-IMPORT-FIX-2 | fabricationCategory strict enum added to ParsedMaterial interface and extraction prompt. 5-value enum (ENGINEERED, NATURAL_HARD, NATURAL_SOFT, NATURAL_PREMIUM, SINTERED) with material-type mapping rules. surfaceFinish explicitly excluded from category determination. Default ENGINEERED. | claude/fix-ai-parsing-logic-LFUEK |
| AI-IMPORT-FIX-3 | Grain matching fields added to ParsedMaterial: requiresGrainMatch (boolean) + grainDirection (VEINED/UNIFORM/null). Keyword-based detection only — category alone never triggers grain matching. | claude/fix-ai-parsing-logic-LFUEK |
| AI-IMPORT-FIX-4 | surfaceFinish strict enum: 'Polished' \| 'Matte' \| 'Textured' \| 'Honed' \| 'Brushed'. Document value mappings (Matt→Matte, Structured→Textured, Leathered→Brushed). Default Polished. | claude/fix-ai-parsing-logic-LFUEK |
| MITRE-1 | Mitred 40mm apron piece auto-creation. Schema: apron_parent_id + apron_position on quote_pieces (self-referential, cascade delete). PATCH API: auto-creates 4 apron pieces (20mm, 100mm height) when lamination_method set to MITRED on 40mm+ piece; deletes aprons when switching away from MITRED. PieceRow: apron badge on parent + child rows. | claude/mitred-apron-auto-creation-34rJS |
| C6 | ROUNDED_RECT curved cutting pricing. Calculator: ROUNDED_RECT added to CURVED_SHAPE_TYPES set. calcArcLengthM handles uniform (4 × π/2 × r) and individual corner radii (π/2 × sum of 4 corners). arcLengthLm wired into EnginePiece. Engine: ruleCurvedCutting added — CURVED_CUTTING rate × arcLengthLm, thickness-aware (rate20mm/rate40mm), null for non-curved pieces. Cost included in per-piece and quote-level fabricationSubtotal. | claude/fix-rounded-rect-pricing-RsC1P |
| OPT-1 | Slab optimizer grouped null-material pieces into optimizer runs, causing "unassigned" pieces in results. Root cause: buildMaterialGroupings included pieces with materialId=null in groups keyed by empty string. Fix: multi-material-optimizer.ts buildMaterialGroupings now skips pieces where materialId is null/undefined. These pieces are excluded from slab optimization (they have no material to assign slabs for). | claude/fix-slab-optimizer-unassigned-1WlAT |
| MITRE-1-FK | apron_parent_id FK changed from CASCADE DELETE to SET NULL. Deleting a parent piece no longer cascade-deletes its apron children — aprons become orphans instead. Migration: 20260321000000_fix_apron_strip_fk_set_null. Schema-only change, no code modified. | claude/fix-apron-fk-cascade-NPtsj |
| UX-FIX-2 | isMitred now checks laminationMethod === 'MITRED' instead of thicknessMm === 40. Edge disabled logic uses et.isMitred boolean instead of string matching. 40mm pieces with standard lamination now have access to all edge types. | claude/fix-40mm-edge-filtering-HFv8N |

---

## Pricing Anchors

> **Source of truth for expected quote totals.** Updated after verified full recalculation on 2026-03-09.
> Old anchors were stale — recalculation reflects accumulated engine improvements since ME-4, A-01, PX-1/2, MRG-1.

| Quote | Subtotal (ex GST) | Last Verified |
|-------|-------------------|---------------|
| Q-00051 | $7,028.70 | 2026-03-09 |
| Q-00055 | $12,067.85 | 2026-03-09 |
| Q-00058 | $11,736.33 | 2026-03-09 |

---

## Known Schema Gotchas

| Table | Gotcha | Detail |
|-------|--------|--------|
| service_rates | `updated_at` is NOT NULL with no default | All INSERTs must explicitly include `updated_at: new Date()` or the query fails. Bake into all future seed/migration prompts. |

---

## Deferred

| ID | Description | Details | Revisit When |
|----|-------------|---------|--------------|
| D-01 | Leg A exact-fit kerf exception | Kerf applied in two places in optimizer (preprocessOversizePieces line 254 AND main loop line 515). A 3200mm piece on a 3200mm slab correctly splits into segments. Revisit only if fabricator confirms this causes incorrect slab counts in production. | After L-shape system verified in production |

---

## Open

| ID | Severity | Description | File | First Seen | Assigned To |
|----|----------|-------------|------|------------|-------------|
| A-14 | 🟢 Resolved | A-14: Lamination strips now correct for L-shapes (all 6 edges). no_strip_edges field enables per-edge wall exclusion. Optimizer dead code cleaned up. | PieceVisualEditor.tsx, QuoteDetailClient.tsx, slab-optimizer.ts, pricing-calculator-v2.ts | Feb 28 | PROMPT-12 |
| A-15 | ✅ Closed | Build passes cleanly as of Mar 16 2026. Issue was stale — Turbopack/Prisma conflict self-resolved. | next.config., prisma/ | Feb 27 | Closed Mar 16 |
| A-16 | 🟡 Medium | gh CLI not in Claude Code. Manual PR creation required every session. | dev tooling | Feb 27 | brew install gh |
| A-17 | 🟡 Medium | AUDIT_TRACKER stale line number: extractFabricationDiscount at 1563, actually 1761. | docs/AUDIT_TRACKER.md | Feb 27 | Update inventory |
| A-18 | 🟡 Medium | A-02 may be incorrect — SYSTEM_STATE checked auth import, not per-handler auth calls. | src/app/api/admin/pricing/* | Feb 27 | Verify before closing A-02 |
| A-20 | ✅ Resolved | Ghost strips in parts list — PartsSection reads stale DB record via GET; old laminationSummary has ghost strips. Fix: Recalculate button added to Slab Layout section (POST triggers fresh optimiser run). | PartsSection.tsx, OptimizationDisplay.tsx | Mar 1 | R-35 |
| A-21 | ✅ Resolved | decomposedPieceIds built from empty allPieces array (slab-optimizer.ts:574-578). Fix: changed allPieces to normalizedPieces. Ghost strips no longer generated. | slab-optimizer.ts:575 | Mar 1 | R-34 |
| A-22 | ✅ Resolved | 200mm minimum segment enforcement — optimizer allows 44mm segments (e.g. Quote 58 piece 187 Back leg remnant), warning only, no hard constraint. Should enforce minimum fabricable segment width. Fix: MIN_SEGMENT_MM=200 enforced in preprocessOversizePieces colWidths/rowHeights loops. | slab-optimizer.ts | Mar 2 | R-45 |
| A-23 | ✅ Resolved | AI Price List uploader blocks upload when "let AI detect" selected. Dropzone greyed out, sync blocked. Fix: upload gate removed, dropzone always enabled, auto-select supplier after parse, clearer sync error message. | src/app/(dashboard)/admin/pricing/import/page.tsx | Mar 5 | R-49 |
| A-24 | ✅ Resolved | Pencil Round / Arris edge rates reset to $0 on deploy. Seed script hardcoded zero. Fix: removed isPencilRound override. | prisma/seed-edge-category-rates.ts | Mar 25 | R-50 |
| A-25 | ✅ Resolved | Cutout types duplicated (3x Undermount Sink, 4x Cooktop variants). Two seed scripts created overlapping entries. Fix: single source of truth + API duplicate prevention. **Existing prod dupes need SQL cleanup.** | prisma/seed.ts, seed-cutout-types.ts, cutout-types/route.ts | Mar 25 | R-51 |
| A-26 | ✅ Resolved | Edge types not editable/deletable. EdgeTypeForm missing fields. Fix: added baseRate, isMitred, isCurved + API duplicate check. | EdgeTypeForm.tsx, edge-types routes | Mar 25 | R-52 |
| A-27 | ✅ Resolved | Strip Configurations "undefinedmm". Page column config mismatched API response fields. Fix: aligned to actual API fields. | admin/pricing/page.tsx | Mar 25 | R-53 |

---

## Active Sessions

| Session | Branch | Date | Status |
|---------|--------|------|--------|
| PRICING-RESTRUCTURE Phase 1 — fix pricing admin bugs | fix/edge-unify-1 | Mar 25 | ✅ Complete |
| WF-2g waterfall/splashback verify | claude/verify-waterfall-splashback-VHgZw | Mar 13 | ✅ Verified — no changes |
| CURVE-4a edge_arc_config JSONB for arc edge profiles | claude/migrate-arc-edge-schema-HchE8 | Mar 12 | ✅ Complete |
| MANUAL-BLANK-1 blank quote builder with deferred save | feat/manual-blank-1 | Mar 16 | ✅ Complete |
| MITRE-1-FK apron_parent_id FK CASCADE → SET NULL | claude/fix-apron-fk-cascade-NPtsj | Mar 10 | ✅ Complete |
| OPT-1 exclude null-material pieces from slab optimizer | claude/fix-slab-optimizer-unassigned-1WlAT | Mar 10 | ✅ Complete |
| C6 ROUNDED_RECT curved cutting pricing | claude/fix-rounded-rect-pricing-RsC1P | Mar 10 | ✅ Complete |
| MITRE-1 mitred apron auto-creation | claude/mitred-apron-auto-creation-34rJS | Mar 10 | 🔄 In progress |
| AI-IMPORT-FIX 1-4 fix AI price list parsing logic | claude/fix-ai-parsing-logic-LFUEK | Mar 9 | ✅ Complete |
| PRICING-FIX-1 verify pricing deployment + anchor update | claude/verify-pricing-deployment-gQ96n | Mar 9 | ✅ Complete |
| MITRE-1 — apron_parent_id + apron_position schema + Parts List display | claude/mitre-1-apron-schema-sR6fU | Mar 10 | In Progress |
| ME-1 remove wrong mitred constraint + schema fields | claude/pricing-schema-correction-WASuU | Mar 5 | ✅ Complete |
| QF-1 tenant-configurable default edge profile | claude/qf1-default-edge-profile-ywF7t | Mar 5 | ✅ Complete |
| ME-4 promoted strip calculator | claude/promoted-strip-calculator-ttPTD | Mar 5 | ✅ Complete |
| PX-3 pricing admin gaps tab | claude/add-pricing-gaps-tab-dgIGl | Mar 5 | ✅ Complete |
| A-23 fix supplier validation on AI import | claude/fix-supplier-validation-bREwA | Mar 5 | ✅ Complete |
| A-01 wire tier discounts into calculator | claude/wire-tier-discounts-AJObr | Mar 5 | ✅ Complete |
| P1a default Arris on new pieces | claude/default-arris-new-pieces-KaHjI | Mar 3 | ✅ Complete |
| C9 curved shape waste reporting | claude/curved-waste-reporting-G0Nrk | Mar 4 | ✅ Complete |
| C5 curved shape optimizer integration | claude/c5-curved-optimizer-8N0ck | Mar 4 | ✅ Complete |
| SW-1 per-edge strip width overrides | claude/per-edge-strip-widths-COpEr | Mar 4 | ✅ Complete |
| C1 curved shape types | claude/add-curved-shape-types-rNjWw | Mar 2 | ✅ Complete |
| PROMPT-26 enforce 200mm minimum segment length | claude/enforce-segment-length-Ci7r6 | Mar 2 | ✅ Complete |
| PROMPT-25 fix Unknown parentLabel in generateLaminationSummary | claude/fix-lamination-summary-QIESa | Mar 2 | ✅ Complete |
| PROMPT-24 fix Unknown lam strips U-shape segments | claude/fix-lamination-strip-dims-7dNJO | Mar 2 | ✅ Complete |
| PROMPT-19d small segment banner notice | claude/minimum-segment-warning-banner-PuQnr | Mar 2 | ✅ Complete |
| PROMPT-19e lamination label + grain badge | claude/fix-label-badge-display-ABdkH | Mar 2 | ✅ Complete |
| PROMPT-19d min segment size warning | claude/min-segment-size-warning-2IMDU | Mar 2 | ✅ Complete |
| AUDIT-10 strip oversize + ghost strip | claude/audit-strip-issues-MKQM3 | Mar 1 | ✅ Complete |
| PROMPT-17 strip segmentation fix | claude/fix-strip-segmentation-VvJta | Mar 1 | 🔄 In progress |
| PROMPT-16 material cost per-slab fix | claude/fix-material-cost-slab-3fvzB | Mar 1 | 🔄 In progress |
| PROMPT-15 optimizer display architecture | claude/fix-optimizer-display-QeIHt | Mar 1 | 🔄 In progress |
| PROMPT-14 slab display fixes (AUDIT-5) | claude/fix-slab-display-hQGwQ | Feb 28 | ✅ Complete |
| PROMPT-13 slab assignment + strip display | claude/fix-lshape-slab-strip-B0GWq | Feb 28 | ✅ Complete |
| HOTFIX Phase 1 null guard | claude/fix-lshape-null-guard-VDNE5 | Feb 27 | ✅ Complete |
| FIX-11 Phase 1 — cutting formula | claude/fix-lshape-formula-Domy8 | Feb 27 | ✅ Complete |
| FIX-11 Phase 2 — header display | fix/lshape-header-display | Feb 27 | ⏳ After Phase 1 |
| FIX-11 Phase 3 — edge wiring | fix/lshape-edge-wiring | Feb 27 | ⏳ After Phase 2 |
| PROMPT-11 silent overwrite | claude/fix-silent-overwrite-crash-xpwSW | Feb 28 | 🔄 In progress |
| PROMPT-12 wall edge toggle | claude/wall-edge-no-strip-toggle-HYxEq | Feb 28 | ✅ Complete |
| FIX-4 regression anchor | fix/locked-regression-anchor | — | ⏳ After Phase 3 |
| Admin pricing auth fix | fix/admin-pricing-auth | — | ⏳ After FIX-4 |

---

*Last Updated: Mar 12 2026 — CURVE-4a: edge_arc_config JSONB added to quote_pieces for arc edge profile storage.*

BUG-3-HOTFIX — curvedCutting null added to fallback engine result | 2026-03-10
SB-1 — Splashback piece_type + auto top edge | claude/splashback-piece-type-m1lJa | 2026-03-10
SB-1a — piece_type column added to quote_pieces (was app-only, now DB-backed). Migration: 20260320000000_add_piece_type_column. 'as any' casts removed from POST/PATCH pieces routes + InlinePieceEditor. Waterfall edge type deactivated (isActive=false). | claude/add-piece-type-column-2LMdo | 2026-03-10
WF-1a — join_method (String?) added to quote_pieces. splashback_top_edge_id (VARCHAR 255) added to pricing_settings. All 3 columns confirmed in production DB. Waterfall edge type deactivated (isActive=false). | claude/add-piece-type-column-2LMdo | 2026-03-10

| WF-1c | ✅ | Calculator waterfall detection changed from edge ID string match to piece_type = 'WATERFALL'. Legacy waterfall_height_mm fallback kept. File: pricing-calculator-v2.ts | Mar 10 2026 |
| FIX-1 | Supplier creation opened to all authenticated users — removed ADMIN/SALES_MANAGER role restriction from POST /api/suppliers | fix/supplier-permission-and-price-import |
| FIX-2 | Removed two-price critical question from AI material importer — AI no longer raises clarification when it sees slab price + m² columns | fix/supplier-permission-and-price-import |
| REMOVE-POLISHING | ✅ | rulePolishing() and ruleCurvedPolishing() bypassed in calculator. Polishing render blocks removed from QuickViewPieceRow, PieceRow, ExpandedPieceViewClient. Edge profile surcharge rates in DB absorb full polishing cost. | claude/remove-polishing-calculator-bCJNO | 2026-03-12 | ✅ type cast hotfix applied (692c4ad)


## CURVE-3
- **Status:** ✅ Resolved
- **Date:** 2026-03-12
- **What:** FULL_CIRCLE SVG vertical line removed. Arc edge click areas added for FULL_CIRCLE and RADIUS_END.

| UX-FIX-4 | ✅ | ExpandedPieceViewClient: editable shape config fields (diameter, radius, corner radius) for FULL_CIRCLE, RADIUS_END, ROUNDED_RECT. Fields write to editFields.shapeConfig using existing setEditFields pattern. Existing handleSave already includes shapeConfig in PATCH payload — no API changes. | claude/fix-curved-piece-config-2jlkK | 2026-03-12 |

## WF-2g — Waterfall/Splashback Verify
- **Status:** ✅ Verified — no changes required
- **Date:** 2026-03-13
- **Branch:** claude/verify-waterfall-splashback-VHgZw
- **Findings:**
  1. Waterfall detection uses `piece_type === 'WATERFALL'` (primary) with `waterfall_height_mm > 0` fallback — correct per WF-1c
  2. WATERFALL_END service charge supports both FIXED_PER_END and PER_LINEAR_METRE methods
  3. Standard cutting on slab perimeter applied to all pieces including waterfall — correct (you cut the whole slab)
  4. Splashback has no special pricing logic — correct (standard rectangular piece, no override needed)
  5. Rules engine has no piece_type awareness — correct (waterfall pricing handled in calculator layer)
  6. DB: 0 piece_relationships rows, all 27 existing pieces are BENCHTOP type (no WATERFALL pieces yet — WF-3 in-flight)
- **Verdict:** Calculator already prices waterfall/splashback correctly end-to-end. No code changes needed.

## CURVE-4a
- **Status:** ✅ Resolved
- **Date:** 2026-03-12
- **What:** Added edge_arc_config JSONB column to quote_pieces for arc edge profile storage. ArcEdgeConfig interface in shapes.ts. PATCH API accepts edgeArcConfig. Migration: 20260313000001_add_edge_arc_config. Schema + API only — no calculator or UI changes.

## EDGE-BREAKDOWN-1
- **Status:** ✅ Resolved
- **Date:** 2026-03-14
- **Branch:** feat/edge-breakdown-1
- **What:** Expanded collapsed "Edge Profiles" single line in QuickViewPieceRow.tsx cost breakdown to per-edge-type rows showing name, lineal metres, rate, and total. Display-only change — no calculator, API, or schema changes. Edges grouped by edgeTypeName, summing linearMeters and total across sides.

## EDGE-ID-RESOLUTION
- **Status:** ✅ Resolved
- **Date:** 2026-03-15
- **Branch:** fix/edge-type-id-resolution
- **What:** Fixed two bugs where raw edge_type CUIDs were displayed instead of resolved names. (1) PartsSection.tsx Apron Strips section: now resolves edge names from breakdownMap and shows per-edge strip dimensions (edge length x 40mm) instead of parent piece dimensions. (2) manufacturing-export.ts: added edgeTypeMap resolution (same pattern as optimize/route.ts) so parseEdge() and isMitred() receive resolved names instead of CUIDs — fixes mitre detection and edge profile labels in manufacturing export.

## PARTS-DEDUP-MARGIN
- **Status:** ✅ Resolved
- **Date:** 2026-03-15
- **Branch:** fix/parts-dedup-margin-method
- **What:** Two fixes. (1) PartsSection.tsx: waterfall/splashback child pieces were appearing twice in the parts list — once as their own MAIN entry and once under the parent via waterfall derivation. Added filter to skip piece_type WATERFALL/SPLASHBACK from the main room iteration. (2) MarginSelector.tsx: material margin was not saving because the component sent method PATCH but the quotes API route only exports GET/PUT/DELETE. Changed to PUT — the partial-update path in PUT already handles material_margin_percent and material_margin_source.

## WF-6
- **Status:** ✅ Resolved
- **Date:** 2026-03-15
- **Branch:** feat/wf-6-waterfall-ux
- **What:** Four waterfall/splashback UX fixes. (1) QuoteDetailClient.tsx: +Waterfall/+SplashBack buttons no longer shown on child pieces — gated by pieceType check. (2) PartsSection.tsx: removed redundant standalone Apron Strips section — strips already appear nested under parent via lamination derivation. (3) QuickViewPieceRow.tsx: child piece mini SVG now renders portrait when widthMm > lengthMm. (4) QuoteDetailClient.tsx: inline relationship creation now passes selectedEdge as side instead of null; display shows nothing instead of "N/A" when position is unset.

## BUILDUPA-1
- **Status:** ✅ Resolved
- **Date:** 2026-03-15
- **Branch:** feat/buildupa-1-edge-buildup
- **What:** Complete per-edge build-up system replacing the old 40mm thickness toggle. Added edge_buildups JSONB field to quote_pieces (per-edge depth config). New UI in InlinePieceEditor replaces 20mm/40mm/custom toggle with per-edge build-up toggles and depth inputs. slab-optimizer generateLaminationStrips now driven by edge_buildups — generates front strip (depth), return strip (60mm), support block (depth-2xslab when >40mm). Legacy laminationMethod path preserved for backwards compat. PartsSection and pricing calculator updated. Migration: 20260315000001_add_edge_buildups.

## MANUAL-BLANK-1
- **Status:** ✅ Resolved
- **Date:** 2026-03-15
- **Branch:** feat/manual-blank-1
- **What:** Blank quote builder with deferred save. Manual card on /quotes/new now skips template picker and goes straight to a local-state canvas (BlankQuoteBuilder.tsx). No DB writes until threshold crossed (piece with dimensions OR non-Raw edge). POST /api/quotes/create-draft extended to accept JSON body with rooms/pieces; existing query-param mode preserved. URL updates to /quotes/[id]?mode=edit via router.replace after first save.


✅ MAT-FIX-1 (2026-03-16): Removed redundant materialMarginAdjustPercent / onMarginAdjustChange props from MaterialCostSection. Props interface, destructuring, and JSX block deleted from MaterialCostSection.tsx. Call site props deleted from QuoteDetailClient.tsx. MarginSelector remains the sole margin control. 2 files, 23 deletions.

✅ MAT-FIX-2 (2026-03-16): Added override_slab_price field to quote_pieces. Mason can override catalogue slab price per-piece or across all pieces of same material in a quote. Override bypasses margin entirely. UI in QuickViewPieceRow with scope radio + amber pill. Calculator bypass before PER_SLAB recalculation. 8 files changed.

✅ MAT-FIX-2b (2026-03-16): Moved slab price override from QVR to MaterialCostSection. Per-material override input sets override_slab_price on all pieces via applyToAllMaterial=true. QVR simplified to per-piece only — scope radio removed. 3 files changed.

✅ MAT-FIX-2b (2026-03-16): Moved slab price override from QVR to MaterialCostSection. Per-material override input sets override_slab_price on all pieces via applyToAllMaterial=true. QVR simplified to per-piece only — scope radio removed. 3 files changed.

✅ FAB-OVERRIDE-1 (2026-03-17): Added override_fabrication_cost field to quote_pieces. Per-piece fabrication labour override — replaces cutting/edge/cutout costs, material unchanged. Wired through full 7-location data chain. Calculator bypass at line 1583. QVR UI at bottom of piece below edge build-up. 8 files changed.

✅ ARCH-1a (2026-03-17): Fixed 4 threshold guards — edgeBuildups check added alongside thicknessMm >= 40 in QVR batch filter (line 255), QVR strip width controls (line 1725), InlinePieceEditor batch filter (line 328), MiniSpatialDiagram isLaminated (line 221). PieceForm.tsx line 510 skipped — legacy builder route, tracked as ARCH-1b. 3 files changed.

✅ ARCH-1a (2026-03-17): Fixed 4 threshold guards — edgeBuildups check added alongside thicknessMm >= 40 in QVR batch filter (line 255), QVR strip width controls (line 1725), InlinePieceEditor batch filter (line 328), MiniSpatialDiagram isLaminated (line 221). PieceForm.tsx line 510 skipped — legacy builder route, tracked as ARCH-1b. 3 files changed.

✅ BUG-FIX-1 (2026-03-17): Fixed 4 post-deploy bugs. (1) edgeBuildups added to view mode piece prop in QuoteDetailClient line 3006 — build-up pills now show in view mode. (2) pricing-calculator-v2.ts line 488 changed byMaterial.length > 1 to > 0 — single-material quotes now show slab override input. (3) QVR line 333 label updated to Apply to all pieces with build-ups. (4) QVR line 281 title updated to Return Strip Width Overrides. 3 files changed.

✅ BUG-FIX-2 (2026-03-17): Fixed override saves + moved all three override inputs to Cost Breakdown section + removed number spinners. handleSaveOverrides uses direct fetch with piece.id. handleLabourOnlyToggle converted to direct fetch. Unified Price Overrides section above Piece Total. type=text inputMode=decimal on all override inputs. 1 file changed.

✅ HOTFIX-1 (2026-03-17): Fixed override saves — handleSaveOverrides and handleLabourOnlyToggle changed from quoteIdStr (optional, undefined) to quoteId (number, always present). MaterialCostSection key lookup fixed from group.materialId (number) to String(group.materialId). Override input spinner removed. 2 files changed.

✅ HOTFIX-2 (2026-03-17): Removed Override material cost and Override slab price from piece Cost Breakdown. Kept Override fabrication cost only. Fixed render gate from isEditMode to mode==='edit' so section renders before fullPiece loads. handleSaveOverrides simplified to only send overrideFabricationCost. Material slab override correctly wired — no change needed.

✅ OVERRIDE-SAVES-FINAL: slab override input added to single-material path; fab save now checks response.ok

✅ OVERRIDE-SAVES-V2: route fab override through savePieceImmediate; slab override Update button; QDC sends full piece data

✅ SPATIAL-1: horizontal layout for unrelated pieces + Position dropdown removed

✅ OVERRIDE-FAB-DIRECT: handleSaveOverrides now direct fetch with full piece fields — bypasses fullPiece guard

✅ OVERRIDE-SLAB-METHOD: handleMaterialSlabOverride PUT→PATCH fix

✅ OVERRIDE-FAB-METHOD: handleSaveOverrides PUT→PATCH in QVR

✅ CALC-OVERRIDE-1: override fields serialised in quote GET + fetchQuote added to handleMaterialSlabOverride

✅ CALC-OVERRIDE-1: override fields serialised in quote GET + fetchQuote added to handleMaterialSlabOverride

✅ CALC-OVERRIDE-2: override fields serialised in quote GET + calculator handles plain number + fetchQuote in slab save

✅ SPATIAL-2: dynamic canvas + child piece grouping + rotation transform
✅ FAB-OVERRIDE-INSTALL: installation added back to pieceTotal when fab override active

✅ SUGGEST-KILL-1: removed all automatic relationship suggestions from RoomSpatialView

✅ SLAB-DISPLAY-1: slab override fixes all 3 problems — hasOverrides, byMaterial, quote total

✅ SPATIAL-3: Island removed from PRIMARY_TYPES + proportional scale + all children placed

✅ WF-7-STRIP-FIX: auto-remove build-up on joining edge + add to noStripEdges at waterfall creation

✅ TEMPLATE-SEED-1: 25 starter templates + 6 edge profile templates seeded

✅ SPATIAL-4: waterfall double-rotation fixed + MIN_SVG_WIDTH 900→1400 + rotateTransform removed

TEMPLATE-MANAGE-1 done

✅ MAT-PICKER-1: new three-panel material picker (Supplier → Collection → Colour)

✅ QUOTE-TOTAL-FIX-1: removed double-counted Additional Costs

✅ SEED-FIX-1: added missing company_id to seedMaterialSlabPrices create call

✅ MAT-PICKER-2: collection-only material selection + amber warning + locked status block

✅ MAT-PICKER-3: + Compare Material button — creates option + opens BulkMaterialDialog

✅ WF-7B: warn + confirm before removing build-up when waterfall/splashback added

✅ SHAPE-THUMB-1: curved shape mini SVG thumbnails (RADIUS_END, FULL_CIRCLE, CONCAVE_ARC, ROUNDED_RECT)

✅ SHAPE-EDIT-1: L/U shape per-leg dimension editing in QuickViewPieceRow

✅ SHAPE-THUMB-2: exaggerated arc thumbnail + ~R/○/▢ curved shape badges

✅ OPT-NOMAT-1: optimizer excludes pieces with no material assigned

✅ EDGE-LU-1: L/U shape edges now save to shapeConfig.edges (not edge_arc_config)

✅ EDGE-LU-1: L/U shape edges now save to shapeConfig.edges (not edge_arc_config)

✅ EDGE-LU-2: calculator reads L/U shape edges from shapeConfig.edges using getFinishableEdgeLengthsMm

✅ DIM-INPUT-1: dimension inputs save on blur — fixes typing bug
✅ EXPANDED-1: streamlined accordion — hides summary tier, compact dims, bottom collapse button

## EDGE-LU-3 — 2026-03-20
- ExpandedPieceViewClient: L/U edge handler writes to shapeConfig.edges
- shapeConfigEdges memo now extracts L/U edges for display
- shapeConfigEdges prop now passed for L_SHAPE and U_SHAPE

## EDGE-LU-3 — 2026-03-20
- ExpandedPieceViewClient: L/U edges now save to shapeConfig.edges and display

## PRICING-ADMIN-1 — 2026-03-20
- Removed baseRate, rate20mm, rate40mm from Edge Types form UI
- DB columns untouched — UI only
- Calculator unaffected

## PARTS-FIX-1 — 2026-03-20
- Bug 1: Legacy strip fallback now gated on isMitrePiece — phantom strips eliminated
- Bug 2: Splashback Strips section removed — SPLASHBACK pieces no longer duplicated
## PRICING-ADMIN-2 verified 2026-03-22

## PRICING-ADMIN-2 — 2026-03-22
- Removed CURVED_POLISHING, RADIUS_SETUP, CURVED_MIN_LM from SERVICE_TYPES

## DELIVERY-FIX-1 — 2026-03-22
- QuoteLevelCostSections: controlled address input + save-before-recalculate
- QuoteDetailClient: handleTemplatingToggle wired up

## DELIVERY-FIX-1 — 2026-03-22
- QuoteLevelCostSections: controlled address input + save-before-recalculate
- QuoteDetailClient: handleTemplatingToggle wired up

## ADDRESS-AUTOCOMPLETE-1 — 2026-03-22
- QuoteLevelCostSections: Google Places Autocomplete on delivery address input
- Graceful degradation if NEXT_PUBLIC_GOOGLE_MAPS_API_KEY not set

## TEMPLATING-TOGGLE-FIX — 2026-03-22
- Templating toggle now always visible in edit mode regardless of finalCost
- Matches Delivery toggle pattern

## STRIP-CONFIG-AUTH — 2026-03-22
- strip-configurations route: removed role restriction from requireAuth

## PRICING-ADMIN-3 — 2026-03-22
- Removed Configuration and Strip Configurations tabs from pricing nav
- Jay now sees only the 5 tabs he needs: Config Health, Settings, Service Rates, Cutout Rates, Edge Rates

## DELIVERY-RECALCULATE-RACE — 2026-03-23
- Recalculate now awaits PUT to save address before calculate fires

## WIZARD-TEMPLATE-NO-CUSTOMER — 2026-03-23
- apply route: removed customerId required validation
- Template quotes now work without pre-selecting a customer

## MANUAL-DIRECT-CREATE — 2026-03-23
- Manual quote now creates immediately and redirects to quote builder

## TEMPLATE-APPLIER-CUSTOMER — 2026-03-23
- template-applier: removed customerId required check + fixed ! assertion

## EDGE-SYNC-2 — 2026-03-23
- Mini SVG now renders correct polygon edge segments for L/U shapes
- L/U edge clicks in mini SVG save to shapeConfig.edges via handleShapeEdgeChange
- U_SHAPE uses correct DB keys: top_left, inner_left, back_inner, inner_right, top_right, outer_right, bottom, outer_left

## EDGE-SYNC-3 — 2026-03-23
- RADIUS_END mini SVG: right arc renders as Q-bezier, reads from edge_arc_config.arc_end
- Clicks on arc save to arc_end via handleShapeEdgeChange
- BOTH-ended (pill) variant: both arcs rendered and clickable
- Straight edges (top/bottom/left) unchanged

## UX-FIX-1 — 2026-03-23
- PieceVisualEditor: replaced 'WALL' display code with 'N-STR' (No Strip)
- RelationshipEditor: removed Position dropdown from new and edit forms
- QuickViewPieceRow: guarded setLocalName reset with !editingName

## TEMPLATE-RESEED-1 — 2026-03-23
- Deleted 24 existing built-in starter templates
- Inserted 12 new templates across 6 categories: kitchen, butlers_pantry, laundry, bathroom, ensuite, outdoor

## TEMPLATE-UX-1 — 2026-03-23
- FromTemplateSheet: complete rewrite with multi-select and dark stone aesthetic
- Multi-select via Set<string>, two-phase flow (selection → material assignment → apply)
- mergeRoles() combines roles across all selected templates
- 7 category tabs: All + kitchen, bathroom, ensuite, laundry, butlers_pantry, outdoor

## HEADER-TOTAL-FIX-1 — 2026-03-23
- headerTotal now reads from activeOption.total for non-base options
- Falls back to calculation.totalIncGst for base option
- Old calculation.total * 1.1 removed

## COMPARE-1 — 2026-03-23
- handleCompareWithMaterial no longer creates Options — toggles comparison panel
- Added showComparisonPanel state + placeholder panel (COMPARE-2 will replace)

## TEMPLATE-SELECTOR-REDESIGN-1 — 2026-03-23
- TemplateSelector: complete rewrite with dark stone aesthetic matching FromTemplateSheet
- Category tabs: kitchen, bathroom, ensuite, laundry, butlers_pantry, outdoor (removed stale "other")

## LABEL-FIX-2 — 2026-03-24
- PieceVisualEditor: added edgeBuildups + attachedPieceTypes props
- Edge labels now show MIT 40mm (with depth), WF (waterfall), SB (splashback)
- Replaces verbose "M — Mitered" and generic "N-STR" labels
- Multi-select, manage mode, sticky footer preserved

## WF-ROOM-FIX-1 — 2026-03-24
  - QuoteDetailClient: waterfall/splashback creation now fetches fresh parent piece
    data from API before creating child piece
  - Falls back to effectivePieces room ID if fresh fetch fails
✅ WF-ROOM-FIX-1 — waterfall/splashback room assignment race condition fixed

## PDF-TOTAL-FIX-1 — 2026-03-24
- quote-pdf-service: subtotalExGst/gstAmount/totalIncGst now read from calcBreakdown
- Removed hardcoded GST_RATE = 0.10 — uses calcBreakdown.gstRate from pricing_settings
- Stale quote.subtotal/quote.total no longer used for PDF totals

## RADIUS-EDGE-FIX-1 — 2026-03-24
- handleShapeEdgeChange: RADIUS_END straight edges (top/bottom/left) now save to edgeTop/etc DB columns
- arc_end still saves to edge_arc_config correctly
- Quick Edge buttons now filtered by isActive — Waterfall and Curved Finished Edge hidden

## COMPARE-2a — 2026-03-24
- New POST /api/quotes/[id]/estimate-material endpoint
- Runs full recalculation with alternative material (update-calculate-restore pattern)
- Results saved to quotes.comparison_slots JSONB (up to 3 slots)
- DELETE endpoint clears a slot
- Schema: added comparison_slots Json? field to quotes

## COMPARE-2b — 2026-03-24
- New MaterialComparisonPanel component (260 lines)
- Up to 3 slots: MaterialPickerV2 + Estimate button per slot
- Current material as baseline column, delta in green/red
- Switch button calls handleBulkMaterialApply, Clear button DELETEs slot
- Replaces blue placeholder panel in QuoteDetailClient

## RADIUS-SHAPE-FIX-1 — 2026-03-25
- shapeType cast now uses ShapeType union from shapes.ts (was missing RADIUS_END + 3 others)
- Root cause of all RADIUS_END/FULL_CIRCLE/CONCAVE_ARC/ROUNDED_RECT display failures

## 2025-03-25 — EDGE-UNIFY-1
- ✅ Centralised edge apply logic via getAllEdgeSides() utility
- ✅ handlePresetApply uses getAllEdgeSides() instead of per-shape if-blocks
- ✅ handleScopeApply includes arc edges for this-piece scope
- ✅ "All edges" button + 'a' shortcut now include arc edges
- ✅ scopeApplyInfo banner has "This piece" option
- ✅ Removed r={3} dot circles from arc edge labels

## EDGE-UNIFY-1 + EDGE-CLICK-FIX
- ✅ Centralised edge apply via getAllEdgeSides()
- ✅ SVG arc hit areas use pointerEvents: stroke

## BLANK-ROOM-FIX-1 — 2026-03-25
- create-draft/route.ts line 90: removed auto Room 1 fallback

## MATERIAL-PICKER-INLINE-1 — 2026-03-25
- InlinePieceEditor: replaced <select> with MaterialPickerV2

## TEMPLATE-SELECTOR-LIGHT-1 — 2026-03-25
- TemplateSelector.tsx: dark tpl-sel-* styles converted to light equivalents

## MATERIAL-PICKER-INLINE-1 — 2026-03-25 (clean branch)
- InlinePieceEditor: replaced <select> with MaterialPickerV2

## TEMPLATE-SELECTOR-LIGHT-1 — 2026-03-25 (clean branch)
- TemplateSelector.tsx: dark styles converted to light
