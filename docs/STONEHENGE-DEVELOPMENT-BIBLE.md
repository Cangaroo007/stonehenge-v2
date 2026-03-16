# STONE HENGE — DEVELOPMENT BIBLE
## The Complete Guide: Pre-Work, Prompts, Stop Gates, and Failure Prevention
### Version: 1.0 — March 2026

---

This document is the single source of truth for how every Stone Henge development
session is run. Three tools, distinct roles:
- Claude Chat: planning, architecture, domain questions, prompt authorship
- Claude Code in terminal: implementation only, under strict stop-gate protocol
- Sean's desktop terminal: ALL git operations, npm run build, psql queries

---

## PART 1 — SESSION OPENING RITUAL (Claude Chat)

Every new Claude Chat session starts with this exact sequence. No shortcuts.

Step 1: Read Only Recent Documents
Only read handoff, roadmap, and key learnings from the last 4 days maximum.
Nothing older — the codebase changes dramatically day to day.

Step 2: Establish Ground State
  cd ~/Downloads/stonehenge-v2 && git pull origin main && git log --oneline -5

Step 3: Report Current State
- Last confirmed commit and what it contains
- Railway deployment status (green / building / failed)
- Zero TypeScript errors on main confirmed
- What is actually deployed vs what is only on a branch

Step 4: Fire Order — next 3 sprints:
- Ready to fire: prompt written, bash audit done, no blockers
- Needs bash audit before prompt can be written
- Blocked: state the specific external dependency

Step 5: Domain Questions Before Design
Before writing any prompt touching fabrication logic or pricing — ask Jay first.
A 5-minute conversation prevents a 3-hour architectural mistake.

---

## PART 2 — PRE-WORK PROTOCOL

Mandatory work done IN CLAUDE CHAT before anything goes to Claude Code.
Skipping this is the root cause of most failed sessions.

---

### 2A — Domain Questions (Physical/Business Logic Sprints)

Invoke when: sprint involves how something is physically cut, assembled, or joined;
how pricing works for a new feature; what a new piece type means in the workshop;
any field representing a real-world measurement.

Question format (use interactive widget, not prose):
  Q: [Specific domain question]
  Options: A) [Option A]  B) [Option B]
  My recommendation: [Option X] because [brief reason]

Locked spec output after Jay answers:
  LOCKED SPEC: [Sprint Name]
  Physical reality: [what happens in the workshop]
  Data model: field_name: Type — [what it represents physically]
  UI: [what the stone mason sees/does, default state]
  Parts: [Part B/C/D with exact dimensions and conditions]

This spec is attached to the prompt. Claude Code cannot deviate from it.

---

### 2B — The 5-Location Data Chain Audit (MOST IMPORTANT PRE-WORK STEP)

Every new DB field that must reach the UI passes through 7 locations.
If ANY location is missing, the feature silently does nothing.
You will not find out until after deploy.

Run before writing ANY sprint involving a new field:

  FIELD="your_field_name"
  CAMEL="yourFieldName"
  BASE=~/Downloads/stonehenge-v2

  grep -n "$FIELD" $BASE/prisma/schema.prisma
  grep -n "$FIELD\|$CAMEL" $BASE/src/app/\(dashboard\)/quotes/\[id\]/page.tsx
  sed -n '99,135p' $BASE/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx
  sed -n '280,320p' $BASE/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx
  grep -n "$FIELD\|$CAMEL" $BASE/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx | tail -20
  grep -n "$FIELD\|$CAMEL" $BASE/src/app/api/quotes/\[id\]/pieces/route.ts
  grep -n "$FIELD\|$CAMEL" $BASE/src/components/quotes/QuickViewPieceRow.tsx | head -5

The 7 locations that must ALL exist:
  1. prisma/schema.prisma — field definition and migration
  2. page.tsx piece mapping — fieldName: piece.field_name in serialisation map
  3. QuoteDetailClient QuotePiece interface — fieldName?: Type
  4. QuoteDetailClient raw API type block — field_name?: Type (snake_case)
  5. QuoteDetailClient camelCase prop mapping — fieldName: p.fieldName ?? null
  6. API route pieces/route.ts — field in GET response and PUT/PATCH handler
  7. Component prop interfaces — PieceData in QuickViewPieceRow etc.

If any location returns zero results — fix that location first.
Bake verified line numbers directly into the CONFIRMED FACTS section of the prompt.

---

### 2C — The Component Routing Check (UI Sprints)

Before writing any UI prompt, answer explicitly:
"Is this control for creating NEW pieces or editing EXISTING pieces?"

  Creating new pieces inline → InlinePieceEditor.tsx
  Editing existing pieces → QuickViewPieceRow.tsx  (THE DEFAULT ANSWER)
  Both → add to BOTH components

