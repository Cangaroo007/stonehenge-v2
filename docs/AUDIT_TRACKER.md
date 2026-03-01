# Stone Henge — Audit Tracker

> **Updated:** March 1, 2026
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

---

## Active Sessions

| Session | Branch | Date | Status |
|---------|--------|------|--------|
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

*Last Updated: Mar 1 2026 — PROMPT-17: R-31/R-32 strip segmentation fix. preprocessOversizePieces generates per-segment strips with end-cap logic. findSlabForStrip handles multiple occurrences per position.*
