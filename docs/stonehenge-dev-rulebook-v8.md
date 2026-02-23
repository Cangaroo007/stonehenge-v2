> **⚠️ SUPERSEDED — Use `docs/stonehenge-dev-rulebook-v11.md` instead. This file is kept for historical reference only.**

# Stone Henge — Mandatory Development Rulebook v8

**Updated:** February 17, 2026
**Status:** ACTIVE — include in every Claude Code and Cursor session
**Rules:** 43 total (all NON-NEGOTIABLE)
**Supersedes:** All previous dev-rules files (v1–v7 and all additions)

---

## HOW TO USE THIS DOCUMENT

This is the **SINGLE source of truth** for all development rules. Add it to project knowledge and reference it in every prompt. Rules are grouped by category and numbered sequentially. Each rule includes the incident or rationale that created it so developers understand WHY it exists.

---

## GOLDEN RULES (Quick Reference)

For when you need the essentials at a glance:

1. Extend, never replace
2. Read before writing
3. One route, one tree
4. Build must pass
5. Australian spelling
6. Small prompts
7. Test the live URL
8. Empty quote = $0
9. Every button works
10. Pricing Bible is law
11. Business logic outside UI
12. Verify with real data
13. Git archaeology first
14. Re-trigger after calculator fixes
15. Trace the code path before fixing
16. Grep-verify deletions
17. Build passing ≠ feature working
18. Null-guard all nullable state
19. Minimum clicks to common actions
20. Actions in multiple contexts
21. Progressive disclosure, never hiding
22. Context over navigation
23. Batch where repetition exists
24. Visual feedback within 100ms
25. Audit results override planned prompts

---

## ARCHITECTURE RULES

### RULE 1: ONE ROUTE, ONE COMPONENT TREE

There is exactly ONE component tree for quotes. All routes render through `QuoteLayout`.

| Route | Renders | Mode |
|---|---|---|
| `/quotes/new` | `NewQuoteWizard` (3 paths: Drawing / Template / Manual) | — |
| `/quotes/[id]` | `QuoteDetailClient` → `QuoteLayout` | View |
| `/quotes/[id]?mode=edit` | `QuoteDetailClient` → `QuoteLayout` | Edit |
| `/quotes/[id]/builder` | Redirect → `/quotes/[id]?mode=edit` | — |

**`QuoteForm.tsx` is RETIRED.** It must not be imported by any route.

> **Incident (Feb 14):** Series 12.1 and 12.2 were coded correctly but invisible in production because all live routes still rendered through the old `QuoteForm.tsx` monolith.

### RULE 2: VERIFY THE LIVE ROUTE BEFORE EDITING

Before modifying ANY quote UI component:

```bash
grep -r "QuoteForm\|QuoteLayout" src/app/ --include="*.tsx" -l
```

- If the route imports `QuoteForm` → **STOP**. Rewire to `QuoteLayout` first.
- If the route imports `QuoteLayout` → proceed.

### RULE 3: TEST ON THE LIVE URL AFTER EVERY DEPLOY

After every deployment, verify changes are visible at the ACTUAL production URLs:

1. `/quotes/new` — create a quote
2. `/quotes/[id]` — view a quote
3. `/quotes/[id]?mode=edit` — edit a quote

### RULE 4: NO PARALLEL COMPONENT TREES

There must NEVER be two component trees that render the same type of page. If a new component replaces an old one, all four steps happen in ONE prompt:

1. Build new component
2. Rewire route to new component
3. Remove/rename old component import
4. Verify live URL shows new component

### RULE 5: AUDIT BEFORE EVERY SERIES

At the start of every new series:

```bash
grep -rn "import.*Quote" src/app/\(dashboard\)/quotes/ --include="*.tsx" | head -30
grep -r "QuoteForm" src/app/ --include="*.tsx" -l
grep -r "QuoteLayout" src/app/ --include="*.tsx" -l
```

If `QuoteForm` appears in any active route → fix before proceeding.

---

## EXTEND, NEVER REPLACE (Rules 6–8)

These three rules exist because replacing code instead of extending it has caused the three worst incidents in this project's history.

### RULE 6: ALWAYS EXTEND EXISTING HANDLERS — NEVER REPLACE THEM

When modifying an existing function, handler, or component:

