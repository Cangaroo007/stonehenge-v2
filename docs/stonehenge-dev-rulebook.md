# Stone Henge — Mandatory Development Rulebook v15

> **Updated:** March 2, 2026
> **Status:** ACTIVE — read before writing any code
> **Rules:** 63 total (all NON-NEGOTIABLE)
> **Supersedes:** All previous dev-rules files (v1–v14 and all addenda)
> **Stable path:** `docs/stonehenge-dev-rulebook.md`
> **Location note:** This file lives at `docs/stonehenge-dev-rulebook.md` with no version
> suffix. Always reference it by that path. The version number lives inside the document only.

---

## HOW TO USE THIS DOCUMENT

**This is the complete, single source of truth for all development rules.**
All previous rulebook versions and addenda are superseded. Do not reference any older file.

**At the start of every Claude Code or Cursor session, run:**
```bash
cd ~/Downloads/stonehenge-v2 && cat docs/stonehenge-dev-rulebook.md
```

**The prompt preamble always references this path — never a versioned filename.**
When the rulebook is updated to v16, v17, etc., the file at `docs/stonehenge-dev-rulebook.md`
is updated in place. The path never changes. Prompts never need updating when the rulebook version increments.

**⚠️ LIVE PLATFORM NOTE:** Stone Henge is used by real users at Northcoast Stone. Rule
violations cause real business harm. Every rule should be treated as if a live quote is at risk.

---

## GOLDEN RULES (Quick Reference)

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
26. Schema changes MUST include migrations
27. Prisma client NEVER in browser bundle
28. Both docs updated on every merge (AUDIT_TRACKER + SYSTEM_STATE)
29. Pre-prompt micro-audit before touching any service
30. API handler fields verified before frontend calls
31. Test placeholders are ⚠️-flagged and replaced before commit
32. DB-dependent tests skip gracefully without DATABASE_URL
33. Stop Gates are absolute
34. .env is never committed to git
35. Real data before any conclusion — batch all DB queries upfront

---

## ARCHITECTURE RULES

### RULE 1: ONE ROUTE, ONE COMPONENT TREE

There is exactly ONE component tree for quotes. All routes render through `QuoteLayout`.

| Route | Renders | Mode |
|-------|---------|------|
| `/quotes/new` | `NewQuoteWizard` (3 paths: Drawing / Template / Manual) | — |
| `/quotes/[id]` | `QuoteDetailClient` → `QuoteLayout` | View |
| `/quotes/[id]?mode=edit` | `QuoteDetailClient` → `QuoteLayout` | Edit |
| `/quotes/[id]/builder` | **Redirect** → `/quotes/[id]?mode=edit` | — |

**`QuoteForm.tsx` is RETIRED.** It must not be imported by any route.

> **Incident (Feb 14):** Series 12.1 and 12.2 were coded correctly but invisible in production because all live routes still rendered through the old `QuoteForm.tsx` monolith.

### RULE 2: VERIFY THE LIVE ROUTE BEFORE EDITING

Before modifying ANY quote UI component:

```bash
grep -r "QuoteForm\|QuoteLayout" src/app/ --include="*.tsx" -l
```

- If the route imports `QuoteForm` → **STOP.** Rewire to `QuoteLayout` first.
- If the route imports `QuoteLayout` → proceed.

### RULE 3: TEST ON THE LIVE URL AFTER EVERY DEPLOY

After every deployment, verify changes are visible at the ACTUAL production URLs:

1. `/quotes/new` — create a quote
2. `/quotes/[id]` — view a quote
3. `/quotes/[id]?mode=edit` — edit a quote

### RULE 4: NO PARALLEL COMPONENT TREES

There must NEVER be two component trees that render the same type of page. If a new component replaces an old one, **all four steps happen in ONE prompt:**

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

> These three rules exist because replacing code instead of extending it has caused the three worst incidents in this project's history.

### RULE 6: ALWAYS EXTEND EXISTING HANDLERS — NEVER REPLACE THEM

When modifying an existing function, handler, or component:

1. **READ the entire existing handler/function first** — understand ALL the cases it handles
2. **LIST every caller** — `grep -rn 'functionName\|/api/endpoint' src/ --include='*.ts' --include='*.tsx'`
3. **ADD your new code alongside the existing code** — never remove or restructure
4. **TEST that all existing callers still work** — not just your new feature
5. **If you're unsure whether existing code is still needed → IT IS. Leave it alone.**

| Date | What Happened | Root Cause | Impact |
|------|---------------|------------|--------|
| Feb 15, 2026 | Quote save returns 400, all calculations disappear | PATCH handler **replaced** with metadata-only handler | Full quote save broken |
| Feb 14, 2026 | Route consolidation made 10+ hours of work invisible | Routes **replaced** instead of incrementally rewired | Appeared as if Series 12 work was lost |
| Feb 10, 2026 | 401 errors on new API routes in production | Auth pattern **rewritten** instead of copied | API endpoints broken in production only |

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
// ❌ NEVER: const items = [...new Set(array)];

// ✅ Prisma JSON double cast
const data = someJsonField as unknown as MyType;
// ❌ NEVER: const data = someJsonField as MyType;

