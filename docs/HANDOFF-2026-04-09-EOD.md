# STONEHENGE V2 — SESSION HANDOFF
## Date: April 9, 2026 — EOD
## Supersedes: HANDOFF-2026-04-07-EOD.md

---

## GROUND STATE

| Field | Value |
|-------|-------|
| Last confirmed commit on main | `e4fed8f` — fix(edge-apply-rectangle-fix) (#615) |
| Open PRs | #616 — SUPERSEDED, close without merging. #617 — edge-optimistic-local-state — MERGE FIRST |
| Railway | 🟡 #617 deploying — verify before next sprint |
| TypeScript errors | Zero — confirmed at every gate |
| Working directory | `~/Downloads/stonehenge-v2` |
| Production URL | stonehenge-v2-production.up.railway.app |
| DB | `postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway` |

---

## CRITICAL FIRST ACTION NEXT SESSION

```bash
gh pr close 616 --comment "Superseded by PR #617 which includes this fix plus optimistic local state."
```
Then merge #617. Verify edge clicks update instantly in production.

---

## WHAT WE DID THIS SESSION

### SPRINTS COMPLETED

| PR | Sprint | What | Status |
|----|--------|------|--------|
| #608 | CALC-NULL-MATERIAL | WF/SB material cost allocation | ✅ Main |
| #609 | WALL-EDGE-TOGGLE-FIX | Wall toggle only shows user-designated wall edges | ✅ Main |
| #610 | BUILDUP-MULTI-EDGE-FIX | Multi-edge build-up atomic save | ✅ Main |
| #611 | ROUNDED-RECT-NULL-FIX | Null guards for curved shape types | ✅ Main |
| #612 | PIECE-NUMBER-LABELS | Piece number prefix in Parts + Optimizer | ✅ Main |
| #613 | SPATIAL-JOIN-OVERLAY | Cut/join lines in spatial room view | ✅ Main |
| #614 | SPATIAL-LAYOUT-FIX | WF/SB/splashback positioning + horizontal rows | ✅ Main |
| #615 | EDGE-APPLY-RECTANGLE-FIX | EdgePanel now saves RECTANGLE edges correctly | ✅ Main |
| #616 | EDGE-PROFILE-ATOMIC-FIX | SUPERSEDED by #617 — close without merging | ⛔ Close |
| #617 | EDGE-OPTIMISTIC-LOCAL-STATE | Optimistic edge state + atomic profile save | 🟡 Merge |
| docs | FABRICATION-RULES.md | Permanent fabrication rules document | ✅ Main |

---

## ROOT CAUSES FORENSICALLY CONFIRMED THIS SESSION

### 1. RECTANGLE edges saving to wrong field (PR #615)
**Sprint:** feat(edgepanel-wire-all-shapes) PR #590 wired EdgePanel through
`handleShapeEdgeChange` for ALL shapes. `handleShapeEdgeChange` had no
RECTANGLE case — fell to `else` branch → saved to `edgeArcConfig` (wrong).
Bug existed since PR #590 (6+ weeks). Not caught because RECTANGLE was never
tested after the L/U wiring sprint.

**Fix:** Added explicit RECTANGLE/ROUNDED_RECT case to `handleShapeEdgeChange`
saving to `edgeTop/edgeBottom/edgeLeft/edgeRight`.

### 2. Multi-edge profile apply only saved last edge (PR #616/617)
**Sprint:** `onApplyProfile` used `forEach(handleShapeEdgeChange)` — same
stale closure bug as BUILDUP-MULTI-EDGE-FIX (PR #610). Each forEach
iteration fired a separate PATCH. Last write wins.

**Fix:** Replaced with atomic build per shape type, single `savePieceImmediate`.

### 3. Race condition on rapid edge clicks (PR #617)
**Root cause:** `savePieceImmediate` read `fullPiece.edgeTop/etc` as base
payload. `fullPiece` only updates AFTER API response (~200-400ms round trip
Brisbane → Railway US). Rapid sequential clicks read stale prop — second PATCH
overwrote first edge.

**Fix:** Added `localEdges` state updated optimistically before API response.
Both `savePiece` and `savePieceImmediate` now read `localEdges` for edge columns.

### 4. WF/SB waterfall wrong position in spatial view (PR #614)
`positionChild` WATERFALL only handled `isRight` vs else — all `left`, `top`,
`bottom` sides defaulted to LEFT. DB has waterfalls on top/left/right.
SPLASHBACK completely ignored `side` field.

### 5. Spatial view unreadable with many pieces (PR #614)
Unrelated pieces all got `x: 0, y: stackY` — stacked in a vertical column.
Fixed to horizontal row layout with `MAX_ROW_WIDTH_MM = 8000` wrap.

---

## CURRENT KNOWN OPEN ISSUES (priority order)

### 🔴 CRITICAL — Must fix before launch
| # | Issue | Location | Notes |
|---|-------|----------|-------|
| 1 | Compact preset bar requires profile pre-selected | QuickViewPieceRow.tsx ~line 1159 | "Select an edge profile first" error — no way to select profile in compact view |
| 2 | Create piece edge selector broken | PieceForm.tsx | EdgePanel not used in create flow — different system |
| 3 | Thumbnail/expanded view edge state mismatch | QuickViewPieceRow.tsx | Compact card thumbnail doesn't sync with EdgePanel state |

### 🟡 HIGH — Important for usability
| # | Issue | Location | Notes |
|---|-------|----------|-------|
| 4 | Spatial view too small | room-layout-engine.ts | MM_TO_PX = 0.3 too small for large rooms |
| 5 | Join lines not visible in spatial | RoomPieceSVG.tsx | Optimizer may not be run / placements not flowing through |
| 6 | Naming in Parts list still A/B/C | seed-production.js | Template piece names hardcoded as "Benchtop A" etc |

### 🟢 LOW — Backlog
| # | Issue | Notes |
|---|-------|-------|
| 7 | Unknown Piece display bug | Null guard needed in relationships display |
| 8 | Compact card Edge Build-Up still shows | Old section not cleaned up |
| 9 | Duplicate colours in materials list | |
| 10 | PDF series (PDF-0 through PDF-3) | Prompts ready |

---

## EDGE SYSTEM ARCHITECTURE — CURRENT STATE

### Save paths by shape type (QuickViewPieceRow)
| Shape | Save location | Method |
|-------|--------------|--------|
| RECTANGLE | `edgeTop/edgeBottom/edgeLeft/edgeRight` columns | `savePieceImmediate` |
| ROUNDED_RECT | Same as RECTANGLE for straight edges | `savePieceImmediate` |
| L_SHAPE / U_SHAPE | `shapeConfig.edges` sub-object | `savePieceImmediate` |
| RADIUS_END | Straight edges → DB columns; arc edges → `edgeArcConfig` | `savePieceImmediate` |
| FULL_CIRCLE / CONCAVE_ARC | `edgeArcConfig` | `savePieceImmediate` |

### Multiple edge engines (fragmentation — not yet consolidated)
| Location | Engine | Issues |
|----------|--------|--------|
| `QuickViewPieceRow.tsx` | `handleShapeEdgeChange` + `localEdges` | ✅ Fixed this session |
| `ExpandedPieceViewClient.tsx` | `handleShapeEdgeChange` → local `editFields` | ✅ No bug — uses local state |
| `InlinePieceEditor.tsx` | `setShapeEdgeOverrides` via setState updater | ✅ No bug — uses setState updater |
| `PieceForm.tsx` (create) | `edgeSelections` state | ❌ Broken — no EdgePanel |

---

## MANDATORY VERIFICATION AFTER #617 DEPLOYS

```bash
# 1. DB check — apply Arris to Top+Bottom, verify both saved
psql "postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway" \
  -c "SELECT id, name, edge_top, edge_bottom, edge_left, edge_right FROM quote_pieces WHERE id = [TEST_PIECE_ID];"

# 2. Verify Arris ID = cmlar3etm0002znat72h7jnx0 on both edge_top and edge_bottom
# 3. Verify diagram updates instantly on click (no API wait visible)
# 4. Verify rapid multi-click saves all edges
```

---

## FABRICATION RULES PROTOCOL (permanent)

`docs/FABRICATION-RULES.md` is in the repo. Gate 0 of every fabrication/pricing sprint:
```bash
cat docs/FABRICATION-RULES.md
```

New rules added this session:
- **10.4** — Edge save path verification mandatory after every edge sprint
- **10.5** — Atomic multi-edge saves mandatory (no forEach + savePieceImmediate)
- **Appendix #16** — RECTANGLE save path = edgeTop/edgeBottom/edgeLeft/edgeRight

---

## CRITICAL IDs
| Item | Value |
|------|-------|
| MITERED_EDGE_ID | `cmlar3eu20006znatmv7mbivv` |
| ARRIS_EDGE_ID | `cmlar3etm0002znat72h7jnx0` |
| PENCIL_ROUND_ID | `cmlar3etc0000znatkbilb48y` |
| Pricing settings | `ps-org-1` |

---

## NEXT SESSION FIRE ORDER

### Immediate
1. Close PR #616 (superseded)
2. Merge PR #617 (edge-optimistic-local-state)
3. Verify in production — instant edge updates, no race condition

### Ready to Fire (prompts written)
- PDF-DETAIL-LEVEL
- PDF-CLEANUP

### Needs Prompt Written (in priority order)
1. **COMPACT-PRESET-PROFILE-FIX** — add profile selector to compact card preset bar
2. **CREATE-PIECE-EDGE-FIX** — add EdgePanel to PieceForm create flow
3. **SPATIAL-SCALE-FIX** — increase spatial view scale for readability
4. **UNKNOWN-PIECE-FIX** — null guard for relationships display

### Blocked
- SPLASH-POS-CALC — regression anchors (Jay + Beau)
- CALCULATOR-AUDIT — same