1. **READ** the entire existing handler/function first — understand ALL the cases it handles
2. **LIST** every caller — `grep -rn 'functionName\|/api/endpoint' src/ --include='*.ts' --include='*.tsx'`
3. **ADD** your new code alongside the existing code — never remove or restructure
4. **TEST** that all existing callers still work — not just your new feature
5. If you're unsure whether existing code is still needed → **IT IS. Leave it alone.**

| Date | What Happened | Root Cause | Impact |
|---|---|---|---|
| Feb 15, 2026 | Quote save returns 400, all calculations disappear | PATCH handler replaced with metadata-only handler | Full quote save broken |
| Feb 14, 2026 | Route consolidation made 10+ hours of work invisible | Routes replaced instead of incrementally rewired | Appeared as if Series 12 work was lost |
| Feb 10, 2026 | 401 errors on new API routes in production | Auth pattern rewritten instead of copied | API endpoints broken in production only |

### RULE 7: NEW FEATURES ADD CODE — THEY DON'T RESTRUCTURE CODE

When a prompt says "add feature X to file Y":

- **ADD** new functions, conditions, props, or sections
- **DO NOT** reorganise, rename, restructure, or "clean up" existing code in the same change
- Refactoring and new features are SEPARATE prompts, never combined

### RULE 8: API ROUTES MUST HANDLE ALL EXISTING REQUEST SHAPES

Before modifying an API route:

```bash
grep -rn '/api/quotes/\[id\]\|/api/quotes/${' src/ --include='*.ts' --include='*.tsx' | head -20
```

The modified route MUST still accept every request shape that existing callers send.

---

## CODE QUALITY RULES

### RULE 9: RAILWAY PATTERNS (ALWAYS)

These cause silent build failures if violated:

```typescript
// ✅ Set from Array
const items = Array.from(new Set(array));
// ❌ NEVER:
const items = [...new Set(array)];

// ✅ Prisma JSON double cast
const data = someJsonField as unknown as MyType;
// ❌ NEVER:
const data = someJsonField as MyType;

// ✅ Next.js 14 params
const { id } = await params;
// ❌ NEVER:
const id = params.id;
```

### RULE 10: AUSTRALIAN SPELLING (ALL UI TEXT)

| ✅ Correct | ❌ Incorrect |
|---|---|
| metre | meter |
| lineal metre | linear meter |
| colour | color |
| organisation | organization |
| optimiser | optimizer |
| authorised | authorized |
| visualisation | visualization |

### RULE 11: PRE-COMMIT VERIFICATION

Run these one at a time before every commit:

```bash
npm run build        # Must pass with 0 errors
npx tsc --noEmit     # Must pass with 0 errors
```

Both must pass. No exceptions.

### RULE 12: SMALL INCREMENTAL PROMPTS

Each prompt must be independently deployable. Never combine schema migrations + UI changes + calculator logic in one prompt. If a prompt fails, only that prompt's work is lost.

---

## UX RULES

### RULE 13: SIDEBAR COLLAPSED BY DEFAULT

Right sidebar starts collapsed with zero width. Centre body is the primary workspace. The sidebar is never required for core functionality.

### RULE 14: EMPTY QUOTE = $0.00

A new quote with zero pieces must show $0.00 for ALL costs. No phantom charges, no minimum fees, no defaults.

### RULE 15: EVERY BUTTON MUST WORK

Every visible button must have a working handler. If a feature isn't implemented yet, the button should either be hidden or show a "Coming soon" state — never silently do nothing on click.

### RULE 16: SCREENSHOT-VERIFY BEFORE CLAIMING DONE

Compare the result against the user's last feedback screenshot. If the same problem is visible, the fix is NOT complete.

---

## PROCESS RULES

### RULE 17: CONFIRM COMPONENT RENDERS BEFORE CLAIMING COMPLETION

When a prompt claims a UI change is complete, the summary MUST include:

1. Which file was modified (exact path)
2. Which route renders that file (exact URL path)
3. Verification that the route uses `QuoteLayout` (grep output)

### RULE 18: VALIDATE DIRECTION EVERY 2–3 PROMPTS

After completing a batch of prompts, ask:

- "Here's what we built. Here's what's next. Does this match your vision?"
- "Any feedback before we continue?"

Do not execute more than 3 prompts in a row without user confirmation.

### RULE 19: GIT WORKFLOW — BRANCHES AND PRs

Never push directly to main. Always use feature branches:

```bash
git checkout -b feat/your-feature-name
npm run build && npx tsc --noEmit
git add -A
git commit -m "feat: descriptive message"
git push origin feat/your-feature-name
gh pr create --base main --head feat/your-feature-name \
  --title "feat: your title" --body "description"
gh pr merge --squash
```

