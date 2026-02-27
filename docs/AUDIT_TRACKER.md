# Stone Henge — Audit Tracker

> **Updated:** February 27, 2026
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

---

## Open

| ID | Severity | Description | File | First Seen | Assigned To |
|----|----------|-------------|------|------------|-------------|
| A-14 | 🔴 Critical | R-10 false positive. L/U shapes broken in production: cutting $504 (should be $558), header shows bounding box 3200×2400, $0 polishing, $0 lamination, all 6 edges RAW. getCuttingPerimeterLm returns 11.20 Lm. onShapeEdgeChange not wired. getPieceDimensionLabel not in JSX. | PieceVisualEditor.tsx, QuickViewPieceRow.tsx, shapes.ts | Feb 27 | FIX-11-PHASE1/2/3 |
| A-15 | 🔴 Critical | Build broken on main. Prisma config validation + Turbopack root issue. Blocking Railway deploys. | next.config., prisma/ | Feb 27 | Fix before FIX-11 |
| A-16 | 🟡 Medium | gh CLI not in Claude Code. Manual PR creation required every session. | dev tooling | Feb 27 | brew install gh |
| A-17 | 🟡 Medium | AUDIT_TRACKER stale line number: extractFabricationDiscount at 1563, actually 1761. | docs/AUDIT_TRACKER.md | Feb 27 | Update inventory |
| A-18 | 🟡 Medium | A-02 may be incorrect — SYSTEM_STATE checked auth import, not per-handler auth calls. | src/app/api/admin/pricing/* | Feb 27 | Verify before closing A-02 |

---

## Active Sessions

| Session | Branch | Date | Status |
|---------|--------|------|--------|
| HOTFIX Phase 1 null guard | claude/fix-lshape-null-guard-VDNE5 | Feb 27 | ✅ Complete |
| FIX-11 Phase 1 — cutting formula | claude/fix-lshape-formula-Domy8 | Feb 27 | 🔄 In progress |
| FIX-11 Phase 2 — header display | fix/lshape-header-display | Feb 27 | ⏳ After Phase 1 |
| FIX-11 Phase 3 — edge wiring | fix/lshape-edge-wiring | Feb 27 | ⏳ After Phase 2 |
| FIX-4 regression anchor | fix/locked-regression-anchor | — | ⏳ After Phase 3 |
| Admin pricing auth fix | fix/admin-pricing-auth | — | ⏳ After FIX-4 |

---

*Last Updated: Feb 27 2026 — HOTFIX: null guards added to all L/U shape geometry functions (A-19 resolved)*
