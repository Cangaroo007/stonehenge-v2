# STONEHENGE V2 — MASTER ROADMAP
## Date: April 9, 2026 — EOD
## Supersedes: ROADMAP-2026-04-07-EOD.md

---

## SERIES STATUS OVERVIEW

| Series | Status | Notes |
|--------|--------|-------|
| Edge Engine (unified) | ✅ Complete | EdgePanel owns state for all 7 shape types |
| Edge Save Paths | 🟡 Mostly fixed | RECTANGLE ✅ L/U ✅ RADIUS_END ✅ Create form ❌ |
| Edge Race Condition | 🟡 Deploying | PR #617 — localEdges optimistic state |
| Edge UX (compact bar) | ❌ Broken | Profile selector missing from preset bar |
| Wall Edges | ✅ Complete | Toggle correctly shows only user-designated |
| WF/SB Wiring | ✅ Complete | Full optimizer + calculator + spatial support |
| Optimizer Series | ✅ Complete | WF/SB included, grain co-placement, L/U colours |
| Calculator Fixes | ✅ Complete | WF/SB material cost allocation |
| Spatial Room View | 🟡 Partial | Join overlay ✅ Layout fix ✅ Scale too small ❌ |
| Piece Number Labels | 🟡 Partial | Parts list ✅ Optimizer route ✅ Canvas chips ❌ |
| PDF Series | 🔴 Not started | 2 prompts ready |
| Cleanup Series | 🔴 Not started | 2 items pending |
| Calculator Audit | 🔴 Blocked | Regression anchors required |

---

## IMMEDIATE NEXT ACTIONS (start of next session)

### Step 1 — Close superseded PR
```bash
gh pr close 616 --comment "Superseded by PR #617."
```

### Step 2 — Merge PR #617 and verify
Merge edge-optimistic-local-state. Wait for Railway green. Verify:
- Edge click updates diagram instantly (no visible API wait)
- Rapid multi-click saves all edges
- DB check: `SELECT edge_top, edge_bottom FROM quote_pieces WHERE id = [id]`

### Step 3 — Full edge system regression test
Before any new feature work, run this test matrix on a RECTANGLE piece:
- [ ] Single click Top → ARR shows instantly
- [ ] Click Bottom immediately → both ARR persist
- [ ] Select All → apply Arris → all 4 edges ARR in DB
- [ ] Apply to L/U shape edges — all save
- [ ] Apply to RADIUS_END edges — straight + arc both save

---

## SPRINT QUEUE — PRIORITY ORDER

### 🔴 MUST FIX BEFORE BEAU/MICK USE DAILY

#### COMPACT-PRESET-PROFILE-FIX
**Problem:** Compact preset bar (Front Only, Front + Return etc.) requires
`quickEdgeProfileId` to be set. No way to select profile in compact view —
only Recent pills work. Blocks fast edge assignment workflow.

**Fix options:**
- A) Add a small profile dropdown to compact preset bar
- B) Read EdgePanel's `pendingProfileId` when preset is clicked

**Recommendation:** Option A — add a `<select>` or pill group above the
presets. `setQuickEdgeProfileId` already exists. Just needs a UI trigger.

#### CREATE-PIECE-EDGE-FIX
**Problem:** `PieceForm.tsx` (create piece) uses `edgeSelections` state
with its own edge picker — NOT EdgePanel. Edge selector broken for new pieces.

**Fix:** Add EdgePanel to `PieceForm.tsx` the same way it's wired in
`QuickViewPieceRow`. Edge selections save to the piece on creation.

#### THUMBNAIL-EDGE-SYNC
**Problem:** Compact card thumbnail reads `piece.edgeTop` props. `localEdges`
state in expanded view updates optimistically. Thumbnail lags behind.

**Fix:** Pass `localEdges` state down to the compact card thumbnail render
so it stays in sync with the expanded EdgePanel.

---

### 🟡 HIGH PRIORITY

#### SPATIAL-SCALE-FIX
**Problem:** `MM_TO_PX = 0.3` in room-layout-engine.ts produces unreadably
small pieces for large rooms. Labels can't be read without zooming.

**Fix:** Increase `MIN_SVG_WIDTH` and adjust scale calculation. Target:
pieces should fill the available container width. Consider making the
SVG container height dynamic based on content.

#### SPATIAL-JOIN-VERIFY
**Problem:** Not confirmed whether join lines are actually appearing on
oversize pieces. Need a test quote with a piece > 3200mm.

**Action:** Create a 3500mm benchtop, run optimizer, open spatial view,
confirm dashed red join line appears at proportional position.

#### UNKNOWN-PIECE-FIX
**Problem:** "Unknown Piece" shown in relationships display when target
piece exists but name doesn't resolve.