Avoid em-dashes (—) and special characters in PR titles — they break zsh.

### RULE 20: VERIFY CLAUDE CODE BRANCH NAMES

Claude Code uses auto-generated branch names. After each session:

1. Ask Claude Code: "What branch did you push to?"
2. On local machine: `git fetch origin` then `git branch -a | grep <keyword>`
3. Use the actual branch name in PR commands

---

## PRICING RULES

### RULE 21: PRICING BIBLE v1.3 IS THE SOURCE OF TRUTH

All calculation logic must match the Pricing Bible specification:

- Cutting uses full perimeter (all 4 sides)
- Polishing applies ONLY to finished edges
- Edge profiles are ADDITIONAL cost on top of base polishing
- 40mm = 20mm slab + lamination edge strips
- Mitred edges → Pencil Round profile ONLY
- All rates are tenant-configurable via Pricing Admin
- Service units (Lm vs m²) are selectable per tenant
- Cutout rates and edge surcharges are fabrication-category-aware

### RULE 22: NO HARDCODED PRICES

Every price, rate, surcharge, and minimum must come from the database (tenant-configurable via Pricing Admin). Never hardcode dollar amounts.

---

## DEFENSIVE DEBUGGING RULES (Added v3 — Feb 15)

These rules were created after a 3-day invisible pricing incident caused by business logic inside a conditionally-rendered sidebar.

### RULE 23: NEVER PUT BUSINESS LOGIC INSIDE CONDITIONALLY-RENDERED UI

Calculation triggers, data fetching, and business logic must NEVER live inside UI panels that can be hidden (sidebars, accordions, modals, tabs).

| ❌ BAD | ✅ GOOD |
|---|---|
| Calculator call inside `{sidebarOpen && <PricingSummary />}` | Calculator call in `useEffect` at the page level |
| Data fetch inside a collapsed accordion | Data fetch at the parent component level |
| Save trigger inside a tab that might not be rendered | Save trigger in the main component body |

**The Test:** If hiding/collapsing/switching any UI panel causes business data to disappear, the architecture is wrong.

> **Incident (Feb 15):** PR #77 collapsed sidebar by default → `PricingSummary` never mounted → all pricing invisible → 3 days of debugging.

### RULE 24: VERIFY WITH REAL DATA, NOT GREP

Checking that code "exists in a file" is NOT verification. Verification means:

1. The component actually renders — visible in the browser
2. Real dollar amounts appear — not $0.00, not "-", not empty
3. The database has data — query the actual tables
4. The API returns data — check network tab

> **Incident (Feb 15):** Three fix attempts verified by grepping file contents while pricing showed $0 in the browser.

### RULE 25: GIT ARCHAEOLOGY BEFORE GUESSING

When something stops working:

1. Find the last commit where it worked — `git log` on the affected files
2. Diff from working to broken — `git diff GOOD_HASH HEAD -- file`
3. Read the diff, not the file — the diff tells you what changed

> **Incident (Feb 15):** Pricing breakage was instantly diagnosable by diffing PR #77. Instead, 3 prompts were spent reading files.

### RULE 26: EXECUTION ORDER FOR BUG SESSIONS

When a session starts with bugs to fix:

```
1. Screenshot the current state (what's broken)
2. Git archaeology — find last working commit
3. Diff working → broken on all affected files
4. Query the database for actual data state
5. Check the API response in network tab
6. ONLY THEN write a fix
7. After fix, re-check the screenshot — is the problem gone?
```

### RULE 27: COUPLED COMPONENTS MUST BE DOCUMENTED

If Component A depends on Component B being rendered for data/calculation/state:

```typescript
/**
 * @depends QuoteCostSummaryBar — reads calculation state from this component
 * @mounted-by QuoteDetailClient — parent must always render this
 * @note Business logic in useEffect, NOT in render. See Rule 23.
 */
```

---

## PHANTOM FIX PREVENTION (Added v4 — Feb 15 Session 2)

These rules were created after a fix that deployed successfully but changed nothing in the browser.

### RULE 28: CALCULATOR FIXES MUST BE VERIFIED BY RE-TRIGGERING CALCULATION

When you fix the pricing calculator:

1. The fix changes code, but stored calculations in the database still have OLD values
2. You MUST re-trigger calculation (save the quote, or call the calculate endpoint)
3. You MUST verify the NEW numbers appear in the browser
4. If old numbers still appear → you fixed the wrong code path