// ✅ Next.js 14 params
const { id } = await params;
// ❌ NEVER: const id = params.id;
```

### RULE 10: AUSTRALIAN SPELLING (ALL UI TEXT)

| ✅ Correct | ❌ Incorrect |
|-----------|-------------|
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
3. Verification that the route uses QuoteLayout (grep output)

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

- Cutting uses full perimeter (all 4 sides) — for L/U shapes: sum of decomposed leg perimeters
- Polishing applies ONLY to finished (exposed) edges — NEVER to join faces on L/U shapes
- Edge profiles are ADDITIONAL cost on top of base polishing
- 40mm = 20mm slab + lamination edge strips (mandatory, not optional)
- Mitred edges have no traditional edge profile — the 45° mitre joint IS the finished edge. The only option is the top corner tip treatment: Raw (default), Square Top, or Round Top
- All rates are tenant-configurable via Pricing Admin
- Service units (Lm vs m²) are selectable per tenant
- Cutout rates and edge surcharges are fabrication-category-aware

### RULE 22: NO HARDCODED PRICES

Every price, rate, surcharge, and minimum must come from the database (tenant-configurable via Pricing Admin). Never hardcode dollar amounts.

---

## DEFENSIVE DEBUGGING RULES

### RULE 23: NEVER PUT BUSINESS LOGIC INSIDE CONDITIONALLY-RENDERED UI

Calculation triggers, data fetching, and business logic must NEVER live inside UI panels that can be hidden (sidebars, accordions, modals, tabs).

| ❌ BAD | ✅ GOOD |
|--------|---------| 
| Calculator call inside `{sidebarOpen && <PricingSummary />}` | Calculator call in `useEffect` at the page level |
| Data fetch inside a collapsed accordion | Data fetch at the parent component level |

**The Test:** If hiding/collapsing/switching any UI panel causes business data to disappear, the architecture is wrong.

> **Incident (Feb 15):** PR #77 collapsed sidebar by default → PricingSummary never mounted → all pricing invisible → 3 days of debugging.

### RULE 24: VERIFY WITH REAL DATA, NOT GREP

Checking that code "exists in a file" is NOT verification. Verification means:

1. **The component actually renders** — visible in the browser
2. **Real dollar amounts appear** — not $0.00, not "-", not empty
3. **The database has data** — query the actual tables
4. **The API returns data** — check network tab

### RULE 25: GIT ARCHAEOLOGY BEFORE GUESSING

When something stops working:

1. **Find the last commit where it worked** — `git log` on the affected files
2. **Diff from working to broken** — `git diff GOOD_HASH HEAD -- file`
3. **Read the diff, not the file** — the diff tells you what changed

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

## PHANTOM FIX PREVENTION

### RULE 28: CALCULATOR FIXES MUST BE VERIFIED BY RE-TRIGGERING CALCULATION

When you fix the pricing calculator:

1. The fix changes **code**, but stored calculations in the database still have **OLD values**
2. You MUST re-trigger calculation (save the quote, or call the calculate endpoint)
3. You MUST verify the **NEW numbers** appear in the browser
4. If old numbers still appear → **you fixed the wrong code path**

**Checklist for any calculator fix:**
- [ ] Fix applied to code
- [ ] Build passes
- [ ] Deployed
- [ ] Quote re-saved or recalculation triggered
- [ ] Browser shows DIFFERENT numbers than before
- [ ] Numbers are CORRECT (not just different)

### RULE 29: FIND THE ACTUAL CODE PATH BEFORE FIXING

When a calculation is wrong, there may be MULTIPLE functions that could be responsible. Before fixing anything:

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

**Never fix a function without first confirming it actually executes for the scenario you're debugging.**

---

## VERIFICATION & ANTI-REGRESSION

### RULE 30: GREP-VERIFY DELETIONS

When a prompt says "delete" or "remove" old code, you MUST grep after deletion to confirm ZERO matches:

```bash
grep -rn "OldComponentName" src/ --include="*.tsx" | wc -l
# MUST output: 0
```

### RULE 31: NEGATIVE ASSERTIONS IN VERIFICATION

Every verification checklist must include NEGATIVE checks (things that must NOT exist), not just positive checks:

```
✅ Must exist after this PR:
- [ ] New visual editor renders with SVG
❌ Must NOT exist after this PR:
- [ ] grep "Edge Polish Selection" returns 0 results
```

### RULE 32: "SHOW ME THE COMPONENT" BEFORE CLAIMING DONE

Before marking a UI task as complete, output the actual rendered JSX tree of the changed component:

```bash
grep -A 3 "return" src/components/quotes/PieceRow.tsx | head -30
```

If the component still contains old patterns in its JSX return, the task is not done.

### RULE 33: ONE COMPONENT, ONE EDITING INTERFACE

A piece must have exactly ONE editing interface. If you find two sets of dimension inputs, two edge selectors, or two material dropdowns for the same piece, one is a regression and must be removed.

### RULE 34: BUILD PASSING IS NECESSARY BUT NOT SUFFICIENT

`npm run build` passing means TypeScript compiles. It does NOT mean the feature works. After every UI change, verify with BOTH:
1. `npm run build` — TypeScript compiles ✅
2. Manual grep checks for old patterns — confirmed removed ✅

### RULE 35: REPLACEMENT PRs MUST DIFF-VERIFY

When replacing one component/pattern with another, the PR diff MUST show deletions of the old pattern:

```bash
gh pr diff | grep "^-.*OldPattern"
# MUST show at least one deletion line
```

---

## TYPESCRIPT SAFETY

### RULE 36: NULL-GUARD ALL NULLABLE STATE BEFORE USE

When a `useState<T | null>(null)` variable is used in a function, add an early return before accessing any properties:

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

If TypeScript's type includes `| null` or `| undefined`, add a guard BEFORE the first property access. Don't rely on UI logic (disabled buttons, conditional rendering) to prevent null access — the compiler doesn't know about your UI.

> **Incident (Feb 17):** `FromTemplateSheet.tsx` failed Railway build — `selectedTemplate` typed as `Template | null` but used without null check. Build passed locally with less strict settings, failed on Railway.

---

## UX INTERACTION RULES

### RULE 37: MINIMUM CLICKS TO COMMON ACTIONS

The most frequent user actions must be reachable in ≤2 clicks from ANY view of a piece:

| Action | Max Clicks |
|--------|-----------|
| Edit edge profile | 1 — click edge in SVG → popover |
| Change material | 2 — click piece → material dropdown |
| Add cutout | 2 — click piece → "+ Cutout" button |
| Change thickness | 2 — click piece → thickness selector |
| Delete piece | 2 — right-click → Delete |
| Duplicate piece | 2 — right-click → Duplicate |

### RULE 38: ACTIONS AVAILABLE IN MULTIPLE CONTEXTS

Core editing actions must appear wherever a piece is visible: room spatial view, piece detail expansion, sidebar editor, right-click context menu, and keyboard shortcuts.

### RULE 39: PROGRESSIVE DISCLOSURE, NEVER PROGRESSIVE HIDING

Show summaries at the top level. Expand for detail. But never hide *actions* behind multiple levels. With all accordions collapsed, the user must still be able to see key info AND take the most common action.

### RULE 40: CONTEXTUAL ACTIONS OVER NAVIGATION

Prefer inline popovers, dropdowns, and accordion expansions over page navigation or modals. The user should never lose their scroll position or context to perform an edit.

### RULE 41: BATCH OPERATIONS WHERE REPETITION EXISTS

If a user might need to do the same action to 3+ pieces, provide a batch/multi-select path. The paint mode pattern from 12.P17c is the model: select the action first, then "paint" it onto targets.

### RULE 42: VISUAL FEEDBACK WITHIN 100ms

Every click must produce visible feedback immediately. Never leave the user wondering "did that work?" If an API call is in-flight, show a subtle loading indicator, but the UI should already reflect the expected state optimistically.

---

## AUDIT INTEGRITY

### RULE 43: AUDIT RESULTS OVERRIDE PLANNED PROMPTS

When a discovery audit reveals that planned infrastructure already exists, the implementation prompt MUST be updated to extend rather than create. Never execute a prompt that creates something the audit proved already exists.

| Question | Action if Yes |
|----------|--------------| 
| Does the audit say this table/model already exists? | Change prompt from CREATE → EXTEND/EVOLVE |
| Does the audit say this component already exists? | Change prompt from CREATE → MODIFY |
| Does the audit show different field names than planned? | Update prompt to use actual field names |

---

## BANNED COMPONENTS

### RULE 44: BANNED COMPONENTS — PERMANENT DELETION LIST

The following patterns are PERMANENTLY BANNED. Their presence in ANY file is a build-blocking error:

| Banned Pattern | Grep to Detect | Replacement |
|---|---|---|
| `EdgePolishSelection` | `grep -rn 'EdgePolishSelection' src/` | PieceVisualEditor SVG click |
| `EdgeSelector` component | `grep -rn 'EdgeSelector\b' src/ --include='*.tsx'` | PieceVisualEditor SVG click |
| `EdgeDropdown` component | `grep -rn 'EdgeDropdown\b' src/ --include='*.tsx'` | PieceVisualEditor SVG click |
| `EdgeManager` component | `grep -rn 'EdgeManager\b' src/ --include='*.tsx'` | PieceVisualEditor SVG click |
| `EdgeConfigPanel` | `grep -rn 'EdgeConfigPanel' src/ --include='*.tsx'` | PieceVisualEditor SVG click |
| `edge.*checkbox` in quotes UI | `grep -rn 'checkbox.*edge\|edge.*checkbox' src/components/quotes/` | PieceVisualEditor SVG click |
| Per-side dropdown edge lists | `grep -rn 'top.*edge.*select\|bottom.*edge.*select' src/components/quotes/` | PieceVisualEditor SVG click |

**Enforcement (add to every PR verification):**
```bash
echo "=== RULE 44: BANNED COMPONENTS ==="
BANNED=0
grep -rn 'EdgePolishSelection\|Edge Polish Selection' src/ --include='*.tsx' --include='*.ts' && BANNED=1
grep -rn 'EdgeSelector\b\|EdgeDropdown\b\|EdgeManager\b\|EdgeConfigPanel\b' src/ --include='*.tsx' && BANNED=1
grep -rn 'checkbox.*edge\|edge.*checkbox' src/components/quotes/ --include='*.tsx' && BANNED=1
if [ $BANNED -eq 1 ]; then
  echo "❌ BANNED COMPONENTS FOUND — must be removed before merging"
  exit 1