The default answer is almost always QuickViewPieceRow.
Jay edits existing pieces 90% of the time.
InlinePieceEditor only renders during new piece creation — never during normal editing.

Verify with:
  grep -n "isEditMode" ~/Downloads/stonehenge-v2/src/components/quotes/QuickViewPieceRow.tsx | head -5

Bake the confirmed component name into the prompt CONFIRMED FACTS.

---

### 2D — The Source Type Check (Prop Pass-Through Sprints)

When adding fieldName to a child component's PieceData interface AND passing
p.fieldName at the call site in QuoteDetailClient.tsx, verify the field exists
on the SOURCE type (QuotePiece interface, line ~99), not just the destination.

Railway's build is stricter than local tsc. This exact pattern caused a failed deploy.

  grep -n "fieldName\|field_name" ~/Downloads/stonehenge-v2/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx | head -10

If the field is not on QuotePiece — add it there first as part of the same sprint.

---

### 2E — DB Verification Bash

Before any sprint reading or writing DB fields:

  DB="postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway"
  psql "$DB" -c "\d quote_pieces;" | grep -i "field_name"

Column casing is inconsistent across tables:
  quote_pieces: mostly snake_case
  edge_types: "isActive", "sortOrder" (quoted camelCase — must be quoted in SQL)
  service_rates: "serviceType", "rate20mm" (quoted camelCase)

Always run \d tablename to check actual casing before writing SQL.

---

### 2F — Scope Confirmation

Before writing any prompt, explicitly state:
- Files to be touched (list every single file)
- Files that must NOT be touched
- Whether a schema migration is required
- Whether prisma migrate resolve --applied is required after manual SQL

---

## PART 3 — PROMPT STRUCTURE TEMPLATE

Every Claude Code prompt must follow this exact structure. No deviations.

  ---------------------------------------------------------------
  SPRINT [ID] — [Name]
  Files to touch: [list every file]
  No-touch list: [files that must not change]
  Risk level: Low / Medium / High
  ---------------------------------------------------------------

  STEP 0 — MANDATORY ACKNOWLEDGEMENT
  Before writing a single line of code, state the 4 Hard Stops from CLAUDE.md
  in your own words. Do not proceed until you have done this.

  CONTEXT
  [1-2 sentences: what this sprint does and why it is needed]

  CONFIRMED FACTS (verified by Claude Chat bash audit — do not re-discover)
  | Fact | Verified value |
  | Component for existing piece editing | QuickViewPieceRow.tsx |
  | [field] exists at | [exact file:line] |
  | [interface] includes [field] at | line N |

  GATE 0 — VERIFY PRECONDITIONS
  [Specific bash commands — Claude Code runs these]
  Show output. Confirm each item with a checkbox.

  🛑 STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate 0 approved. GO."

  Failure conditions (stop and report — do not attempt a fix):
  - If [field] is not found at the expected location
  - If the interface does not include [field]

  GATE 1 — [First change]
  File: [exact filename — one file only per gate]
  [Precise instructions. Reference exact line numbers from Gate 0 output.]

  Show diff only. Run npx tsc --noEmit. Show exact output.

  🛑 STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate 1 approved. GO."

  Failure conditions:
  - If TypeScript errors are introduced — stop and report, do not self-fix

  [Additional gates as needed — one logical change per gate]

  GATE FINAL — Build verification
  Sean runs locally (Claude Code NEVER runs this):
    cd ~/Downloads/stonehenge-v2 && npm run build 2>&1 | tail -8

  🛑 STOP. WAIT FOR SEAN TO CONFIRM BUILD PASSED.
  Do not proceed to any git discussion until Sean types: "Build passed."

  AFTER GATE FINAL APPROVED
  Sean runs from his desktop terminal (NOT Claude Code):
    git add -A && git commit -m "fix(sprint-id): title

    ## What changed
    - src/file.tsx line N: description

    ## Root cause
    Why this was needed

    ## Verify in production
    - [ ] Specific check" && git push origin branch-name

  Then open PR at github.com/Cangaroo007/stonehenge-v2/pulls

  PRODUCTION ACCEPTANCE CHECKLIST
  After Railway green, verify exactly:
  - [ ] Navigate to [URL] and confirm [specific thing]
  - [ ] Navigate to [URL] and confirm [specific thing]
  - [ ] Confirm [previously working thing] is NOT broken

  WHAT MUST NOT CHANGE
  - [Specific export/function/interface — imported elsewhere]
  - [Specific file — out of scope for this sprint]
  - [e.g. No Prisma schema changes / No API changes]