**Checklist for any calculator fix:**

- [ ] Fix applied to code
- [ ] Build passes
- [ ] Deployed
- [ ] Quote re-saved or recalculation triggered
- [ ] Browser shows DIFFERENT numbers than before
- [ ] Numbers are CORRECT (not just different)

> **Incident (Feb 15 S2):** Edge dimension fix deployed but polishing still showed wrong Lm values. The fix changed a code path that doesn't execute at runtime.

### RULE 29: FIND THE ACTUAL CODE PATH BEFORE FIXING

When a calculation is wrong, there may be MULTIPLE functions that could be responsible:

```bash
# 1. Find the endpoint that triggers calculation
find src/app/api/quotes -path "*calculate*" -name "*.ts"

# 2. Trace what it imports and calls
grep -n 'import.*calc' src/app/api/quotes/[id]/calculate/route.ts

# 3. Add a console.log to the function you THINK runs
# 4. Trigger the calculation
# 5. Check if your log appears in Railway logs
# 6. If it doesn't → you're looking at the wrong function
```

Never fix a function without first confirming it actually executes for the scenario you're debugging.

---

## VERIFICATION & ANTI-REGRESSION (Added v5 — Feb 16 Session 3)

These rules were created after the "Add New Piece" form failed to update across THREE consecutive prompts (12.P9, 12.P9b, 12.P9c). Build passed every time. The old form was never deleted.

### RULE 30: GREP-VERIFY DELETIONS

When a prompt says "delete" or "remove" old code, you MUST grep after deletion to confirm ZERO matches.

```bash
# After deleting old code:
grep -rn "Edge Polish Selection" src/ --include="*.tsx" | wc -l
# MUST output: 0
# If ANY results: the deletion was incomplete. Fix before continuing.
```

The grep verification is NOT optional. If it outputs anything other than 0, the task is NOT DONE.

### RULE 31: NEGATIVE ASSERTIONS IN VERIFICATION

Every verification checklist must include NEGATIVE checks (things that must NOT exist), not just positive checks.

```
✅ Verification:
- [ ] New visual editor renders with SVG
- [ ] npm run build passes

❌ Must NOT exist after this PR:
- [ ] grep "Edge Polish Selection" returns 0 results
- [ ] grep "checkbox.*edge" returns 0 results in quotes components
```

### RULE 32: "SHOW ME THE COMPONENT" BEFORE CLAIMING DONE

Before marking a UI task as complete, output the actual rendered JSX tree of the changed component. Not just "it builds."

```bash
grep -A 3 "return" src/components/quotes/PieceRow.tsx | head -30
```

If the component still contains old patterns in its JSX return, the task is not done — regardless of whether it builds.

### RULE 33: ONE COMPONENT, ONE EDITING INTERFACE

A piece must have exactly ONE editing interface. If you find two sets of dimension inputs, two edge selectors, or two material dropdowns for the same piece, one is a regression and must be removed.

```bash
# Count edge selection patterns — must be 1, not 2+
grep -c "Edge Polish Selection\|EdgeProfilePopover\|edge.*checkbox" src/components/quotes/PieceRow.tsx
```

### RULE 34: BUILD PASSING IS NECESSARY BUT NOT SUFFICIENT

`npm run build` passing means TypeScript compiles. It does NOT mean:

- The old UI was removed
- The new UI actually renders
- The feature works as specified
- Data flows correctly

After every UI change, verify with BOTH:

1. `npm run build` — TypeScript compiles ✅
2. Manual grep checks for old patterns — confirmed removed ✅

### RULE 35: REPLACEMENT PRs MUST DIFF-VERIFY

When replacing one component/pattern with another, the PR diff MUST show deletions of the old pattern. If the diff only shows additions, the replacement didn't happen — it was an addition.

```bash
gh pr diff | grep "^-.*Edge Polish Selection" # MUST show at least one deletion line
```

---

## TYPESCRIPT SAFETY (Added v6 — Feb 17)

### RULE 36: NULL-GUARD ALL NULLABLE STATE BEFORE USE

When a `useState<T | null>(null)` variable is used in a function, add an early return (`if (!value) return`) before accessing any properties. TypeScript strict mode on Railway rejects `value.id` when `value` can be null — even if the UI logic guarantees it's set by the time the function runs.

