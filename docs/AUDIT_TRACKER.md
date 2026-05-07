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
| RADIUS-ARC-EDGE-1 | PUT handler in pieces/[pieceId]/route.ts silently dropped edgeArcConfig — only PATCH had it. Frontend uses PUT. Fixed 7 locations across 5 files: PUT destructuring + Prisma update + response, transformPieceForClient alias, QuotePiece interface, fullPiece construction, InlinePieceData interface, QVR snake_case→camelCase. | fix/radius-arc-edge-1 |
| PRICING-ADMIN-2 | Pricing admin consolidation & finish. Sprint 1: Removed redundant edge-types, cutout-types, service-rates tabs from EntityTable page.tsx (now 8 tabs: thickness, strips, machines, client types/tiers, tiers, pricing rules, price books). Sprint 2: Created shared FABRICATION_CATEGORIES constant at src/lib/constants/fabrication-categories.ts. Updated edges, cutouts, services pages to use human-readable labels (Zero Silica, Granite, Marble, Quartzite, Porcelain). Sprint 3: Added "Add Edge/Cutout Type" + "Deactivate" buttons to dedicated pricing pages. Sprint 4: Verified calculator wiring — ruleEdgeProfiles reads edge_type_category_rates, ruleCutouts reads cutout_category_rates, polishing bypassed ($0). Scripts: seed-rate-card.ts (Jay's rate card data), cleanup-pricing.ts (deactivate polishing rates + duplicate cooktop). | fix/pricing-admin-2 |
| PRICING-ADMIN-5 | Complete removal of polishing, curved polishing, waterfall end, and lamination as separate pricing line items. Polishing was never a real fabrication step (misunderstanding). Edge profile rates cover finished edge cost. Lamination is physical (40mm build-up) but not a separate charge — rate40mm on edge rates covers it. Waterfall end covered by mitred edge rates. 15 files changed: rules engine (deleted rulePolishing, ruleCurvedPolishing, ruleLamination), calculator (removed validation gate, aggregation, breakdowns), types, PDF service, admin UI, quote display components. All physical lamination references (slab optimizer, machine ops, drawing extraction) left intact. | fix/remove-polishing-lamination-pricing |
| PRICING-ADMIN-3 | isActive filtering on all pricing GET APIs. edge-types, cutout-types, service-rates, edge-category-rates, cutout-category-rates all now filter by isActive: true. Deactivated items (polishing, stale edges/cutouts) hidden from admin UI and quote builder dropdowns. cleanup-edges-and-services.ts populates Arris + Pencil Round with Ogee rates ($25/$25 ENG), Beveled ($5/$5 ENG), Mitered ($40/$40 ENG) — all 5 categories from Jay's rate card. Deactivates Mitred Panel, Bullnose, Ogee, Square/Eased, Waterfall, Curved Finished Edge. Calculator already had its own isActive filters — no pricing impact. | fix/pricing-admin-3 |

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

## PRICING-ADMIN-1 — 2026-03-25
- Added ServiceRateForm.tsx component to pricing admin

## PRICING-ADMIN-2 — 2026-03-26
- EdgeTypeForm.tsx: added baseRate, isMitred, isCurved fields + per-category rate table (5 categories × 20mm/40mm $/Lm)
- CutoutTypeForm.tsx: added per-category rate table (single $/each per category)
- ServiceRateForm.tsx: populated with serviceType dropdown (11 types), fabricationCategory, rate20mm/rate40mm, minimumCharge
- page.tsx: added service-rates tab, CATEGORY_LABELS constant, updated edge-types/cutout-types column configs
- edge-types/route.ts: GET returns full categoryRates array with Decimal→Number serialisation, POST uses $transaction
- edge-types/[id]/route.ts: PUT uses $transaction + upsert on compound unique key (edgeTypeId_fabricationCategory_pricingSettingsId)
- cutout-types/route.ts: GET returns full categoryRates, POST uses $transaction
- cutout-types/[id]/route.ts: PUT uses $transaction + upsert on compound unique key (cutoutTypeId_fabricationCategory_pricingSettingsId)

## RADIUS-ARC-EDGE-1 — 2026-03-26
- **Status:** ✅ Resolved
- **Root cause:** PUT handler in `pieces/[pieceId]/route.ts` silently dropped `edgeArcConfig` — only the PATCH handler had it. Frontend uses PUT via `handleInlineSavePiece`, so arc edge profiles were lost on every save. 12+ PRs missed this because everyone audited the PATCH handler.
- **Fixes (7 across 5 files):**
  - `src/app/api/quotes/[id]/pieces/[pieceId]/route.ts`: Added `edgeArcConfig` to PUT destructuring, Prisma update (`as unknown as Prisma.InputJsonValue`), and response
  - `src/app/api/quotes/[id]/route.ts`: Added `edgeArcConfig` camelCase alias in `transformPieceForClient`
  - `src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx`: Added `edgeArcConfig` to `QuotePiece` interface and `fullPiece` construction
  - `src/components/quotes/InlinePieceEditor.tsx`: Added `edgeArcConfig` to `InlinePieceData` interface
  - `src/components/quotes/QuickViewPieceRow.tsx`: Fixed snake_case to camelCase (`edge_arc_config` to `edgeArcConfig`) in `handleShapeEdgeChange` and `shapeConfigEdges`
- **Verified:** TypeScript zero errors, Railway build patterns audited, runtime click test passed (Quick Edge Arris on arc → saves + persists after reload)
- **Follow-up:** Mini SVG thumbnail had its own separate `edge_arc_config` (snake_case) read at QVR line 1774 — changed to `edgeArcConfig` (camelCase). Summary and expanded views now match.

## PRICING-ADMIN-4 — 2026-03-26
- **Status:** ✅ Resolved
- **What changed:**
  - `pricing-calculator-v2.ts`: Bypassed WATERFALL_END calculation (cost captured by Mitered edge rate). Removed POLISHING from requiredServiceTypes validation gate — was crashing entire calculation when polishing rates deactivated.
  - `scripts/cleanup-edges-and-services.ts`: Added service rate deactivation (POLISHING, CURVED_POLISHING, WATERFALL_END)
  - `prisma/seed-production.js`: Removed isActive:true from update blocks for edge types, service rates, cutout rates, cutout types
  - `prisma/seed-pricing-settings.ts`: Removed isActive:true from service rates update block
- **Root cause:** (1) Waterfall End was a redundant service charge — mitred edge rate already covers it. (2) Polishing service rates deactivated but validation gate still required them, crashing all quote calculations. (3) Two more seed files had isActive re-activation bug.
- **Verified:** TypeScript zero errors. Quote calculations restored after removing POLISHING from validation gate.


✅ STRIP-VISIBILITY-FIX (2026-03-31): Strip widths now visible when any edge has build-up > 0, not just when edge profile selected. InlinePieceEditor.tsx getStripEdges() accepts edgeBuildups param. QuickViewPieceRow.tsx AccordionStripWidths checks build-up OR edge profile. 2 files changed.

✅ MULTI-SELECT-CUTOUTS (2026-03-31): Single-select cutout dropdown replaced with multi-select checklist. All active cutout types shown as checkbox rows with inline qty inputs. Add Selected button batch-adds all checked types at once. CutoutSelector.tsx only.
| WATERFALL-SPLASHBACK-CREATE | fix/waterfall-splashback-create | Post-save banner with +Waterfall/+Splashback buttons after creating benchtop piece | 2026-03-31 |
| WATERFALL-SPLASHBACK-CREATE | fix/waterfall-splashback-create | Post-save banner with +Waterfall/+Splashback buttons after creating benchtop piece | 2026-03-31 |


## 2026-04-02
- ✅ RESOLVED: seed-production.js was overwriting Arris/Pencil Round rates to $0 on every deploy. Removed rate20mm/rate40mm from seedEdgeTypes() update block (lines 375-376). Create block untouched.
- ✅ RESOLVED: Ghost migration rows (20260131, 20260320) with NULL finished_at deleted from _prisma_migrations.


## 2026-04-02 — SPLASH-POS-SCHEMA
- ✅ RESOLVED: piece_relationships had no position or coverage columns. Added position_mm Int?, position_reference String?, coverage_mm Int? via migration 20260402000000_add_splashback_position_to_relationships.
- ✅ RESOLVED: PieceRelationshipData, CreatePieceRelationshipInput, UpdatePieceRelationshipInput updated with 3 new fields.
- ✅ RESOLVED: toRelationshipData() mapper updated to map 3 new DB columns to camelCase.

## 2026-04-02 — SPLASH-POS-SCHEMA
- ✅ Added position_mm, position_reference, coverage_mm to piece_relationships via migration 20260402000000
- ✅ Updated PieceRelationshipData, CreatePieceRelationshipInput, UpdatePieceRelationshipInput interfaces
- ✅ Updated toRelationshipData() mapper and QuoteDetailClient.tsx manual construction

## 2026-04-02 — EDGE-PANEL-COMPONENT
- ✅ Created src/components/quotes/EdgePanel.tsx — unified edge interaction panel
- ✅ Supports multi-select edges, Edge Finish, Build-Up, Attach Piece sections
- ✅ Shape-agnostic — works for any edge ID set (rect, L-shape, U-shape, curved)
- ✅ Pure props/callbacks — no API calls, no wiring to existing components

## 2026-04-03 — EDGE-PANEL-WIRE-LU
- ✅ EdgePanel wired into L/U shaped pieces for edge profile and build-up selection
- ✅ L/U SVG edge clicks now toggle selectedEdgeIds (multi-select) instead of immediate apply
- ✅ Selected edges highlight blue on SVG diagram
- ✅ EdgePanel onApplyProfile calls handleShapeEdgeChange for each selected edge
- ✅ EdgePanel onApplyBuildup calls handleEdgeBuildup for each selected edge
- ✅ Rectangular pieces keep existing Quick Edge bar unchanged
- ⚠️ onAttachWaterfall/onAttachSplashback wired as no-ops — full wiring in EDGE-PANEL-WF-LU

## 2026-04-03 — SEED-RATE-ZERO-2
- ✅ RESOLVED: edgeCategoryRateTable in seed-production.js had Arris and Pencil Round hardcoded to [0,0]
- ✅ Updated Arris and Pencil Round with Jay's verified rates (25/27/30/40/35 range)
- ✅ Added Beveled and Mitered to explicit rate table — no longer calculated via multiplier
- ✅ TRUE root cause — every deploy was overwriting rates via seedEdgeCategoryRates()
## 2026-04-03 — EDGE-PANEL-WIRE-LU-FIX
- ✅ EdgePanel moved from compact card to expanded view
- ✅ Old Edge Build-Up section hidden for L/U shapes
- ✅ EdgePanel only visible when piece is expanded in edit mode
## 2026-04-03 — EDGE-LABEL-FIX-1
- ✅ attachedPieceTypes useMemo added to QuickViewPieceRow — builds WF/SB map from relationships
- ✅ attachedPieceTypes passed to PieceVisualEditor — WF/SB labels now show instead of N-STR
## 2026-04-03 — USHAPE-GEOMETRY-FIX
- ✅ U-shape now renders as three perfect rectangles sharing a flat bottom
- ✅ back_inner edge always horizontal regardless of leg length difference
- ✅ Same fix applied to PieceVisualEditor.tsx and QuickViewPieceRow.tsx getMiniShapeEdges
- ✅ getMiniShapePath also fixed — compact card U-shape polygon now correct
## 2026-04-03 — EDGE-ANNOTATION-FIX
- ✅ L-shape inner edge label moved below step (labelY: p2.y + lo)
- ✅ L-shape r_top and r_btm labels pushed right of bounding box
- ✅ WF/SB labels now show mm measurement (WF 600mm) not side name (WF Right)
## 2026-04-03 — PIECEVISUAL-EXTERNAL-SELECTION
- ✅ PieceVisualEditor: externalSelectedEdgeIds prop added — drives edge highlighting
- ✅ PieceVisualEditor: onEdgeClick prop added — fires upward instead of internal handler
- ✅ Toolbar hidden when onEdgeClick provided — EdgePanel owns interaction
- ✅ 100% backward compatible — existing behaviour unchanged when props not provided
## 2026-04-03 — EDGEPANEL-WIRE-ALL-SHAPES
- ✅ EdgePanel now renders for ALL shape types — single edge engine
- ✅ allEdgeIds covers RECTANGLE/L_SHAPE/U_SHAPE/RADIUS_END/FULL_CIRCLE/CONCAVE_ARC/ROUNDED_RECT
- ✅ externalSelectedEdgeIds + onEdgeClick passed to PieceVisualEditor for all shapes
- ✅ Quick Edge bar removed — EdgePanel is the only edge interaction surface

## 2026-04-05 — WALL-EDGE-LABEL-FIX
- ✅ PieceVisualEditor: all 4 N-STR occurrences replaced with Wall
- ✅ Shape edge code, shape edge label, rectangle edge code, rectangle edge label all updated
## 2026-04-06 — EDGE-PANEL-WF-LU
- ✅ EdgePanel Attach Piece section now passes selected edge to onAddWaterfall/Splashback
- ✅ QuoteDetailClient waterfallModal state now accepts initialEdge
- ✅ WaterfallSplashbackModal auto-selects initialEdge and skips to step 2
## 2026-04-06 — EDGE-PANEL-CREATE-FORM
- ✅ EdgePanel added to InlinePieceEditor for L/U shapes during piece creation
- ✅ Edge profiles and build-up now functional in create form for L/U shapes
## 2026-04-06 — SPLASH-POS-UI
- ✅ WaterfallSplashbackModal onConfirm type widened to string (supports L/U edge IDs)
- ✅ Position/coverage fields added to Step 2 for SPLASHBACK type
- ✅ Fields hidden by default — toggle visible for <20% use case
## 2026-04-06 — EDGE-DISPLAY-FIX
- ✅ PieceVisualEditor now receives edgeBuildups — left/bottom show ARR 40mm not ARR — Arris
- ✅ EdgePanel now receives attachedPieceTypes — WF/SB edges filtered from Wall Edges section
## 2026-04-06 — WALL-EDGE-FILTER-REVERT
- ✅ Reverted: removed .filter(edgeId => !attachedPieceTypes?.[edgeId]) from Wall Edges section
- ✅ Wall edge designation and WF/SB attachment are independent concerns — an edge can be both
## 2026-04-06 — OPT-INCLUDE
- ✅ WF/SB pieces now included in slab optimizer — inherit primary material when materialId is null
- ✅ Single-material path: pieces patched with primaryMatId before filter
- ✅ Multi-material path: pieces inherit primaryMatIdForMulti in map body
## 2026-04-07 — OPT-GRAIN
- ✅ targetRelationships added to optimize route query — fetches WF/SB parent relationships
- ✅ wfsbParentMap built from relationships — assigns groupId grain-[parentId] to WF/SB + parent pairs
- ✅ Optimizer forces co-placement on same slab for grain matching
## 2026-04-07 — OPT-SHAPE
- ✅ No code change needed — U-shape placement fixed by OPT-INCLUDE
- ✅ shapeType and shapeConfig correctly passed for all piece types with no shape-type gate
- ✅ decomposeShapeIntoRects() receives config and decomposes legs correctly
## 2026-04-07 — CALC-NULL-MATERIAL-ALLOCATION
- ✅ buildMaterialGroupings: null-material pieces (WF/SB) join primary material group for area contribution
- ✅ Per-piece loop: effectiveMaterial resolves primary material for null-material pieces
- ✅ lastMaterialPieceIdx now covers all pieces when primary material exists
- ✅ WF/SB pieces get proportional material cost allocation instead of $0
## 2026-04-07 — WALL-EDGE-TOGGLE-FIX
- ✅ EdgePanel isWall now excludes WF/SB-attached edges — per FABRICATION-RULES.md 10.1
- ✅ noStripEdges dual-purpose: wall toggle only shows ON for user-designated wall edges
## 2026-04-07 — BUILDUP-MULTI-EDGE-FIX
- ✅ onApplyBuildup replaced forEach(handleEdgeBuildup) with single atomic savePieceImmediate
- ✅ All selected edges saved in one pass — fixes stale closure bug where only last edge persisted
## 2026-04-07 — ROUNDED-RECT-NULL-FIX
- ✅ PieceVisualEditor: null guards added to FULL_CIRCLE, CONCAVE_ARC, ROUNDED_RECT shape blocks
- ✅ Prevents TypeError crash when creating new pieces with these shape types (shapeConfig is null initially)
## 2026-04-07 — PIECE-NUMBER-LABELS
- ✅ Optimizer labels now show "Room: 1. Piece Name" — position number prefix
- ✅ PartsSection headers show "1. Piece Name" — matches editor badge numbers
- ✅ derivePartsForPiece receives piecePositionNumber for Main Piece labels
## 2026-04-07 — SPATIAL-JOIN-OVERLAY
- ✅ RoomPieceSVG: joinPositionsMm prop — renders dashed red cut lines at proportional positions
- ✅ RoomSpatialView: optimizerPlacements prop — computes join positions from segment placements
- ✅ QuoteDetailClient: fetches optimizer placements, passes to both RoomSpatialView call sites
## 2026-04-07 — SPATIAL-LAYOUT-FIX
- ✅ WATERFALL positionChild handles all 4 sides (right/left/top/bottom) correctly
- ✅ SPLASHBACK positionChild handles top (above) and bottom (below) sides correctly
- ✅ Unrelated pieces arranged in horizontal rows (wrap at 8000mm) instead of vertical stack
## 2026-04-07 — EDGE-APPLY-RECTANGLE-FIX
- ✅ handleShapeEdgeChange: added explicit RECTANGLE/ROUNDED_RECT case before arc catch-all
- ✅ RECTANGLE edges now save to edgeTop/edgeBottom/edgeLeft/edgeRight — not edgeArcConfig
- ✅ FABRICATION-RULES.md: added rule 10.4 (edge save path verification) and Appendix row #16
## 2026-04-09 — EDGE-OPTIMISTIC-LOCAL-STATE
- ✅ localEdges state added — mirrors piece edge props, updated optimistically before API response
- ✅ savePieceImmediate and savePiece read localEdges instead of fullPiece for edge columns
- ✅ onApplyProfile: atomic multi-edge save with optimistic localEdges update
- ✅ handleEdgeChange: optimistic setLocalEdges before savePieceImmediate
- ✅ Prevents race condition where rapid sequential clicks read stale fullPiece prop
## 2026-04-12 — COMPACT-PRESET-PROFILE-FIX
- ✅ Profile pill selector added above presets in compact card (Raw/Arris/Pencil Round/etc)
- ✅ Masons can set quickEdgeProfileId without expanding to full view or needing Recent pills
## 2026-04-12 — THUMBNAIL-EDGE-SYNC
- ✅ resolvedEdges useMemo reads localEdges instead of piece.edge* props
- ✅ Compact thumbnail updates instantly on edge click — no 200-400ms lag waiting for API response
## 2026-04-12 — CREATE-PIECE-EDGE-FIX
- ✅ EdgePanel added to PieceForm.tsx for edge profile selection during piece creation
- ✅ onApplyProfile updates edgeSelections state — feeds into handleSubmit correctly
- ✅ Build-up and attach piece not wired (create-time only — not needed)
## 2026-04-12 — OPT-MATERIAL-GATE
- ✅ Single-material backfill restricted to confirmed WF/SB children (wfsbParentMap.has check)
- ✅ Multi-material filter restricted: null-material pieces excluded unless WF/SB child
- ✅ Standalone pieces without material no longer get slab allocations
## 2026-04-12 — OPT-GRAIN-RESET-FIX
- ✅ Removed requiresGrainMatch from persistOversizeToQuotePieces (3 locations)
- ✅ Optimizer no longer overwrites user-set grain match preferences on every run
## 2026-04-14 — CALC-OPTIMIZER-TRUST
- ✅ Removed !hasNullMaterialPieces guard from slab count condition in pricing calculator
- ✅ Optimizer slab count now always used as single source of truth when available
## 2026-04-23 — B4a-PATCH-PUT-QUOTE-SAVE
- ✅ QuoteDetailClient.tsx: 5 PATCH calls to /api/quotes/${quoteIdStr} changed to PUT (lines 967, 1935, 1950, 1985, 2003)
- ✅ Root cause: PR #478 (17 Mar 2026) regressed these from PUT to PATCH; quote-level route has never exported PATCH
- ✅ PUT handler at route.ts line 169 supports all 5 operations (saveCalculation, metadata, delivery fields)
- ✅ Verified in DevTools: PATCH was 405ing; verified in production: "Failed to update quote" banner surfacing
- ✅ Sub-path PATCH calls (pieces, rooms, bulk-*) untouched — those routes correctly export PATCH
## 2026-04-23 — B4b-WRAP-ROOM-REBUILD-TRANSACTION
- ✅ route.ts Branch 3 (lines 322-414): delete+recreate wrapped in prisma.$transaction
- ✅ All 3 internal prisma.* calls converted to tx.* (quote_rooms.deleteMany, quote_drawing_analyses.upsert, quotes.update)
- ✅ Transaction options: maxWait 10s, timeout 30s — headroom for large quotes
- ✅ Version tracking + buyer change tracking remain outside transaction (non-blocking)
- ✅ Branches 1 and 2 (saveCalculation, metadata-only) untouched — already single atomic updates
- ✅ TS narrowing hotfix: const rooms = data.rooms captured before transaction (closure boundary loses narrowing)
## 2026-04-23 — B4c-PIECE-SAVE-RACE-CONDITION
- ✅ QuoteDetailClient.tsx: handleInlineSavePiece gets in-flight guard + pending-payload queue
- ✅ savingPiecesRef (Set<number>) + pendingPiecePayloadsRef (Map<pieceId, {data, roomName}>) keyed by pieceId — saves for different pieces run in parallel; only saves for SAME piece serialise
- ✅ Create saves (pieceId === 0) bypass guard — no ID to queue against
- ✅ Both finally branches (override + main) release the guard and fire queued payload
- ✅ Self-call not awaited — prevents unbounded chain
- ✅ QuickViewPieceRow.tsx untouched — parent-owned guard (Path B chosen over Path A type propagation)
## 2026-05-05 — B5-CALC-JOIN-DISPLAY
- **Title:** Corner joins for L/U shapes showing $0 in summary bar and accordion
- **Status:** ✅ Resolved
- **PR:** #633 (pending)
- **Root cause:** UI components only read `p.oversize.joinCost` (multi-slab rectangle joins). Corner joins for L-shape and U-shape pieces are emitted by the calculator as `serviceType: 'JOIN'` items in `breakdown.services.items` (pricing-calculator-v2.ts lines 1303, 1313, 1361, 1375). Both display surfaces missed that branch — the calculator was correctly pricing the joins into the quote total, but the breakdown lines rendered $0.
- ✅ QuoteCostSummaryBar.tsx: `computeFabricationBreakdown` signature extended to accept `serviceItems`; sums `subtotal` of every item with `serviceType === 'JOIN'` into the existing `joins` accumulator. ServiceBreakdown imported from `@/lib/types/pricing`. Call site passes `breakdown.services?.items ?? []`.
- ✅ TotalBreakdownAccordion.tsx: per-piece reducer untouched (correct scope for `oversize.joinCost`); separate post-reduce sum reads JOIN items from `calculation?.breakdown?.services?.items` and adds the total into `fabricationTotals.join`. Flows through to both the displayed Join line and `fabricationSubtotal`.
- ✅ Calculator, rules engine, and API routes untouched — calculator was already correct.
- ✅ Verified via `npx tsc --noEmit` — no new errors introduced.
## 2026-05-05 — DRAW-SCHEMA
- **Title:** 3 new tables (`drawing_imports`, `drawing_import_runs`, `ai_events`) + 3 enums for Drawing AI pipeline foundation
- **Status:** ✅ Resolved
- **Branch:** feat/draw-schema
- **What:** V3-portable foundation for the Drawing AI extraction pipeline. Three new Postgres tables and three Prisma enums added to the schema. Existing `drawings` model (uuid String id, customer-scoped) left untouched — the new `drawing_imports` model is the V3-portable record (autoincrement Int id, company-scoped, `drawing_class` + `drawing_format` enums). New table names and Prisma model names match: `drawing_imports`, `drawing_import_runs`, `ai_events` (snake_case to match existing 61 models — no `@@map()` directives).
- **Enums:** `DrawingClass` (A_PENCIL_SKETCH, B_SHOP_DRAWING, C_CAD_BENCHTOP, D_CABINETRY_PACK, E_CONSTRUCTION_PLAN), `DrawingFormat` (PDF, JPEG, PNG, HEIC, DXF, DWG, IFC), `ImportRunStatus` (RUNNING, COMPLETED, FAILED, CANCELLED). All PascalCase per Prisma convention and matching the existing enum style (`LaminationMethod`, `ServiceType`, `FabricationCategory`).
- **Reverse relations added** (additive only — no existing fields touched):
  - `companies`: `drawingImports drawing_imports[]`, `drawingImportRuns drawing_import_runs[]`, `aiEvents ai_events[]`
  - `quotes`: `drawingImports drawing_imports[]`, `aiEvents ai_events[]` (existing `drawings drawings[]` untouched)
- **FK cascade behaviours:** company FKs `ON DELETE RESTRICT` (3); quote FKs `ON DELETE SET NULL` (2); `drawing_import_runs.drawing_import_id` `ON DELETE CASCADE`; `ai_events.drawing_import_id` `ON DELETE SET NULL`.
- **FK column rename note:** original spec used `drawing_id` as the FK on `drawing_import_runs` and `ai_events`. Since the parent table was renamed `drawings` → `drawing_imports`, the FK was renamed to `drawing_import_id` for consistency with the parent table name (matches the existing schema convention of FK = `<parent_singular>_id`).
- **Migration:** `prisma/migrations/20260505000000_draw_schema_foundation/migration.sql` (115 lines). Generated via `prisma migrate diff --from-schema-datasource ... --to-schema-datamodel ... --script` (read-only introspection — `prisma migrate dev` failed on shadow-DB replay of an older migration, P3006/P1014, unrelated to this change). Application path per CLAUDE.md "manual SQL + resolve" workflow: `psql < migration.sql` then `prisma migrate resolve --applied 20260505000000_draw_schema_foundation`.
- ✅ `npx prisma validate` clean. `npx prisma generate` produced client v5.22.0. `npx tsc --noEmit` zero errors.
## 2026-05-06 — DRAW-UPLOAD
- **Title:** Drawing upload to R2 + mechanical classifier + classification override (Phase 1 sprint 2 of 3)
- **Status:** ✅ Resolved
- **Branch:** feat/draw-upload
- **What:** Three new files. (1) Pure mechanical classifier that maps a file to one of A_PENCIL_SKETCH / B_SHOP_DRAWING / C_CAD_BENCHTOP / D_CABINETRY_PACK / E_CONSTRUCTION_PLAN using file format + PDF metadata signals — no AI calls, no DB, no I/O. (2) `POST /api/drawings/upload` multipart route that uploads the file to R2, runs the classifier, and writes a `drawing_imports` row. (3) `PATCH /api/drawings/[id]/classify` override route that updates the classification AND captures the correction as an `ai_events` row (`kind: 'drawing_class_correction'`) — first data into the AI flywheel.
- **Files added (no existing files modified):**
  - `src/lib/services/drawing-classifier.ts` — pure function `classifyDrawing(input) → { drawingClass, drawingFormat, confidence, signals[] }`.
  - `src/app/api/drawings/upload/route.ts` — POST multipart upload, R2 storage, classifier, drawing_imports insert.
  - `src/app/api/drawings/[id]/classify/route.ts` — PATCH override, ai_events flywheel capture.
- **Classifier rule precedence (PDF branch):** (1) `pageCount >= 10` → D_CABINETRY_PACK 0.85 (wins over CAD-producer detection — multi-page packs are packs regardless of authoring tool); (2) CAD-producer cascade — `(textLayer && pages<=3)` → C_CAD_BENCHTOP 0.9, `(pages 4-9)` → E_CONSTRUCTION_PLAN 0.75, else → C_CAD_BENCHTOP 0.8; (3) `hasTextLayer === false` → A_PENCIL_SKETCH 0.6 (scanned); (4) `(pages<=3 && textLayer)` → B_SHOP_DRAWING 0.7; (5) default → B_SHOP_DRAWING 0.5.
- **CAD producer allow-list:** case-insensitive substring match against `pdfProducer` for `microstation`, `autocad`, `illustrator`, `libreoffice`, `revit`, `vectorworks`, `sketchup`, `archicad`, `bentley`.
- **Upload route key constraints:** max 50MB; allow-list `pdf/jpg/jpeg/png/heic/dxf/dwg/ifc` accepted via mime **or** filename extension (generic mimes like `application/octet-stream` are common for DXF/DWG/IFC); R2 key `drawings/{companyId}/{Date.now()}-{safeName}` with `safeName` stripped of path components and `[^A-Za-z0-9._-]` replaced with `_`.
- **PDF metadata extraction:** uses `pdf-lib` (already in `package.json`, no new deps). Extracts `pageCount` and `pdfProducer`. `hasTextLayer` left null with TODO — text-layer detection requires `pdfjs-dist` worker setup which is out of scope for this sprint; classifier null-handling defaults to B_SHOP_DRAWING 0.5 when text-layer signal is unknown.
- **Codebase-pattern divergence from spec template:** spec template imported `requireAuth` from `@/lib/auth` and `import { prisma } from '@/lib/prisma'`. Existing codebase uses `getCurrentUser` (returns `UserPayload | null` with `companyId`) and `import prisma from '@/lib/db'` (default import) — followed codebase convention per spec's "use whatever auth/prisma pattern exists" instruction. `companyId` guard returns 403 when missing.
- **Override route flywheel payload** (matches spec exactly): `kind: 'drawing_class_correction'`, `inputJson: { originalClass, confidence }` (confidence read from `drawing_imports.metadata.classification.confidence`), `outputJson: { correctedClass }`, `diffJson: { ai: oldClass, user: newClass }`, `drawingClass: newClass` (denormalised for index-supported queries on `ai_events.drawing_class`). Wrapped in `prisma.$transaction` so event creation and drawing update succeed or fail atomically. No-op short-circuit when new class equals current class — no event written.
- **Build pattern:** spec used `[...VALID_CLASSES].join(', ')`. Per CLAUDE.md "Arrays from Sets — ALWAYS use Array.from" rule, switched to `Array.from(VALID_CLASSES).join(', ')` to avoid Railway build failure.
- **Australian spelling:** `Unauthorised` (401 response), `sanitiseFilename` helper. Comments use Australian spellings.
- ✅ `npx tsc --noEmit` zero errors. No npm packages installed. No schema changes. No existing files modified.
## 2026-05-06 — CALC-FIX-CORNERJOINS
- **Title:** Corner-join cost ($96 on Quote 156 U-shape Kitchen) invisible in piece breakdown; PDF data model missing the field
- **Status:** ✅ Resolved
- **Branch:** feat/draw-upload (piggy-backed onto DRAW-UPLOAD sprint commit)
- **Audit reference:** `CALCULATOR-AUDIT-REPORT.md` §2.10 — "THE PHANTOM $96 — diagnosis"
- **Root cause:** the calculator (pricing-calculator-v2.ts:1588-1597) sets `pbd.cornerJoin = { joinCost, grainMatchingSurcharge, ... }` for L/U-shape pieces and adds the cost into `pbd.pieceTotal`, but `QuickViewPieceRow.tsx` lines 2496-2630 had NO render branch for `breakdown.cornerJoin`. The $96 corner-join on the Kitchen piece was silently included in `pieceTotal` but invisible to the user — gap between displayed line items and Subtotal. The PDF pricing struct (`QuotePdfPiece.pricing`) similarly had no `cornerJoin` field, so any future PDF renderer surfacing the breakdown would be unable to display it.
- ✅ **QuickViewPieceRow.tsx:** added two new render rows immediately after the existing oversize-Grain row (line 2571) and before the Cutouts section (line 2572). New rows: **Corner Join** (`breakdown.cornerJoin.joinCost`, displays `Lm × rate × cost` matching the oversize-Join pattern) and **Corner Grain Matching** (`breakdown.cornerJoin.grainMatchingSurcharge`, displays `(rate%) × cost` matching the oversize-Grain pattern). Mirrors the EXACT JSX structure of the existing rows — same wrapper className, same flex layout, same `text-[11px] text-gray-400` for the rate-detail span, same `font-medium tabular-nums` for the amount. Per Rule 6/7 (extend, never replace; new features add code).
- ✅ **quote-pdf-service.ts:** added `cornerJoin: number` to the `QuotePdfPiece.pricing` interface (line 47) and `cornerJoin: pb?.cornerJoin ? (pb.cornerJoin.joinCost + pb.cornerJoin.grainMatchingSurcharge) : 0` to the inline pricing object literal (line 322-324). Mirrors the `oversize` pattern — single rolled-up number combining join cost + grain surcharge. Renderer layout untouched per spec ("scheduled for Sprint 7"); this sprint only threads the data through.
- **Quote-total components — no change applied (deliberate).** Both `TotalBreakdownAccordion.tsx:48` and `QuoteCostSummaryBar.tsx:46` already aggregate `serviceType === 'JOIN'` from `calculation.breakdown.services.items[]` (added in PR #633 / B5-CALC-JOIN-DISPLAY, merged 2026-05-05). The calculator emits both oversize-rectangle joins (line 1301-1310) and L/U corner joins (line 1360-1366) under the same `JOIN` discriminator, so the corner-join $96 was already flowing into the quote-total Join line via that path. The audit report's claim that "Quote Total Join binds to oversize.joinCost only" was based on pre-#633 source review.
- **Adjacent regression flagged (out of scope):** the per-piece reducer in `TotalBreakdownAccordion.tsx:37` reads `acc.join += p.oversize?.joinCost ?? 0`, AND a separate post-reduce sum adds `services.items` filtered to `JOIN`. The calculator emits oversize joins as service items too, so for an OVERSIZE rectangle piece the join cost may currently appear in BOTH paths — potential double-count. Not triggered for Quote 156 (U-shape Kitchen is not oversize). Will need a separate sprint to refactor the reducer to a single source of truth.
- **Files changed:** 2 files, 23 insertions, 0 deletions, 0 modifications-to-existing-lines.
  - `src/components/quotes/QuickViewPieceRow.tsx` (+19)
  - `src/lib/services/quote-pdf-service.ts` (+4)
- ✅ `npx tsc --noEmit` zero errors.
## 2026-05-06 — CALC-FIX-SUBTOTAL-TRANSPARENCY
- **Title:** Rules-engine discount ($101.06 on Quote 156) now visible as "Pricing Adjustment" line; rate × quantity detail added to Materials, Installation, Delivery, Templating in Quote Total
- **Status:** ✅ Resolved
- **Branch:** fix/calc-fix-subtotal-transparency
- **Audit reference:** `CALCULATOR-AUDIT-REPORT.md` — two-base subtotal/GST mismatch ($2,021.21 displayed subtotal vs $1,920.15 GST base)
- **Root cause:** the calculator returns `subtotal` (pre-rules-discount) and `gstAmount` (computed off post-rules-discount `finalTotal`), with a `rulesDiscount` field exposed in the runtime return at line 1948 of `pricing-calculator-v2.ts`. But `rulesDiscount` was NOT declared on the `CalculationResult` interface, so consumers couldn't read it without a cast. The Quote Total UI rendered Subtotal → Discount (order-level) → GST with no visible reconciliation between the two bases — the $101.06 rules-engine discount was invisible. My Gate 0 grep hit `rulesDiscount?: number;` at line 177 of `pricing-calculator-v2.ts` (a different internal type), which led to an incorrect "Gate 1A is no-op" claim — corrected at Gate 1.
- ✅ **pricing.ts:** added `rulesDiscount?: number;` to `CalculationResult` interface between `totalDiscount` and `total`. Pure additive — no field renamed, no field removed. Calculator already emits the runtime value; this just declares the type so consumers can read it.
- ✅ **TotalBreakdownAccordion.tsx (Gate 1B):** new "Pricing Adjustment" row inserted between the existing Subtotal row and Discount block. Renders only when `calculation.rulesDiscount > 0`; uses the same `text-sm text-green-600 px-1` styling as the existing positive-Discount branch (consistent visual treatment for "money off the customer"). Reads `calculation.rulesDiscount` directly — no UI-side computation. Label is "Pricing Adjustment" (per spec, not "Rules Discount" — that's internal terminology).
- ✅ **TotalBreakdownAccordion.tsx (Gate 2):** added inline rate × quantity detail spans to Materials, Installation, Delivery, Templating rows, mirroring the QuickViewPieceRow Cutting/Edge Profiles pattern (`text-[11px] text-gray-400` formula text inline next to the amount). Six new helper functions added at top of file: `unitShort`, `unitLabel`, `buildMaterialsDetail`, `buildInstallationDetail`, `buildDeliveryDetail`, `buildTemplatingDetail`. Helpers consume `calculation.breakdown.{materials, delivery, templating}` and the existing `pieces` array — no parallel computation in the UI; all data sourced from the calculator's existing return.
  - **Materials:** `{slabCount} slab(s) {materialName} × ${slabRate} + {N}% margin (${marginAmount})` (PER_SLAB) or `{areaM2} m² × ${rate}/m²` (PER_SQUARE_METRE). Uses `breakdown.materials.{slabCount, materialName, slabRate, margin, pricingBasis, adjustedAreaM2, appliedRate}` — all already exposed by `MaterialBreakdown`.
  - **Installation:** `{Σ quantity} {unitShort} × ${rate} {unitLabel}`. Sums `pieces[].fabrication.installation.quantity`; rate is uniform per service so any sample piece yields it.
  - **Delivery:** `{zone} zone · {distanceKm} km` — zone + distance only. Rate breakdown DEFERRED (see below).
  - **Templating:** `{distanceKm} km` — distance only. Rate breakdown DEFERRED.
- **NEEDS CALCULATOR CHANGE — DEFERRED:** the constants `DELIVERY_ZONES` (line 73 of `pricing-calculator-v2.ts`) and `TEMPLATING_RATE` (line 79: `{ baseCharge: 150, ratePerKm: 2.0 }`) are not exposed on `breakdown.delivery` or `breakdown.templating`. Once added (`baseRate`/`ratePerKm` on delivery, `baseCharge`/`ratePerKm` on templating), the helpers can append the rate breakdown strings (`$X base + $Y/km` for Delivery, `$base + km × $perKm/km` for Templating). Two `// NEEDS CALCULATOR CHANGE — deferred` comments left in source above the affected helpers so the next sprint finds them via grep.
- **No changes to:** `pricing-calculator-v2.ts` (calculator math untouched per spec), `pricing-rules-engine.ts`, any API route, `QuickViewPieceRow.tsx`, `QuoteCostSummaryBar.tsx`, `quote-pdf-service.ts`. Per Rule 6/7 — extend, never replace; new features add code.
- **Verification scenario for Quote 156 (Rule 28 / Rule 53):** after Railway deploys, the Quote Total accordion shows: `Subtotal $2,021.21` → `Pricing Adjustment -$101.06` (NEW, green) → `Discount $0.00` (unchanged) → `GST $192.02` → `Total $2,112.17`. Math reconciles: 2,021.21 − 101.06 = 1,920.15; × 1.10 = 2,112.17. Adjacent regression: any quote with no rules discount keeps the Pricing Adjustment row hidden.
- **Files changed:** 2 files, 118 insertions, 5 deletions (the deletions are existing single-`<span>` row endings being wrapped in a new flex-gap-2 div around the conditional detail span — no logic deleted).
  - `src/lib/types/pricing.ts` (+1)
  - `src/components/quotes/TotalBreakdownAccordion.tsx` (+117 net)
- ✅ `npx tsc --noEmit` zero errors.
## 2026-05-06 — CALC-FIX-PDF-READONLY
- **Title:** PDF service is now read-only against `quotes` — eliminates last-writer-wins drift between PDF generation and UI render
- **Status:** ✅ Resolved
- **Branch:** fix/calc-fix-pdf-readonly
- **Audit reference:** `CALCULATOR-AUDIT-REPORT.md` — for Quote 156 the Kitchen pieceTotal moved $1,659.75 → $1,719.75 (+$60) between PDF generation and UI render, the rules engine drifted $98.06 → $101.06 between the two runs, combined $62.70 discrepancy. Root cause: TWO writers to the same DB row — both the UI calculate route AND the PDF service called `calculateQuotePrice` and persisted the result back to `quotes.{subtotal, tax_amount, total, calculation_breakdown, calculated_at}`. Last writer wins.
- **Architectural fix:** make the PDF service a pure reader. It still calls `calculateQuotePrice` for fresh numbers (the PDF must reflect current state), but it does NOT write the result back to the DB. The UI calculate route at `src/app/api/quotes/[id]/calculate/route.ts:103` becomes the single canonical writer to the persisted calculation fields.
- ✅ **quote-pdf-service.ts:** removed the 16-line `try { prisma.quotes.update({...}) } catch (e) { console.error(...) }` persist block and its leading comment (was lines 252-266). Removed the now-unused `import type { Prisma } from '@prisma/client'` (was line 10 — line 261 was the only reference, via `Prisma.InputJsonValue` cast). Extended the comment above `calculateQuotePrice` to record the new invariant: *"The UI calculate route is the single canonical writer; the PDF service is read-only against the quotes table to avoid last-writer-wins drift between PDF generation and UI render."*
- **No downstream impact** — Gate 0 confirmed the PDF service never read back from `quote.subtotal`/`quote.tax_amount`/`quote.total`/`quote.calculation_breakdown` (zero grep matches). All downstream code in `assembleQuotePdfData` consumes `calcBreakdown.*` directly. The persist block was a side-effect-only operation that the PDF service did not depend on.
- **No other writers** — Gate 2 verified: `src/app/api/quotes/[id]/pdf/route.ts` has zero `.update`/`.create`/`.upsert`/`.delete` calls (only one read: `prisma.quote_templates.findFirst` for styling). `src/components/QuotePDF.tsx` has zero Prisma calls (pure renderer; the `.create` grep hit was `StyleSheet.create()` from `@react-pdf/renderer`).
- **Calculator math untouched** — `pricing-calculator-v2.ts` unchanged per spec.
- **Verification scenario for Quote 156 (Rule 28 / Rule 53):** after Railway deploys, open the quote in the UI and download the PDF — Subtotal/Total must match across both surfaces. Generate a PDF without editing — `quote.calculated_at` must NOT advance (it would have, before this change). Open Network tab during PDF generation — no `PUT/PATCH/POST /api/quotes/[id]` requests fire. Adjacent regression: edit any piece and save — the UI calculate route still writes; `calculated_at` advances; the displayed total updates.
- **Files changed:** 1 file, 4 insertions, 17 deletions, -13 net.
  - `src/lib/services/quote-pdf-service.ts` (-13)
- ✅ `npx tsc --noEmit` zero errors.
## 2026-05-06 — CALC-FIX-EDGE-NAMES
- **Title:** Every edge in PDF displayed as "CML" — IDs were being passed to `edgeCode()` instead of resolved profile names
- **Status:** ✅ Resolved
- **Branch:** fix/calc-fix-edge-names
- **Audit reference:** `CALCULATOR-AUDIT-REPORT.md` — `edgeCode()` keyword fallthrough produced `"CML"` for every edge_type whose CUID happens to start with `cml` (which is all of them).
- **Root cause:** `quote-pdf-service.ts` populates `edges.{top, bottom, left, right}` from `piece.edge_top` etc., which the schema declares as `String?` columns containing **edge_type IDs (CUIDs like `"cmlar3eu20006znatmv7mbivv"`)**, NOT profile names. The PDF service then passed the raw ID to `edgeCode()` (in `src/lib/utils/edge-utils.ts:53-63`) as if it were a name. None of `edgeCode`'s keywords (`pencil`/`bullnose`/`ogee`/`mitr`/`bevel`/`polish`) matched a CUID string, so every call fell through to `name.substring(0, 3).toUpperCase()`. Since every edge_type ID in this codebase starts with `cml…` (Prisma CUID prefix), every edge displayed as `"CML"` regardless of which profile it actually was.
- ✅ **quote-pdf-service.ts:** added a `prisma.edge_types.findMany({ select: { id: true, name: true } })` query alongside the existing `cutout_types.findMany` (read-only — no DB writes, consistent with the read-only invariant from CALC-FIX-PDF-READONLY). Built `edgeNameMap: Map<string, string>` of id → name. Extended `buildEdgeSummary(edges, edgeNameMap)` signature to accept the lookup map. Inside the loop, replaced the truthy-non-raw filter with an early-`continue` cascade that (1) skips null IDs, (2) **resolves the ID to a name via `edgeNameMap.get(profile) ?? 'Unknown'`** with a defensive fallback, (3) skips if resolved name is "raw", (4) calls the existing `edgeCode(name)` against the resolved name. Updated the single call site at line 348 to pass the new map.
- **Why Option 1 (resolve → existing `edgeCode`) over Option 2 (bypass `edgeCode`):** `edgeCode` already handles every NCS-known profile name correctly via its keyword cascade plus substring fallback — `"Pencil Round"` → `PR`, `"Mitered"` → `MIT` (substring fallback because `"mitered"` doesn't contain `"mitr"` contiguously) or `M` (if DB stores Australian `"Mitred"`), `"Beveled"` → `BV`, `"Bullnose"` → `BN`, `"Ogee"` → `OG`, `"Arris"` → `ARR` (substring fallback), `"Raw"` → `RAW`, `"Unknown"` → `UNK` (defensive fallback). No changes to `edgeCode` itself; the function is correct given a real name as input. Per Rule 6/7 (extend, never replace) — fix the data feeding the function rather than rewriting the function.
- **`edgeCode` walk-through correction from Gate 1 report:** I claimed `edgeCode("Mitered")` returns `"M"` via the `mitr` keyword. That was wrong — `"mitered"` is `m-i-t-e-r-e-d` and does NOT contain the substring `"mitr"` contiguously. It falls through to `substring(0, 3).toUpperCase()` = **`"MIT"`**. If the DB stores the Australian spelling `"Mitred"`, then `"mitred"` does contain `"mitr"` and `edgeCode` returns `"M"`. Production output depends on which spelling lives in the live `edge_types.name` column. Either is correct and not "CML"; the cosmetic difference (M vs MIT) is downstream of `edgeCode`'s keyword design.
- **Shaped pieces (L/U) — out of scope, flagged.** The PDF service has no code path for surfacing shaped-piece edges (Gate 0 grep for `shapeConfig|shape_config.*edges|edge_arc_config` in `quote-pdf-service.ts` returned zero matches). For L/U pieces, `piece.edge_top` etc. are all `null` — the rectangle path produces an empty `edgeSummary`. Surfacing `shape_config.edges` for L/U pieces in the PDF is a separate gap, deferred to a future PDF-overhaul sprint (Sprint 7+).
- **No changes to:** `pricing-calculator-v2.ts`, `pricing-rules-engine.ts`, UI calculate route, PDF API route, `QuotePDF.tsx`, `edge-utils.ts` (the `edgeCode` function preserved).
- **Verification scenario for Quote 156 (Rule 28 / Rule 53):** after Railway deploys, generate the PDF for any quote with a rectangle piece that has a non-raw edge profile — the edge summary will show the real abbreviation (`MIT`/`ARR`/`PR`/`BV`/`BN`/`OG`), not `CML`. Direct grep for `"CML"` in rendered PDF text across the corpus must return zero matches. Adjacent regression: cutout summaries unchanged (the `cutout_types` lookup was the existing pattern; this sprint just added a sibling `edge_types` lookup).
- **Files changed:** 1 file, 33 insertions, 14 deletions, +19 net.
  - `src/lib/services/quote-pdf-service.ts` (+19)
- ✅ `npx tsc --noEmit` zero errors.
## 2026-05-06 — CALC-FIX-PDF-DIMENSIONS
- **Title:** L/U-shaped pieces in PDF showed bounding-box dimensions instead of individual part dimensions; now match NCS Q22338 format
- **Status:** ✅ Resolved
- **Branch:** fix/calc-fix-pdf-dimensions
- **Audit reference:** `CALCULATOR-AUDIT-REPORT.md` — PDF renderer line 412 used `${piece.lengthMm} × ${piece.widthMm}mm` which is the bounding box (`2840 × 2180mm` for U-shape Kitchen). NCS reference quote Q22338 lists individual parts (`1 @ 965 × 600`, `1 @ 1200 × 600`, etc.). The per-leg dimensions live in `shape_config.{back, leftLeg, rightLeg}` (or `leg1, leg2` for L-shape) but were never threaded into the PDF data model.
- **Root cause:** `QuotePdfPiece` carried only the rectangle `lengthMm`/`widthMm` columns from the DB row, which for shaped pieces are populated as the bounding-box rectangle. The shape's actual part dimensions in `quote_pieces.shape_config` (JSONB column) were available on the prisma piece row but never extracted.
- ✅ **quote-pdf-service.ts (data model):** added optional `parts?: Array<{ name: string; lengthMm: number; widthMm: number }>` to the `QuotePdfPiece` interface (purely additive — `?` optional, no field renamed). Imported `ShapeConfig`, `LShapeConfig`, `UShapeConfig` types from `@/lib/types/shapes` (type-only imports). Added `buildPartsFromShapeConfig(shapeType, shapeConfig)` helper that double-casts the JSONB through `as unknown as ShapeConfig` (Rule 9), checks both the DB column `shape_type` AND the JSON discriminator `cfg.shape` for agreement, and returns:
  - `L_SHAPE` → 2 parts: `Leg 1` (leg1.length × leg1.width), `Leg 2` (leg2.length × leg2.width).
  - `U_SHAPE` → 3 parts: `Back` (back.length × back.width), `Left Leg`, `Right Leg`.
  - Anything else (rectangle, radius, circle, concave arc, rounded rect, malformed config) → `undefined` so renderer falls back to bounding box.
- ✅ **quote-pdf-renderer.ts (display):** extended `buildPieceRow` (line 407) with a `hasParts = piece.parts != null && piece.parts.length > 0` boolean. When true: top-row dimensions slot is empty (`''`); each part is pushed as a leading detail row in the format `1 @ {L} × {W}mm ({Name})` — matching the NCS Q22338 reference exactly. When false: existing `${piece.lengthMm} × ${piece.widthMm}mm` template fires unchanged. Other detail rows (description, edges, cutouts, material) flow after the parts.
- **Defensive behaviour:** `buildPartsFromShapeConfig` returns `undefined` on null shape_config, missing legs, or discriminator mismatch (e.g. `shape_type === 'U_SHAPE'` but `cfg.shape !== 'U_SHAPE'`) — protecting against partially-built pieces or legacy data drift.
- **Out of scope (deferred to Sprint 7+ PDF overhaul):**
  - Curved pieces (`RADIUS_END`, `FULL_CIRCLE`, `CONCAVE_ARC`, `ROUNDED_RECT`) — fall through to bounding box. Their dimension fields (radius, diameter, etc.) need a separate display path.
  - The empty top-row dimensions slot for L/U pieces relies on flexbox preserving column alignment with empty Text. If layout shifts emerge in production, that's a styling adjustment, not a correctness fix.
- **No changes to:** `pricing-calculator-v2.ts`, `pricing-rules-engine.ts`, UI calculate route, `QuotePDF.tsx`, builder-UI parts components (`PieceRow.tsx`, `QuickViewPieceRow.tsx`, etc. — they already display per-leg dims via direct shape_config reads).
- **Verification scenario for Quote 156 (Rule 28 / Rule 53):** after Railway deploys, the U-shape Kitchen piece in the PDF shows three detail rows immediately below the piece name: `1 @ 2840 × 600mm (Back)`, `1 @ 1580 × 600mm (Left Leg)`, `1 @ 1580 × 600mm (Right Leg)` — instead of the bounding-box `2840 × 2180mm` in the top row. Adjacent regression: any all-rectangle quote shows the existing `{lengthMm} × {widthMm}mm` per piece, no parts rows.
- **Files changed:** 2 files, 68 insertions, 1 deletion, +67 net.
  - `src/lib/services/quote-pdf-service.ts` (+56) — `parts?` field on `QuotePdfPiece`, type imports, `buildPartsFromShapeConfig` helper, wiring at assembly site
  - `src/lib/services/quote-pdf-renderer.ts` (+11) — conditional parts-as-details branch in `buildPieceRow`
- ✅ `npx tsc --noEmit` zero errors.
## 2026-05-07 — CALC-EXPOSE-RATE-DETAIL
- **Title:** Closes the Sprint 2 deferred TODO — calculator now exposes `baseCharge` and `ratePerKm` on `breakdown.delivery` and `breakdown.templating` so the Quote Total UI can show full rate × quantity formulas
- **Status:** ✅ Resolved
- **Branch:** fix/calc-expose-rate-detail
- **Audit reference:** Sprint 2 (CALC-FIX-SUBTOTAL-TRANSPARENCY, PR #639) added rate × quantity detail to Materials and Installation in the Quote Total accordion but had to leave Delivery and Templating PARTIAL — only zone + distance were exposed by the calculator; the per-zone `baseCharge`/`ratePerKm` and the `TEMPLATING_RATE` constant lived inside `pricing-calculator-v2.ts` (lines 73 and 79) but were never threaded onto the breakdown object. Sprint 2 left grep-findable `// NEEDS CALCULATOR CHANGE — deferred` comments above the two helpers in `TotalBreakdownAccordion.tsx`.
- **Root cause:** `getDeliveryZone()` returns the matched zone with `baseCharge`/`ratePerKm`, but `deliveryBreakdown` only persisted the zone NAME (line 1756); the rate fields were dropped on the floor. `templatingBreakdown` similarly never read from `TEMPLATING_RATE` even though that singleton constant is in scope at the assembly site.
- ✅ **pricing.ts (types):** added optional `baseCharge?: number | null` and `ratePerKm?: number | null` to both `delivery` and `templating` blocks of `CalculationResult.breakdown`. Optional because legacy `calculation_breakdown` JSONs persisted before this sprint don't carry them — UI must handle either shape.
- ✅ **pricing-calculator-v2.ts (delivery):** added a post-block `getDeliveryZone(deliveryDistanceKm, DELIVERY_ZONES)` lookup AFTER the auto-calc try/catch (line 1753 area). The lookup runs whenever distance is known — works for both freshly-calculated quotes (auto-calc path) and saved-cost quotes (where the auto-calc block doesn't fire). The existing auto-calc block was NOT touched. Two new fields on `deliveryBreakdown`: `baseCharge: matchedDeliveryZone ? Number(matchedDeliveryZone.baseCharge) : null` and `ratePerKm: matchedDeliveryZone ? Number(matchedDeliveryZone.ratePerKm) : null`. Explicit `Number()` coercion because `DeliveryZone.baseCharge` is typed `number | { toString(): string }` in `distance-service.ts:8-9` for Prisma Decimal compatibility.
- ✅ **pricing-calculator-v2.ts (templating):** added two fields directly from the `TEMPLATING_RATE` const literal: `baseCharge: TEMPLATING_RATE.baseCharge` and `ratePerKm: TEMPLATING_RATE.ratePerKm`. No coercion needed — the const is plain numbers. Existing `finalCost` calculation and `templatingRequired` guard preserved.
- ✅ **TotalBreakdownAccordion.tsx (UI helpers):** removed both `// NEEDS CALCULATOR CHANGE — deferred:` comment blocks (lines 60-64 and 75-78). Extended `buildDeliveryDetail` to append `${formatCurrency(baseCharge)} base + ${formatCurrency(ratePerKm)}/km` when both fields are populated. Restructured `buildTemplatingDetail` to a three-branch cascade — full formula (`$base + ${km} km × $rate/km`) when all three fields populated, distance-only fallback, null fallback. Both helpers' null-guards mean legacy stored breakdowns don't break.
- **Calculation logic UNCHANGED.** `deliveryBreakdown.finalCost` still uses `overrideDeliveryCost ?? calculatedDeliveryCost ?? 0`. `templatingBreakdown.finalCost` still uses the templatingRequired guard + override-or-calculated pattern. The auto-calc block (`getDeliveryZone` + `calculateDeliveryCostFn` + `calculateTemplatingCostFn`) is untouched. Only the breakdown object assembly gained two fields each.
- **Naming note (resolved at Gate 0):** the spec referred to `baseRate` but the source-of-truth constants (`DELIVERY_ZONES` and `TEMPLATING_RATE`) and the `DeliveryZone` interface in `distance-service.ts` use `baseCharge`. Used `baseCharge` on the breakdown to keep parity with the constants — renaming everywhere would touch the constants themselves and the `calculateDeliveryCostFn`/`calculateTemplatingCostFn` consumers, well outside the spec's "EXTEND, never replace" rule.
- **Verification scenario for Quote 156 (Rule 28 / Rule 53):** after Railway deploys and the quote is recalculated, the Quote Total accordion shows: Delivery `Local zone · 22.5 km · $50.00 base + $2.50/km` (was `Local zone · 22.5 km`); Templating `$150.00 base + 22.5 km × $2.00/km` (was `22.5 km`). Adjacent regression: any quote with no delivery address still hides the Delivery row entirely (upstream `deliveryTotal > 0` guard); a quote with `templatingRequired === false` still hides the Templating row.
- **Files changed:** 3 files, 46 insertions, 11 deletions, +35 net.
  - `src/lib/types/pricing.ts` (+8) — optional `baseCharge?` and `ratePerKm?` on delivery and templating types
  - `src/lib/services/pricing-calculator-v2.ts` (+14) — post-block zone lookup + 2 new fields each on delivery and templating breakdowns
  - `src/components/quotes/TotalBreakdownAccordion.tsx` (+13) — removed both deferred comment blocks; extended both helpers to consume the new fields
- ✅ `npx tsc --noEmit` zero errors.
