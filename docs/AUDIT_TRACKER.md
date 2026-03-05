# Stone Henge — Audit Tracker

> **Updated:** March 2, 2026
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
| R-50 | PX-1: Missing rate detection. getServiceRateSafe() wrapper catches missing rate throws, records in missingRates[], continues with $0. Calculator no longer crashes on missing rates. PricingSummary shows amber banner listing each missing rate with piece name and description. Link to Pricing Admin for resolution. | claude/missing-rate-detection-banner-gTk82 |
| R-51 | PX-2: Extended missing rate detection to edge profiles, cutout rates, edge category rates, cutout category rates, waterfall rates, and engine-level rate throws. All rate lookups now push to missingRates[] instead of silently returning $0 or crashing. Calculator never crashes on any missing rate. 7 detection points total (up from 1 in PX-1). | claude/px2-missing-rate-coverage-xO73i |
| R-52 | PX-3: Pricing Admin Gaps tab. API endpoint scans all rate combinations (service × category, edge × category, cutout × category) and returns missing rates. GapsTab page shows coverage bars, gap tables with "Configure →" links, red badge count on tab. First tab in Pricing Management. | claude/add-pricing-gaps-tab-dgIGl |

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
| A-15 | 🔴 Critical | Build broken on main. Prisma config validation + Turbopack root issue. Blocking Railway deploys. | next.config., prisma/ | Feb 27 | Fix before FIX-11 |
| A-16 | 🟡 Medium | gh CLI not in Claude Code. Manual PR creation required every session. | dev tooling | Feb 27 | brew install gh |
| A-17 | 🟡 Medium | AUDIT_TRACKER stale line number: extractFabricationDiscount at 1563, actually 1761. | docs/AUDIT_TRACKER.md | Feb 27 | Update inventory |
| A-18 | 🟡 Medium | A-02 may be incorrect — SYSTEM_STATE checked auth import, not per-handler auth calls. | src/app/api/admin/pricing/* | Feb 27 | Verify before closing A-02 |
| A-20 | ✅ Resolved | Ghost strips in parts list — PartsSection reads stale DB record via GET; old laminationSummary has ghost strips. Fix: Recalculate button added to Slab Layout section (POST triggers fresh optimiser run). | PartsSection.tsx, OptimizationDisplay.tsx | Mar 1 | R-35 |
| A-21 | ✅ Resolved | decomposedPieceIds built from empty allPieces array (slab-optimizer.ts:574-578). Fix: changed allPieces to normalizedPieces. Ghost strips no longer generated. | slab-optimizer.ts:575 | Mar 1 | R-34 |
| A-22 | ✅ Resolved | 200mm minimum segment enforcement — optimizer allows 44mm segments (e.g. Quote 58 piece 187 Back leg remnant), warning only, no hard constraint. Should enforce minimum fabricable segment width. Fix: MIN_SEGMENT_MM=200 enforced in preprocessOversizePieces colWidths/rowHeights loops. | slab-optimizer.ts | Mar 2 | R-45 |
| A-23 | ✅ Resolved | AI Price List uploader blocks upload when "let AI detect" selected. Dropzone greyed out, sync blocked. Fix: upload gate removed, dropzone always enabled, auto-select supplier after parse, clearer sync error message. | src/app/(dashboard)/admin/pricing/import/page.tsx | Mar 5 | R-49 |

---

## Active Sessions

| Session | Branch | Date | Status |
|---------|--------|------|--------|
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

*Last Updated: Mar 5 2026 — PX-3: Pricing Admin Gaps tab with coverage dashboard and missing rate tables.*