else
  echo "✅ No banned components found"
fi
```

---

## REACT HOOKS SAFETY

### RULE 45: REACT HOOKS — ALL HOOKS BEFORE ALL RETURNS

Every React component must call ALL hooks at the top of the function body, BEFORE any conditional return statements:

```typescript
// ❌ BAD — Hook after conditional return = React error #310
function MyComponent({ data }: Props) {
  const [step, setStep] = useState(1);
  if (!data) return null;           // ← early return
  const [items, setItems] = useState([]); // ← CRASH: hook after return
}

// ✅ GOOD — ALL hooks first, then conditional returns
function MyComponent({ data }: Props) {
  const [step, setStep] = useState(1);
  const [items, setItems] = useState([]); // ← hook BEFORE any return
  if (!data) return null;                 // ← early return AFTER all hooks
  return <div>...</div>;
}
```

> **Incident (Feb 18):** ManualQuoteWizard Step 4 crashed with React error #310. Edge type loading hooks were inside the step 4 conditional block.

---

## SCHEMA & MIGRATION SAFETY

### RULE 46: SCHEMA-CODE PARITY GATE

**NEVER merge code that queries a new Prisma model unless the migration has been created and included in the same PR (or a previously merged and deployed PR).**

Before any PR that adds Prisma queries for a new model:
1. Verify the model exists in schema.prisma
2. Run `npx prisma migrate dev --name descriptive-name`
3. Verify a migration SQL file was created in `prisma/migrations/`
4. Include the migration file in the PR
5. After merge, check Railway logs — migration count must increase

> **Incident (Feb 18):** PR #124 added `PieceRelationship` to schema.prisma but never ran `prisma migrate dev`. The table never existed in production, crashing every quote page for ~4 hours.

### RULE 47: NEW TABLE DEPLOYMENT CHECKLIST

When adding a new database table, a single PR must contain ALL of:
- [ ] Model added to schema.prisma
- [ ] Migration SQL in `prisma/migrations/`
- [ ] API routes with try/catch error handling
- [ ] Components with optional chaining (`?? []`) for new relation data
- [ ] Services with try/catch around new table queries

### RULE 48: STUB-FIRST FOR UNRELEASED FEATURES

When building for a feature that depends on schema changes:
- API routes MUST return safe defaults (empty arrays, 501 status) if the query fails
- Components MUST use optional chaining for data that may not exist yet
- Add a comment: `// REQUIRES: Series X migration — stub until deployed`