**Fix:** Null guard in `QuoteDetailClient.tsx` relationships display.

---

### 🟢 READY TO FIRE (prompts written)

| Sprint | Prompt | What |
|--------|--------|------|
| PDF-DETAIL-LEVEL | `PROMPT-PDF-DETAIL-LEVEL.md` | Detail level dropdown on PDF download |
| PDF-CLEANUP | `PROMPT-PDF-CLEANUP.md` | Remove dead QuotePDF component |

---

### 🔴 BLOCKED — REGRESSION ANCHORS REQUIRED

**Action required from Jay + Beau:**
1. Create 3-5 test quotes covering all piece types
2. Manually verify each line item in pricing breakdown
3. Lock as regression anchors in `scripts/regression-check.ts`

| Sprint | Blocked on |
|--------|-----------|
| SPLASH-POS-CALC | Regression anchors |
| CALCULATOR-AUDIT | Regression anchors |
| OPT-SHAPE advanced | Regression anchors |

---

## TECHNICAL DEBT REGISTER

| Item | Priority | Effort | Notes |
|------|----------|--------|-------|
| Create piece edge selector | HIGH | Medium | PieceForm needs EdgePanel |
| Compact preset profile selector | HIGH | Small | quickEdgeProfileId needs UI |
| Thumbnail/expanded state sync | HIGH | Small | localEdges needs to feed thumbnail |
| rate40mm exact values from Jay | HIGH | None (Jay action) | Current: rate × 2 placeholder |
| Regression anchors | HIGH | Jay + Beau action | Blocks calculator series |
| Spatial view scale | MEDIUM | Small | MM_TO_PX too small |
| noStripEdges schema split | LOW | Schema change | wall_edges separate column |
| Production seed re-seeds templates | LOW | Seed script fix | Known issue |
| Duplicate colours in materials list | LOW | Unknown | |

---

## ARCHITECTURE DECISIONS — LOCKED

| Decision | Status | Notes |
|----------|--------|-------|
| EdgePanel owns all edge selection state | ✅ Locked | PVE is display-only |
| localEdges for optimistic edge state | ✅ Locked | Same pattern as localEdgeBuildups |
| Atomic multi-edge saves | ✅ Locked | Rule 10.5 in FABRICATION-RULES.md |
| RECTANGLE save path | ✅ Locked | edgeTop/edgeBottom/edgeLeft/edgeRight columns |
| WF/SB = own pieces, own slabs | ✅ Locked | Inherit primary material |
| FABRICATION-RULES.md = Gate 0 | ✅ Locked | Read before every fabrication sprint |
| noStripEdges dual-purpose | ✅ Accepted short-term | wall + WF/SB strip suppression |
| PDF reads fresh calculator result | ✅ Locked | Never read stale quote.subtotal |

---

## FABRICATION RULES ADDITIONS THIS SESSION

Added to `docs/FABRICATION-RULES.md`:
- **Part 10.4** — Edge save path verification mandatory (DB check after every edge sprint)
- **Part 10.5** — Atomic multi-edge saves mandatory (no forEach + savePieceImmediate)
- **Appendix #16** — RECTANGLE edge save path confirmed

---

## MEDIUM-TERM ROADMAP

### Edge System — Complete Consolidation
1. ✅ EdgePanel owns selection state
2. ✅ RECTANGLE save path fixed
3. ✅ Atomic multi-edge saves
4. ✅ Optimistic local state
5. ❌ Create piece form (PieceForm)
6. ❌ Compact preset profile selector
7. ❌ Thumbnail sync

### Spatial View — Full Feature
1. ✅ WF/SB/splashback positioning
2. ✅ Horizontal row layout for unrelated pieces
3. ✅ Join overlay (pending verification)
4. ❌ Scale too small
5. ❌ Piece numbers in spatial list

### PDF Series
- PDF-DETAIL-LEVEL → PDF-2 (schema) → PDF-3 (email send)
- Dependency: PDF-CLEANUP first

### Customer & Contacts
- Series 14 — after PDF series complete

---

## STANDING REMINDERS

- Australian spelling: metre, colour, optimiser
- `npm run build` before every commit (Sean runs)
- Single PR at a time, Railway green between each
- `git rebase origin/main --strategy-option=union` for doc conflicts
- Never run git from Claude Code — Sean handles all git
- Gate approval exact: `"Gate [N] approved. GO."`
- Branch confirmed before every sprint
- Debug logs removed same session added
- `docs/FABRICATION-RULES.md` read at Gate 0 of every fabrication sprint
- DB verification required after every edge sprint (Rule 10.4)