---

## PART 4 — STOP GATE FORMULA

Every gate must use this exact formula. Word for word. Never abbreviated.

Standard stop:
  🛑 STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate [N] approved. GO."
  Any other message — "looks good", "approved", "continue", "that's fine" —
  is NOT permission to proceed.

Stop with failure conditions:
  🛑 STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate [N] approved. GO."

  Failure conditions — stop and report if any are true:
  - If [specific thing] not found at [expected location]
  - If TypeScript errors are introduced
  - If [assumption] proves incorrect

Why this exact wording: Claude Code interprets ambiguous approval as permission.
"Looks good", "that works", "go ahead" have all caused self-approval in session
history. The exact phrase "Gate [N] approved. GO." is the only safe trigger.

---

## PART 5 — THE 9 RECURRING FAILURE PATTERNS

Read before every session. These are documented failures, not hypotheticals.

FAILURE 1 — Wrong Component (occurred 4 times)
  What: UI controls added to InlinePieceEditor; Jay couldn't find them because
  existing piece editing uses QuickViewPieceRow.
  Fix: Part 2C Component Routing Check before every UI sprint.
  Rule: InlinePieceEditor = new pieces only. QuickViewPieceRow = everything else.

FAILURE 2 — Silent Field Disappearance (occurred 3 times)
  What: Field added to schema and component interface but dropped by page.tsx
  serialisation map. Component always received null. Only visible after deploy.
  Fix: Part 2B 5-Location Data Chain Audit before every sprint with a new field.
  Rule: A field must exist at all 7 locations or it silently does nothing.

FAILURE 3 — Claude Code Commits Without Permission (occurred 11 times)
  What: Claude Code ran git add/commit/push without explicit instruction, sometimes
  mid-sprint, causing Railway failures and rule violations.
  Fix: Hard Stops box at absolute top of CLAUDE.md. Step 0 acknowledgement in every
  prompt forces Claude Code to restate the rules before touching any file.
  Rule: Sean never types ambiguous approval. Always use: "Gate N approved. GO."

FAILURE 4 — Source Type vs Destination Interface Mismatch
  What: p.fieldName passed at call site in QuoteDetailClient but QuotePiece
  (source type) didn't have the field. Local tsc passed; Railway build failed.
  Fix: Part 2D Source Type Check before any prop pass-through addition.
  Rule: Both source type AND destination interface must have the field.

FAILURE 5 — Architectural Assumption Without Domain Validation
  What: 40mm thickness toggle built as a piece property. Jay's input ("there's no
  such thing as a 40mm slab") revealed the entire model was wrong in one sentence.
  Hours of sprints had to be redesigned.
  Fix: Part 2A Domain Questions before designing any data model.
  Rule: Ask Jay first. Design second. Always.

FAILURE 6 — Filter Bug Creates New Regression
  What: WF-6 filter excluded WATERFALL and SPLASHBACK pieces. Waterfalls: correctly
  excluded. Splashbacks: incorrectly excluded — they need their own parts list entry.
  Fix: When adding exclusion filters, explicitly list what SHOULD be excluded vs what
  SHOULD remain, and verify each category individually before committing.

FAILURE 7 — Debug Logs Left on Production Main
  What: Three console.error debug logs pushed to main, left for 2+ hours, polluting
  Railway logs and creating confusion about which code was running.
  Fix: Label debug commits "debug:" immediately. Plan cleanup in same session.
  Rule: Debug logs are removed within the same session. Never overnight.

FAILURE 8 — 3+ Iterations on an Impossible Result
  What: isMitreEdge("Mitered") returned false despite "mitered".includes("mitre")
  being mathematically true. Multiple debug sessions confirmed the source was correct.
  Hours spent on a result that couldn't be explained.
  Fix: Max 3 debug iterations on any impossible result. After 3: check for multiple
  function definitions, trigger Railway clean redeploy, then redesign around it.
  Rule: Do not spend more than 3 debug iterations on a single impossible result.

FAILURE 9 — Scope Expansion Mid-Sprint
  What: A "fix the parts list" sprint grew to cover waterfalls, edge types, the
  optimizer, and face strips in one session. Ended with more regressions than it
  started with.
  Fix: Name exactly what a sprint does in the title. If scope wants to expand during
  investigation — stop and queue a new sprint instead of expanding the current one.
  Rule: Fix bugs before adding features. Small focused sprints over large ones.

---

## PART 6 — SPRINT READINESS CHECKLIST

Before marking any sprint "ready to fire", confirm every item:

Architecture:
  [ ] Domain questions answered by Jay (if fabrication/pricing logic)
  [ ] Locked spec written and attached to prompt
  [ ] Scope clearly defined: files to touch, files not to touch