### RULE 49: PRE-MERGE MIGRATION VERIFICATION

Before every PR that touches schema.prisma:

```bash
npx prisma migrate status
```

If it shows pending migrations or schema drift, those migration files MUST be in the PR.

**Enforcement:**
```bash
SCHEMA_CHANGED=$(git diff --name-only HEAD~1..HEAD | grep 'schema.prisma' | wc -l)
MIGRATION_ADDED=$(git diff --name-only HEAD~1..HEAD | grep 'prisma/migrations/' | wc -l)
if [ "$SCHEMA_CHANGED" -gt 0 ] && [ "$MIGRATION_ADDED" -eq 0 ]; then
  echo "❌ RULE 46: schema.prisma changed but no migration added"
  exit 1
fi
```

### RULE 50: PRISMA CLIENT NEVER IN BROWSER BUNDLE

**NEVER use `import { X } from '@prisma/client'` (value import) in any file marked `'use client'` or any file imported by a client component.** Use ONLY:

- `import type { X } from '@prisma/client'` (type-only, erased at compile time)
- String literals instead of Prisma enums in client code (e.g., `'ADMIN'` not `UserRole.ADMIN`)

**Enforcement:**
```bash
grep -rn "from '@prisma/client'" src/ --include='*.tsx' --include='*.ts' | grep -v 'import type' | grep -v '\.server\.' && {
  echo "❌ RULE 50: Value import of @prisma/client found — use 'import type' or string literals"
  exit 1
} || echo "✅ No Prisma value imports in client code"
```

---

## LIVING DOCUMENTATION (Rules 51–53)

> These rules were created after episodic audits fell out of sync with the codebase,
> causing Phase 3 prompts to miss open issues and create duplicate implementations.
> The Feb 2026 L-shape two-day debugging loss was directly caused by R-10 being
> marked "confirmed working" without production verification.

### RULE 51: LIVING AUDIT TRACKER — ALWAYS CURRENT (HARD GATE)

**`docs/AUDIT_TRACKER.md` is the single source of truth for all known issues.**

A pre-push hook is installed at `.git/hooks/pre-push` (via `npm run prepare`).
**It blocks all pushes on `fix/*` and `feat/*` branches if `docs/AUDIT_TRACKER.md`
was not modified in the commits being pushed.** This is not a warning — the push fails.

**What to add when updating:**

| Scenario | What to write |
|----------|--------------| 
| PR resolves an open issue | Move 🔴 → ✅, add PR number and date |
| PR discovers a new issue | Add 🔴 Open row with severity, file, date |
| PR is a chore with no audit relevance | Add: `R-XX \| No audit items — chore only \| PR# \| date \| n/a` |

**After merge, confirm the tracker appears in the squashed commit:**
```bash
git show --name-only HEAD | grep AUDIT_TRACKER
```
If it's missing, add a follow-up commit immediately.

**Re-installing the hook after a fresh clone:**
```bash
npm install   # triggers 'prepare' script → installs hooks automatically
# OR manually:
sh scripts/install-hooks.sh
```

> **Why hard enforcement:** Between Feb 3 and Feb 26, the audit tracker was not maintained.
> Issues were re-discovered, re-diagnosed, and re-fixed. The L-shape edge bug was a structural
> flaw that should have been tracked when K-series shipped. Forgetting must be impossible.

### RULE 52: LIVING SYSTEM STATE — ALWAYS CURRENT (HARD GATE)

**`docs/SYSTEM_STATE.md` is the living snapshot of what actually exists in the codebase.**
It records schema, routes, components, functions, shape system, and verified behaviour.
It is NOT an issue tracker — that is `AUDIT_TRACKER.md`.

The same pre-push hook that enforces Rule 51 also enforces Rule 52. **Pushes on `fix/*`
and `feat/*` branches are blocked if `docs/SYSTEM_STATE.md` was not updated.**

