# STONEHENGE V2 — KEY LEARNINGS
## Date: April 9, 2026 — EOD
## Supersedes: KEY-LEARNINGS-2026-04-07-EOD.md

---

## SESSION THEME

This session was dominated by a single systemic failure: **the edge system
has never been fully tested end-to-end for all shape types.** Sprints that
wired EdgePanel assumed the plumbing worked but never verified the DB outcome.
The result was compounding bugs — each fix revealed the next layer of breakage.

---

## MOST IMPORTANT LEARNING: THE MISSING VERIFICATION STEP

Every sprint that touched edge save paths passed:
- ✅ TypeScript compilation
- ✅ Gate line number verification
- ✅ Doc updates

But NONE of them included:
- ❌ DB verification: `SELECT edge_top FROM quote_pieces WHERE id = X`
- ❌ Multi-shape testing: verify RECTANGLE AND L_SHAPE AND RADIUS_END
- ❌ Rapid click testing: click multiple edges fast and verify all saved

**This is now Rule 10.4 in FABRICATION-RULES.md.** It is mandatory after
every sprint touching edge save paths. No exceptions.

---

## ARCHITECTURAL LEARNINGS

### 1. Single engine wiring ≠ single engine behaviour

PR #590 "wired EdgePanel as single edge engine for all shapes." This was
architecturally correct for state management (EdgePanel owns selection).
But it did NOT make the SAVE paths consistent — `handleShapeEdgeChange`
still had 4 different branches, and the RECTANGLE branch was missing,
causing silent fallthrough to `edgeArcConfig`.

**Lesson:** "Wiring the UI" and "unifying the save path" are two separate
problems. Both must be explicitly verified.

### 2. Stale closure in forEach is a recurring pattern — add it to Gate 0

We hit the same stale closure bug three times:
- PR #610: `onApplyBuildup` forEach → fixed atomically
- PR #616/617: `onApplyProfile` forEach → fixed atomically
- Both `savePieceImmediate` and `savePiece` read stale `fullPiece`

**Lesson:** Any time a new callback uses forEach + setState or forEach +
API call, it must be reviewed for stale closure risk at Gate 0.
Add to FABRICATION-RULES.md: "scan for forEach + savePieceImmediate pattern."

### 3. Race condition between optimistic UI and API response

`savePieceImmediate` sent the full piece payload using `fullPiece` props
as the base. `fullPiece` only updates after the API responds (~200-400ms).
Rapid sequential clicks raced against each other — second click overwrote
the first because both read `fullPiece` with the same stale values.

**Fix pattern:** Local optimistic state (`localEdges`) mirrors the prop,
updated synchronously before the API call. This is the same pattern as
`localEdgeBuildups` (PR #610). It should have been added in the same sprint.

**Lesson:** Every field that can be rapidly edited needs local optimistic
state. Identify all such fields at the start of any editing sprint.

### 4. "Fixed in one place" ≠ "fixed everywhere"

Bugs were fixed in `QuickViewPieceRow` but identical patterns exist in:
- `ExpandedPieceViewClient.tsx` — different implementation, accidentally correct
- `InlinePieceEditor.tsx` — different implementation, accidentally correct
- `PieceForm.tsx` — completely different system, still broken

**Lesson:** When fixing a bug, always search for the same pattern in ALL
files that handle the same concern. The search should be part of Gate 0.

### 5. Large piece count exposes layout engine assumptions

The spatial view layout engine assumed most pieces would be related
(parent-child). With 6+ unrelated benchtops, all pieces stacked vertically
at `x: 0` — completely unreadable. The WATERFALL positioning code assumed
`RIGHT` as the only meaningful side — `TOP` and `LEFT` were never tested.

**Lesson:** Test with realistic quote complexity, not simple test cases.
Quote 114 (6 benchtops + U-shape + waterfall + splashback) should be the
standard test quote, not a single rectangle benchtop.

---

## PROCESS LEARNINGS

### 6. PRs that get superseded confuse the merge queue

PR #616 was created, then PR #617 was cut from main (before #616 merged)
and included the same fix plus more. #616 was never closed, creating two
open PRs with overlapping changes.

**Rule:** When a sprint is superseded mid-session, close the old PR immediately
with a comment explaining why. Never leave two conflicting PRs open.

### 7. The "Select an edge profile first" UX was never fixed — only worked around

The compact preset bar has always required `quickEdgeProfileId` to be set
before using presets. The EdgePanel below now has its own profile selector,
but these two systems don't share state. The UX is confusing because they
look related but operate independently.

**This is a design debt item, not a bug.** The fix is either:
- A) Add a profile dropdown to the compact preset bar
- B) Make the compact preset bar read EdgePanel's selected profile

Neither was implemented. It must be scoped properly.

### 8. The "thumbnail vs expanded" disconnect was never diagnosed

The compact card thumbnail shows edge state from `piece.edgeTop` props.
The expanded EdgePanel reads from `localEdges` (after #617). These are
now inconsistent — thumbnail shows stale prop until parent re-renders.

**This must be the next sprint after #617 confirms working.**

---

## WHAT WORKED WELL

### FABRICATION-RULES.md enforced correctly
Every fabrication sprint read the document at Gate 0. No domain rules were
re-litigated. Jay's answers stayed locked.

### Optimistic state pattern (localEdges) is clean
The `localEdges` implementation is identical to `localEdgeBuildups` — a
pattern we already had. It should have been added earlier but the pattern
itself is correct and maintainable.

### Forensic root cause analysis before fixing
When edge saving broke, we traced the bug back to its origin commit (#590)
before writing any code. This confirmed the fix was targeted rather than
a band-aid.

---

## RULES ADDED TO FABRICATION-RULES.md THIS SESSION

| Rule | What |
|------|------|
| 10.4 | Edge save path verification mandatory — DB check after every edge sprint |
| 10.5 | Atomic multi-edge saves — no forEach + savePieceImmediate |
| Appendix #16 | RECTANGLE save path = edgeTop/edgeBottom/edgeLeft/edgeRight |

---

## WHAT TO DO DIFFERENTLY NEXT SESSION

1. **Merge #617 and verify immediately** — don't start new work until
   edge clicks are confirmed instant and race-free in production.

2. **Fix compact preset bar profile selector** — this is blocking Beau
   and Mick from using the system efficiently. It's the most visible UX gap.

3. **Fix thumbnail/expanded state sync** — now that `localEdges` exists,
   the compact card thumbnail needs to read from it too.

4. **Do NOT start new features until edge system is fully verified** —
   the edge system has been "fixed" three times this session. It needs
   a complete end-to-end test: every shape type, every edge, rapid clicking,
   DB verification for each. Only then is it stable.

5. **Regression anchors** — Jay and Beau must create verified test quotes.
   This is the #1 unblocking action for the calculator series. It has been
   deferred for too long.

6. **Rate40mm values from Jay** — still using `rate40mm = rate20mm × 2`
   placeholder. Get exact values.