```typescript
// ❌ BAD — Railway build fails: 'selectedTemplate' is possibly 'null'
const handleApply = async () => {
  const res = await fetch(`/api/templates/${selectedTemplate.id}/apply`);
};

// ✅ GOOD — Early return guard
const handleApply = async () => {
  if (!selectedTemplate) return;
  const res = await fetch(`/api/templates/${selectedTemplate.id}/apply`);
};
```

This applies to ALL nullable patterns, not just `useState`:

```typescript
// ✅ Guard before property access
if (!selectedMaterial) return;
if (!activeQuote) return;
if (!currentPiece) return;
```

**The rule of thumb:** If TypeScript's type includes `| null` or `| undefined`, add a guard BEFORE the first property access. Don't rely on UI logic (disabled buttons, conditional rendering) to prevent null access — the compiler doesn't know about your UI.

> **Incident (Feb 17):** 12.P19c `FromTemplateSheet.tsx` failed Railway build at line 123 — `selectedTemplate` typed as `Template | null` but used without null check.

---

## UX INTERACTION RULES (Added v8 — Feb 17)

These rules codify the UX principles for the quote builder professional interface, informed by fabricator workflow requirements.

### RULE 37: MINIMUM CLICKS TO COMMON ACTIONS

The most frequent user actions must be reachable in ≤2 clicks from ANY view of a piece:

| Action | Max Clicks | How |
|---|---|---|
| Edit edge profile | 1 | Click edge in SVG → popover |
| Change material | 2 | Click piece → material dropdown |
| Add cutout | 2 | Click piece → "+ Cutout" button |
| Change thickness | 2 | Click piece → thickness selector |
| Delete piece | 2 | Right-click → Delete (or keyboard shortcut) |
| Duplicate piece | 2 | Right-click → Duplicate (or keyboard shortcut) |

If a user has to navigate away from their current context to perform a common action, the UX is wrong.

> **Rationale:** Fabricators work on 20–50 piece quotes. If every edge change takes 4 clicks, a 6-piece kitchen with 24 edges takes 96 clicks just for edges. At 1 click per edge, it's 24.

### RULE 38: ACTIONS AVAILABLE IN MULTIPLE CONTEXTS

Core editing actions (edge paint, material swap, thickness change, cutout management) must appear as accordion options wherever a piece is visible:

| Context | What's Available |
|---|---|
| Room spatial view (piece click) | Edge paint, material, thickness, cutouts, relationships |
| Piece detail expansion | Full inline editor with all fields |
| Sidebar editor | Full editor (same as expansion) |
| Right-click context menu | Quick actions: edit, duplicate, delete, move room |
| Keyboard shortcut | E=edit, D=duplicate, Del=delete, Esc=deselect |

Users choose their own workflow. We don't force one path.

> **Rationale:** Different fabricators have different workflows. Jay prefers visual/click-based editing. Power users prefer keyboard shortcuts. Both are valid.

### RULE 39: PROGRESSIVE DISCLOSURE, NEVER PROGRESSIVE HIDING

Show summaries at the top level. Expand for detail. But never hide actions behind multiple levels.

| ✅ GOOD | ❌ BAD |
|---|---|
| Collapsed piece shows summary + "Edit" button visible | Collapsed piece hides all actions until expanded |
| Room header shows piece count + total cost + "Add Piece" | Room header shows only name, must expand to add |
| Edge profiles visible as coloured lines, click to change | Edges only visible after opening a separate panel |

**The Test:** With all accordions collapsed, can the user still see the key info AND take the most common action? If not, the UX needs work.

> **Rationale:** The sidebar pricing incident (Rule 23) taught us that conditional rendering hides data. This rule extends the same principle to actions.

### RULE 40: CONTEXTUAL ACTIONS OVER NAVIGATION

Prefer inline popovers, dropdowns, and accordion expansions over page navigation or modals.

| ✅ GOOD | ❌ BAD |
|---|---|
| Click edge → popover with profile options | Click edge → navigate to edge editor page |
| Right-click piece → context menu | Select piece → click "Edit" in toolbar → modal opens |
| Expand accordion → inline form fields | Click "Edit" → redirects to `/pieces/[id]/edit` |

The user should never lose their scroll position or context to perform an edit.

> **Rationale:** Stone fabrication quotes have 20–50 pieces across multiple rooms. Losing context means re-finding your place, which wastes time and increases errors.

### RULE 41: BATCH OPERATIONS WHERE REPETITION EXISTS

If a user might need to do the same action to 3+ pieces, provide a batch/multi-select path:

| Scenario | Batch Operation |
|---|---|
| Change all edges in a room to Pencil Round | Edge paint mode (12.P17c pattern) |
| Change all pieces to same material | Bulk material swap (12.P12b) |
| Set all kitchen pieces to 40mm | Multi-select → batch thickness change |
| Delete multiple pieces | Multi-select → batch delete |

The paint mode pattern from 12.P17c is the model: select the action first, then "paint" it onto targets.

> **Rationale:** A 40-unit development quote might have 200+ pieces. Individual editing doesn't scale.

### RULE 42: VISUAL FEEDBACK WITHIN 100ms

Every click must produce visible feedback immediately:

| Action | Feedback |
|---|---|
| Click piece | Highlight border + selection indicator |
| Change edge | SVG colour updates instantly (optimistic) |
| Save piece | Brief success toast + data persists |
| Delete piece | Piece fades out + removal |
| Keyboard shortcut | Affected element highlights |

Never leave the user wondering "did that work?" If an API call is in-flight, show a subtle loading indicator, but the UI should already reflect the expected state.

> **Rationale:** Perceived performance matters as much as actual performance. A 200ms optimistic update feels instant; a 2-second round-trip feels broken.

---

## AUDIT INTEGRITY (Added v8 — Feb 17)

### RULE 43: AUDIT RESULTS OVERRIDE PLANNED PROMPTS

When a discovery audit (Rule 5) reveals that planned infrastructure already exists, the implementation prompt MUST be updated to extend rather than create. Never execute a prompt that creates something the audit proved already exists.

**Checklist before executing any implementation prompt:**

| Question | Action if Yes |
|---|---|
| Does the audit say this table/model already exists? | Change prompt from CREATE → EXTEND/EVOLVE |
| Does the audit say this component already exists? | Change prompt from CREATE → MODIFY |
| Does the audit show different field names than planned? | Update prompt to use actual field names |
| Does the audit reveal existing data that needs migration? | Add migration step to prompt |

> **Incident (Feb 17):** Series 13 overview planned to CREATE `PieceRelationship` model. The 13.0 audit found it already exists at line 1233 with different field names (`source_piece_id` vs planned `parentPieceId`). Running the original prompt would have either failed (duplicate table) or created parallel infrastructure.

---

## INCIDENT LOG

| Date | Incident | Rules Created | Root Cause |
|---|---|---|---|
| Feb 10 | 401 errors on new API routes in production | 6 | Auth pattern rewritten instead of copied |
| Feb 14 | Route consolidation made 10+ hours invisible | 1–5 | Routes replaced instead of rewired |
| Feb 14 | Sidebar expanded by default, looked like old builder | 13–16 | `useState(initialMode === 'edit')` |
| Feb 15 | Quote save returns 400, all pricing invisible | 6–8 | PATCH handler replaced with metadata-only |
| Feb 15 | Pricing invisible for 3+ days | 23, 27 | `PricingSummary` inside conditional sidebar render |
| Feb 15 | Three fix attempts verified by grep, $0 in browser | 24 | Code existed in file but didn't execute |
| Feb 15 S2 | Edge dimension fix deployed, nothing changed | 28–29 | Fixed code path that doesn't run at runtime |
| Feb 16 S3 | Old form survived THREE deletion attempts | 30–35 | Build passed, old form never actually deleted |
| Feb 17 | `FromTemplateSheet` build failure on Railway | 36 | Nullable state accessed without null guard |
| Feb 17 | 13.1 prompt tried to CREATE existing table | 43 | Audit findings not applied to implementation prompt |

---

## HISTORY

| Version | Date | Rules | What Changed |
|---|---|---|---|
| v1 | Feb 14, 2026 | 1–16 | Architecture, code quality, UX, process rules |
| v2 | Feb 15, 2026 | 17–22 | Extended process rules, pricing rules, git workflow |
| v3 | Feb 15, 2026 | 23–27 | Defensive debugging after sidebar pricing incident |
| v4 | Feb 15, 2026 S2 | 28–29 | Phantom fix prevention after edge calc non-fix |
| v5 | Feb 16, 2026 S3 | 30–35 | Verification & anti-regression after 3 failed form deletions |
| v6 | Feb 17, 2026 | 36 | TypeScript nullable state guard after Railway build failure |
| v7 | Feb 17, 2026 | 37–42 | UX interaction rules for professional builder interface |
| v8 | Feb 17, 2026 | 43 | Audit integrity — audit results override planned prompts |

---

**This document is the SINGLE source of truth. All previous dev-rules files are superseded.**