Data chain (if new DB field):
  [ ] Field exists in schema.prisma
  [ ] Migration created or planned
  [ ] Field in page.tsx serialisation map
  [ ] Field in QuoteDetailClient QuotePiece interface
  [ ] Field in QuoteDetailClient raw API type block
  [ ] Field in QuoteDetailClient camelCase prop mapping
  [ ] Field returned by API route
  [ ] Field in component prop interface (QuickViewPieceRow, PartsSection etc.)

Component routing (if UI):
  [ ] Confirmed InlinePieceEditor vs QuickViewPieceRow vs both
  [ ] Verified with grep which component handles existing piece editing

Source type check (if prop pass-through):
  [ ] SOURCE type (QuotePiece ~line 99) confirmed to have the field
  [ ] Not just the destination interface

DB verification (if new field or SQL):
  [ ] Column casing verified with \d tablename
  [ ] Enum values confirmed if applicable
  [ ] Current data state checked with a SELECT

Prompt structure:
  [ ] CONFIRMED FACTS populated with verified line numbers
  [ ] Failure conditions listed per gate
  [ ] Gate stops use exact formula
  [ ] Production acceptance checklist included
  [ ] WHAT MUST NOT CHANGE section complete

---

## PART 7 — KEY SYSTEM FACTS (Quick Reference)

The Two-Component Rule:
  Editing existing piece in quote: QuickViewPieceRow.tsx
  Creating new piece inline: InlinePieceEditor.tsx
  Override controls (material, margin): QuickViewPieceRow (added by QF-4)
  Edge build-up toggles: QuickViewPieceRow (added by BUILDUPA-2)
  New piece wizard steps: InlinePieceEditor

The Strip vs Piece Distinction (LOCKED — never blur these):
  Strip: cut from same slab as parent piece, no separate material cost,
         auto-generated from edge configuration
         Examples: front strip (B), return strip (C), support block (D)
  Piece: own slab allocation, own material cost, created explicitly by stone mason
         Examples: waterfall, splashback, island, benchtop

Build-Up Parts Reference:
  B (Front strip): width = build-up depth (e.g. 40mm), thickness = slab, always
  C (Return strip): width = 60mm default (overridable), thickness = slab, always
  D (Support block): width = depth minus (2 x slab thickness), only when depth > 40mm

Critical DB IDs:
  Pricing settings: ps-org-1
  MITERED_EDGE_ID: cmlar3eu20006znatmv7mbivv
  ARRIS_EDGE_ID: cmlar3etm0002znat72h7jnx0
  PENCIL_ROUND_ID: cmlar3etc0000znatkbilb48y
  BULLNOSE_ID: cmlar3eth0001znathwq93rbm

Auth pattern (always this — never @/lib/auth-helpers):
  import { requireAuth } from '@/lib/auth'
  const auth = await requireAuth();
  if ('error' in auth) { return NextResponse.json({ error: auth.error }, { status: auth.status }); }
  const { companyId } = auth.user;

Railway build patterns (non-negotiable):
  Arrays from Sets: Array.from(new Set(array))  — never [...new Set(array)]
  Prisma JSON: field as unknown as MyType  — never direct cast
  Route params: const { id } = await params  — never without await

---

## PART 8 — GOOD vs BAD GATE 0

GOOD — Data Chain Sprint:
  grep -n "edge_buildups\|edgeBuildups" prisma/schema.prisma
  grep -n "edge_buildups\|edgeBuildups" src/app/(dashboard)/quotes/[id]/page.tsx
  grep -n "edge_buildups\|edgeBuildups" src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx
  grep -n "edge_buildups\|edgeBuildups" src/app/api/quotes/[id]/pieces/route.ts
  grep -n "edge_buildups\|edgeBuildups" src/components/quotes/QuickViewPieceRow.tsx

  For each location confirm the field exists.
  If ANY returns zero results — STOP and report. Do not proceed.

GOOD — UI Sprint:
  grep -n "isEditMode" src/components/quotes/QuickViewPieceRow.tsx | head -3
  grep -n "savePieceImmediate" src/components/quotes/QuickViewPieceRow.tsx | head -5
  sed -n '99,125p' src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx

  Report exact line numbers found. If anything differs from CONFIRMED FACTS — STOP.

BAD (never use):
  "Look around the codebase and get familiar with it."
  Gate 0 must have specific things to find and explicit failure conditions.
  Vague Gate 0 = vague implementation = regressions.

---

Stone Henge Development Bible v1.0
Compiled from 80+ lessons across 30+ sessions — March 2026
Next review: When lesson count exceeds 90 or a new failure pattern emerges