**Update the relevant section(s) of SYSTEM_STATE.md in every PR:**

| If you changed... | Update this section |
|-------------------|---------------------|
| prisma/schema.prisma | §1 Schema |
| src/app/api/*/route.ts | §2 API Routes |
| src/app/*/page.tsx | §3 Page Routes |
| src/lib/services/*.ts | §4 Core Service Functions |
| src/components/quotes/*.tsx | §5 Quote Builder Components |
| src/lib/types/shapes.ts | §6 Shape System |
| Verified something works on production | §10 Verified Behaviour |
| None of the above | Write: "No structural changes — [PR name]" |

**§10 Verified Behaviour is the most critical section.** It distinguishes "code exists"
from "confirmed working with real data on production." Only add ✅ entries to this
section after manual verification with a named quote and date.

> **Why it exists:** K-series marked L/U shape system as "confirmed end-to-end" (R-10)
> without production verification. Two days lost on L-shape debugging. §10 forces the
> distinction between shipping code and knowing it works.

### RULE 53: POST-MERGE VERIFICATION STANDARD

Every prompt's verification section must include three checks, not one:

1. **The specific thing fixed works on production** — named test scenario
2. **One adjacent thing that could have regressed still works** — named regression check
3. **Both docs updated** — AUDIT_TRACKER ✅ and SYSTEM_STATE ✅ in same commit

This replaces the pattern of "npm run build passes" as the only verification gate.

---

## PROMPT QUALITY RULES

### RULE 54: API HANDLER FIELD VERIFICATION BEFORE FRONTEND CALLS

Before writing any frontend code that calls an API handler (PATCH, PUT, POST), verify that the handler ACCEPTS the fields you're sending:

```bash
# Before writing frontend code that sends { grain_matched: false }:
grep -n "grain_matched\|grainMatched" \
  src/app/api/quotes/\[id\]/pieces/\[pieceId\]/route.ts | head -10
```

If the field is NOT in the handler — add it to the handler FIRST, then write the frontend call. A frontend call to an API that silently ignores the field is worse than no call at all.

### RULE 55: PLACEHOLDER FIELDS IN CODE MUST BE ⚠️-FLAGGED

Any code template in a prompt that uses placeholder field names MUST:

1. Use `ALL_CAPS` to distinguish them from real field names
2. Have an inline comment: `// ⚠️ REPLACE with exact field name — DO NOT COMMIT WITH PLACEHOLDER`
3. Be listed in the verification section with: "Confirm all ⚠️ REPLACE placeholders substituted"

```bash
# Add to every verification section when placeholders are used:
grep -rn "CONFIRMED_\|FIELD_NAME\|PLACEHOLDER\|TODO_REPLACE" \
  tests/ scripts/ src/ --include="*.ts" --include="*.tsx" 2>/dev/null && {
  echo "❌ PLACEHOLDER FIELD NAMES FOUND — replace before committing"
  exit 1
} || echo "✅ No placeholder field names found"
```

---

## TEST INFRASTRUCTURE RULES

### RULE 56: DB-DEPENDENT TESTS MUST SKIP GRACEFULLY WITHOUT DATABASE_URL

Any test that connects to the database MUST skip gracefully (not fail) when `DATABASE_URL` is not set:

```typescript
const SKIP_TESTS = !process.env.DATABASE_URL;

it('test name', async () => {
  if (SKIP_TESTS) {
    console.warn('⚠️ DATABASE_URL not set — skipping.');
    return;
  }
  // ... test body
});
```

A pre-push hook that fails on every developer machine with no local database will be bypassed with `--no-verify` within a week, permanently defeating its purpose.

### RULE 57: REGRESSION ANCHOR UPDATE PROTOCOL

When a legitimate business rule change requires updating pricing regression anchor values:

1. Update `EXPECTED_TOTAL_EX_GST` and `EXPECTED_TOTAL_INC_GST` in `tests/pricing-anchor.test.ts`
2. Update `PRICING_ANCHOR.md` with a row: Old total, new total, date, reason
3. Both files MUST be updated in the SAME PR
4. PR description must explicitly state: "Intentional anchor value update — [reason]"
5. Sean must approve this PR — it cannot be merged without explicit owner sign-off

---

## DATA FRESHNESS

### RULE 58: STALE STATE MUST BE VISIBLE

Every section of the UI that displays calculated data (parts list, slab count, pricing totals, lamination strips) MUST have a mechanism to indicate whether that data is current or potentially stale.

**Three implementation tiers:**

**Tier 1 — Freshness timestamp (always):** Every calculated result stored in the database records `calculated_at`. The UI shows this subtly:
```
Parts List  ·  Last calculated 2 mins ago  [Recalculate]
```

**Tier 2 — Stale warning:** If any input has `updated_at` newer than the calculation's `calculated_at`, show:
```
⚠️ This piece was edited after the last optimiser run.
   Parts list may not be current.  [Run Optimiser]
```

**Tier 3 — Pre-send gate:** Before locking, sending, or exporting a quote as PDF, verify all pieces have been calculated after their last edit. If any check fails, show a blocking modal.

**Roadmap (DF-1 through DF-5 in backlog):**
- DF-1: "Recalculate All" button on quote page (no schema change — do first)
- DF-2: Calculated-at timestamps on Parts List and Pricing Summary
- DF-3: Stale warning banner on piece card
- DF-4: Admin rate change propagation notice
- DF-5: Pre-send gate (blocks stale data reaching client — required before client-facing PDF)

> **Why it exists:** FIX-10b improved optimizer logic but didn't retroactively update stored
> results. Fabricators sending quotes with old numbers is a real business risk.

---

## L/U SHAPE RULES

### RULE 59: L/U SHAPE — TWO RULES GOVERN ALL CALCULATIONS

This rule exists because L/U shape logic is the most complex pricing domain in the system.
Every developer touching shaped piece code must internalise both rules before writing anything.

**RULE A — CUTTING: All faces of all decomposed legs**

An L-shape is two rectangles of stone joined at a corner. A fabricator cuts every edge of every rectangle — including the join faces (which are cut flat to create the bonding surface). The cutting perimeter is the SUM of the perimeters of all decomposed legs.

```
L-shape cutting = 2×(leg1.length + leg1.width) + 2×(leg2_net + leg2.width)
U-shape cutting = sum of perimeters of leftLeg + back + rightLeg rectangles
```

**RULE B — FINISHING: Only outer exposed faces**

Join faces are hidden inside the stone bond. They are NEVER polished, NEVER given an edge profile, NEVER appear in the finishable edge list. Only the outer visible perimeter of the shape is finishable.

```
L-shape: 6 finishable edges  (top, left, r_top, inner, r_btm, bottom)
U-shape: 8 finishable edges  (top_left, outer_left, bottom, outer_right,
                               top_right, inner_right, back_inner, inner_left)
```

Note: The `inner` edge on an L-shape IS finishable — it is the exposed step face visible from the room. It is not a join face. The join faces are the bonding surfaces between legs.

**Edge storage by shape type:**

| Shape | Storage | Keys |
|-------|---------|------|
| RECTANGLE | 4 DB columns: `edge_top/right/bottom/left` | top, right, bottom, left |
| L_SHAPE | `shape_config.edges` (JSON) | top, left, r_top, inner, r_btm, bottom |
| U_SHAPE | `shape_config.edges` (JSON) | top_left, outer_left, bottom, outer_right, top_right, inner_right, back_inner, inner_left |

**The join faces are not keys, not null entries, not disabled UI elements — they do not exist at all.**

> **Why it exists:** The L/U shape system was grafted onto the rectangle system without
> resolving the fundamental conflict. This created: wrong cutting perimeter, $0 polishing,
> $0 lamination, 2 of 6 edges permanently unclickable, and bounding box display instead of
> leg dimensions. Two days of debugging in February 2026 traced to this single unresolved conflict.

---

## STOP GATE PROTOCOL

### RULE 60: STOP GATES ARE ABSOLUTE — NO CONTINUATION WITHOUT EXPLICIT APPROVAL

**What a Stop Gate is:**

A Stop Gate is a mandatory checkpoint written into a prompt where Claude Code must
pause, show specific verification output, and wait for explicit human approval
before continuing. Stop Gates exist because:

- Some code changes cannot be undone once committed
- Incorrect wiring into call order can cascade across the entire optimizer
- Pricing calculator changes require human review before proceeding
- The human must inspect intermediate state before it is built upon

---

**The Stop Gate phrase:**

When a prompt instructs Claude Code to stop, it MUST write this exact phrase
and NOTHING ELSE after it:

> **"STOP GATE — WAITING FOR APPROVAL — do not proceed"**

This phrase is the complete output for that turn. It is not a transition into
further explanation. It is not followed by a summary of next steps.
It is a full stop.

---

**After writing the Stop Gate phrase, Claude Code MUST NOT:**

1. Run `npm run build`
2. Run `npx tsc --noEmit`
3. Write any additional code
4. Stage any files (`git add`)
5. Commit anything (`git commit`)
6. Push any branch (`git push`)
7. Create a PR (`gh pr create`)
8. Merge anything (`gh pr merge`)
9. Update `docs/AUDIT_TRACKER.md`
10. Update `docs/SYSTEM_STATE.md`
11. Summarise what comes next
12. Explain what was just done
13. Preview the next step
14. Ask a clarifying question that implies continuation
15. Write "I'll wait for your approval before continuing" followed by more content

---

**The only valid continuation trigger:**

The human must reply with one of these exact words or phrases:
- `approved`
- `proceed`
- `continue`
- `looks good, go ahead`

No other phrasing unlocks continuation. If the human asks a question or
provides feedback instead of approving:
1. Answer the question only
2. Re-write the Stop Gate phrase
3. Wait again

---

**If Claude Code has already continued past a Stop Gate:**

1. Stop immediately at the point you notice
2. DO NOT commit, push, or merge anything done after the Stop Gate
3. Report: "I continued past a Stop Gate at [step]. The following was done
   after the gate: [list]. None of it has been committed. Do you want me to
   revert and stop, or proceed with what was done?"
4. Wait for explicit instruction before doing anything further

---

**Standard Stop Gate template (for use in all future prompts):**

```
## ⛔ STOP GATE — HARD STOP — DO NOT PROCEED

[Show specific verification output]

Then answer all [N] as numbered responses:
1. [Specific verifiable question]
2. [Specific verifiable question]
...N.

Then write this exact phrase and nothing else:

**"STOP GATE — WAITING FOR APPROVAL — do not proceed"**

---

**Do NOT:**
- Run `npm run build`
- Write any more code
- Update any docs
- Make any commits
- Continue to the next step
- Summarise what you plan to do next

Sit and wait. Only continue when the human explicitly says "approved" or "proceed".
```

> **Why it exists:** Claude Code has continued past Stop Gates in previous sessions,
> committing and pushing untested intermediate state. In one case this caused a 4-hour
> production debugging incident. The Stop Gate phrase must be the ENTIRE output — any
> text written after it, no matter how innocuous-seeming, signals that the model has
> not respected the gate.

---

## DATABASE ACCESS & ENVIRONMENT VARIABLE MANAGEMENT

### RULE 61: DATABASE ACCESS & ENVIRONMENT VARIABLE MANAGEMENT

#### 61a — .env is never committed to git

The `.env` file contains real credentials and must never appear in version control. The `.gitignore` already enforces this. Never remove `.env` from `.gitignore`. Never use `git add .env` or `git add -f .env`.

#### 61b — .env.example lives in the repo

The file `.env.example` shows the shape of all required variables with placeholder values only. It is committed to the repo so any new developer or Claude Code session on a new machine knows exactly what is needed. Real values are never placed in `.env.example`.

#### 61c — Standard session startup

Every Claude Code session must begin with:

```bash
cd ~/Downloads/stonehenge-v2 && cat docs/stonehenge-dev-rulebook.md
```

#### 61d — DB connection failure means stop

If DB data is needed and cannot be obtained, Claude Code must stop and request Sean runs the query manually. It must not infer, assume, or fabricate any DB values.

#### 61e — Diagnostic prompts may SELECT freely

Read-only SQL queries (SELECT) may be run in any session. Claude Code should write them proactively whenever real data would answer a question.

#### 61f — No writes without explicit human approval

No INSERT, UPDATE, or DELETE may be executed without:
1. Showing the exact SQL to Sean in that session
2. Receiving explicit written approval
3. Sean typing "approved" or equivalent confirmation

---

## REAL DATA BEFORE ANY CONCLUSION

### RULE 66: REAL DATA BEFORE ANY CONCLUSION — DB QUERY WORKFLOW

Claude Code runs in a sandboxed environment that blocks outbound network connections. It cannot connect to the Railway PostgreSQL database directly. **This is permanent — it cannot be changed.**

#### The Core Principle

**Never guess. Never infer. Never assume.**

If a question can be answered with real data from the database, Claude Code MUST request that data before drawing any conclusion, writing any fix, or making any recommendation. This applies to:

- Diagnostic prompts (finding root causes)
- Fix prompts (confirming what the data actually looks like before fixing)
- Feature prompts (confirming existing data structure before building on it)
- Any situation where "it depends on what's in the DB"

**A fix written without real data is a guess. Guesses cause regressions.**

#### The Workflow

At the START of any session that requires DB data, Claude Code must:

1. Read all required steps for the task
2. Identify every piece of DB data needed across ALL steps
3. Write ALL required SQL queries in a single batch upfront
4. Ask Sean to run them all at once and paste all results back
5. Only then proceed with the full task using actual output

**Never ask for DB data one query at a time. Batch everything upfront.**

#### Standard Batch Query Format

```
## Database Queries — Run All of These Before We Proceed

Run each query in your terminal and paste all results back at once:

**Query 1 — [Description]**
psql "postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway" -c "
SELECT ...
"

**Query 2 — [Description]**
psql "postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway" -c "
SELECT ...
"

Paste all results back and I will proceed with the full analysis.
```

#### When to Request DB Data

Request real DB data before proceeding when the task involves:

| Situation | Why data is needed |
|-----------|-------------------|
| Bug reported in UI | Confirm what the DB actually contains — bug may be in data, not code |
| Fix involves a specific record | Confirm the record exists with expected values before writing fix |
| Optimiser output looks wrong | Check what pieceIds, placements, and JSON were actually saved |
| Pricing shows wrong amount | Check what rates, materials, and calculations are stored |
| Feature builds on existing data | Confirm schema and actual values before writing queries |
| "Ghost" or missing UI elements | Check if the data exists before assuming a code bug |

#### Hard Rules

- **NEVER** guess what a DB query would return
- **NEVER** fabricate query results
- **NEVER** proceed past a DB-dependent decision without real output
- **NEVER** write a fix for a bug that hasn't been confirmed with real data
- If additional queries are needed mid-session, batch those together too — never one at a time

#### What Does NOT Need DB Data

Code analysis can proceed without DB data:
- Reading file contents
- Running grep searches
- TypeScript compilation checks
- Understanding component structure
- Tracing code paths

> **Added March 2, 2026.** Applies to diagnostic, fix, and feature prompts equally. Supersedes any previous assumption that Claude Code can connect to Railway.

---

## MANDATORY SESSION START

Run these commands **one at a time** before writing any code in any session:

```bash
# 1. Confirm on main, sync local, and read rulebook in one go
cd ~/Downloads/stonehenge-v2 && git checkout main && git pull --rebase origin main && cat docs/stonehenge-dev-rulebook.md

# 2. Confirm hook is installed
ls .git/hooks/pre-push && echo "✅ Hook installed" || sh scripts/install-hooks.sh

# 3. Check open audit issues
grep "🔴" docs/AUDIT_TRACKER.md

# 4. Check current system state
cat docs/SYSTEM_STATE.md
```

**If step 3 surfaces an issue relevant to your task — STOP. Address it or note a deferral.**
**If step 4 shows something that already does what you're about to build — STOP. Wire the existing one.**

---

## MANDATORY BEFORE COMMITTING

Update BOTH docs in the same commit as your code changes. The pre-push hook enforces this.

```bash
# After coding, before committing:
git add docs/AUDIT_TRACKER.md docs/SYSTEM_STATE.md
# Include them in your commit alongside code changes
git commit -m "fix: your description — update AUDIT_TRACKER + SYSTEM_STATE"

# Confirm both appear in the commit after merge:
git show --name-only HEAD | grep -E "AUDIT_TRACKER|SYSTEM_STATE"
```

---

## PRE-PROMPT MICRO-AUDIT (Rule 52 Checklist)

Before writing any code that modifies an existing service or component:

```bash
# 1. What functions currently exist in this file?
grep -n "export.*function\|async function\|function " TARGET_FILE | head -20

# 2. Is there another file that already does this?
grep -rn "FUNCTION_NAME\|DESCRIPTION_OF_FEATURE" src/lib/services/ --include="*.ts" | head -10

# 3. What calls this function/component?
grep -rn "FUNCTION_NAME\|ComponentName" src/ --include="*.ts" --include="*.tsx" | head -20

# 4. What's the current TypeScript type signature?
grep -n "interface\|type\|export type" TARGET_FILE | head -20
```

**If any result is surprising — STOP. Update your approach before writing code.**

---

## INCIDENT LOG (All Incidents)

| Date | Incident | Rules | Root Cause |
|------|----------|-------|------------|
| Feb 10 | 401 errors on new API routes in production | 6 | Auth pattern rewritten instead of copied |
| Feb 14 | Route consolidation made 10+ hours invisible | 1–5 | Routes replaced instead of rewired |
| Feb 14 | Sidebar expanded by default, looked like old builder | 13–16 | `useState(initialMode === 'edit')` |
| Feb 15 | Quote save returns 400, all pricing invisible | 6–8 | PATCH handler replaced with metadata-only |
| Feb 15 | Pricing invisible for 3+ days | 23, 27 | PricingSummary inside conditional sidebar render |
| Feb 15 | Three fix attempts verified by grep, $0 in browser | 24 | Code existed in file but didn't execute |
| Feb 15 S2 | Edge dimension fix deployed, nothing changed | 28–29 | Fixed code path that doesn't run at runtime |
| Feb 16 S3 | Old form survived THREE deletion attempts | 30–35 | Build passed, old form never actually deleted |
| Feb 17 | Series 13 prompt tried to CREATE existing table | 43 | Audit findings not applied to implementation prompt |
| Feb 17 | FromTemplateSheet build failure on Railway | 36 | Nullable state accessed without null guard |
| Feb 18 | ManualQuoteWizard Step 4 crash — React #310 | 45 | Hooks inside conditional step rendering |
| Feb 18 | Complete quote system crash — 4 hours | 46–50 | Missing migration (PR #124) + Prisma in browser bundle |
| Feb 26 | Grain match warning blocked piece editing | 54 | API handler field not verified before frontend call |
| Feb 26 | Audit findings not tracked against resolution | 51–53 | Episodic audit files with no living tracker |
| Feb 26 | FIX-4 test code had 12+ placeholder field names | 55 | No policy requiring placeholder flagging |
| Feb 27 | L/U shape pricing broken: $0 polishing/lamination | 59 | Rectangle edge system used for L-shapes — fundamental mismatch |
| Feb 27 | FIX-10-FINAL partially failed after merge | 51–53 | R-10 marked confirmed without production verification |
| Mar 1, 2026 | Claude Code continued past stop gates in optimizer prompts | 60 | Stop Gate phrase was in prompt text but not a named rule — model treated it as advisory |

---

## HISTORY

| Version | Date | Rules | What Changed |
|---------|------|-------|-------------|
| v1 | Feb 14 | 1–16 | Architecture, code quality, UX, process |
| v2 | Feb 15 | 17–22 | Extended process, pricing, git workflow |
| v3 | Feb 15 | 23–27 | Defensive debugging |
| v4 | Feb 15 S2 | 28–29 | Phantom fix prevention |
| v5 | Feb 16 S3 | 30–35 | Verification & anti-regression |
| v6 | Feb 17 | 36 | TypeScript nullable state guard |
| v7 | Feb 17 | 37–42 | UX interaction rules |
| v8 | Feb 17 | 43 | Audit integrity |
| v9 | Feb 18 | 44–45 | Banned components, React hooks ordering |
| v10 | Feb 18 | 46–50 | Schema-code parity, migration verification, Prisma in browser |
| v11 | Feb 18 | — | Consolidated v8–v10 |
| v12 | Feb 26 | 51–57 | Living audit tracker, pre-prompt micro-audit, API verification, placeholder flagging, DB-graceful tests, regression anchor protocol |
| v13 | Feb 27 | 51–59 | Full consolidation. Rule 51 hard gate. Rule 52 SYSTEM_STATE added. Rule 58 data freshness. Rule 59 L/U shape two-rule foundation. Stable path (no version suffix). Addenda eliminated. |
| v14 | Mar 2, 2026 | 60 | Rule 60: STOP GATE protocol. Defines the exact stop phrase, 15 prohibited actions after stop, the only valid continuation triggers, and the recovery procedure when a gate has been passed. Standard template included. |
| **v15** | **Mar 2, 2026** | **61, 66** | **Rule 61: Database access and .env management (6 sub-rules). Rule 66: Real data before any conclusion — Claude Code cannot reach Railway, batch all DB queries upfront, standard psql format, hard rules on fabrication and guessing. Golden Rules 34–35 added. Session startup updated to include git sync.** |

---

**Stable path:** `docs/stonehenge-dev-rulebook.md`
**Always reference this path, never a versioned filename.**
**When this document is updated to v16, the path stays the same.**
