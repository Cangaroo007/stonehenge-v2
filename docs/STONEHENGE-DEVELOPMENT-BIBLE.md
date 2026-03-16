# STONE HENGE — DEVELOPMENT BIBLE
## The Complete Guide: Pre-Work, Prompts, Stop Gates, and Failure Prevention
### Version: 1.0 — March 2026

---

> This document is the single source of truth for how every Stone Henge development
> session is run. It covers three distinct tools: Claude Chat (planning and prompt
> authorship), Claude Code in terminal (implementation), and Sean's local terminal
> (git, builds, psql). If something is not in here, default to the dev rulebook at
> docs/stonehenge-dev-rulebook.md.

---

## PART 1 — SESSION OPENING RITUAL (Claude Chat)

Every new Claude Chat session starts with this exact sequence. No shortcuts.

Step 1 — Read Only Recent Documents
Only read handoff, roadmap, and key learnings from the last 4 days maximum.
Do NOT read anything older — the codebase changes dramatically day to day.

Step 2 — Establish Ground State
Before planning anything, run:
cd ~/Downloads/stonehenge-v2 && git pull origin main && git log --oneline -5

Step 3 — Report Current State
State explicitly:
- Last confirmed commit and what it contains
- Railway deployment status
- Zero TypeScript errors on main
- What is actually deployed vs what is only on a branch

Step 4 — Fire Order
Identify the next 3 sprints:
- Ready to fire: prompt written, bash audit done, no blockers
- Needs bash audit before prompt can be written
- Blocked: external dependency or another sprint must go first

Step 5 — Domain Questions Before Design
Before writing any prompt touching fabrication logic, pricing logic, or physical
stone-working concepts — ask Jay first. A 5-minute conversation prevents a 3-hour
architectural mistake.

---

## PART 2 — PRE-WORK PROTOCOL

This is mandatory work done IN CLAUDE CHAT before anything goes to Claude Code.
Skipping this pre-work is the root cause of most failed sessions.

### 2A — Domain Questions (Physical/Business Logic Sprints)

Before writing any sprint touching fabrication logic, pricing, or physical reality,
Claude Chat asks Jay questions. Do NOT start writing the data model until all
domain questions are answered.

When to invoke: Any sprint involving how something is physically cut, assembled,
or joined; how pricing works for a new feature; what a new piece type means in
the workshop; any field representing a real-world measurement.

Question format (use interactive tool, not prose):
  Q: [Specific domain question]
  Options:
  A) [Option A]
  B) [Option B]
  My recommendation: [Option X] because [brief reason]

Locked spec output after Jay answers:
  LOCKED SPEC — [Sprint Name]
  Physical reality: [what actually happens in the workshop]
  Data model: [field name]: [Type] — [what it represents physically]
  UI behaviour: [what the stone mason sees/does]
  Parts generated: [Part A/B/C/D with dimensions and conditions]

### 2B — The 5-Location Data Chain Audit

THE SINGLE MOST IMPORTANT PRE-WORK STEP. Every new DB field that must reach the
UI passes through exactly 5 locations. If ANY location is missing, the feature
silently does nothing and you will not find out until after deploy.

Run this bash before writing any sprint involving a new field:

  FIELD="your_field_name"
  CAMEL="yourFieldName"

  echo "=== 1. SCHEMA ===" && \
  grep -n "$FIELD" ~/Downloads/stonehenge-v2/prisma/schema.prisma && \
  echo "=== 2. PAGE.TSX SERIALISATION MAP ===" && \
  grep -n "$FIELD\|$CAMEL" ~/Downloads/stonehenge-v2/src/app/\(dashboard\)/quotes/\[id\]/page.tsx && \
  echo "=== 3. QUOTEDETAILCLIENT INTERFACE ===" && \
  sed -n '99,135p' ~/Downloads/stonehenge-v2/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx && \
  echo "=== 4. QUOTEDETAILCLIENT RAW API TYPE ===" && \
  sed -n '280,320p' ~/Downloads/stonehenge-v2/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx && \
  echo "=== 5. QUOTEDETAILCLIENT PROP MAPPING ===" && \
  grep -n "$FIELD\|$CAMEL" ~/Downloads/stonehenge-v2/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx | tail -20 && \
  echo "=== 6. API ROUTE ===" && \
  grep -n "$FIELD\|$CAMEL" ~/Downloads/stonehenge-v2/src/app/api/quotes/\[id\]/pieces/route.ts && \
  echo "=== 7. COMPONENT INTERFACES ===" && \
  grep -n "$FIELD\|$CAMEL" ~/Downloads/stonehenge-v2/src/components/quotes/QuickViewPieceRow.tsx | head -5 && \
  grep -n "$FIELD\|$CAMEL" ~/Downloads/stonehenge-v2/src/components/quotes/PartsSection.tsx | head -5

If any location returns zero results — fix that location first. Do NOT write the
sprint prompt until all 7 locations are confirmed. Bake verified line numbers
directly into the prompt as CONFIRMED FACTS.

The 7 locations:
1. prisma/schema.prisma — field definition and migration
2. page.tsx piece mapping — fieldName: piece.field_name in the serialisation map
3. QuoteDetailClient QuotePiece interface — fieldName?: Type
4. QuoteDetailClient raw API type block — field_name?: Type (snake_case)
5. QuoteDetailClient camelCase prop mapping — fieldName: p.fieldName ?? null
6. API route pieces/route.ts — field in GET response and PUT/PATCH handler
7. Component prop interfaces — PieceData in QuickViewPieceRow etc.

### 2C — The Component Routing Check (UI Sprints)

Before writing any UI prompt, answer this explicitly:
"Is this control for creating NEW pieces or editing EXISTING pieces?"

  Creating new pieces inline → InlinePieceEditor.tsx
  Editing existing pieces → QuickViewPieceRow.tsx (THE DEFAULT ANSWER)
  Both → add to BOTH components

The default answer is almost always QuickViewPieceRow. Jay edits existing pieces
90% of the time. InlinePieceEditor only renders during new piece creation.

Run this to confirm:
  grep -n "isEditMode\|mode.*edit" ~/Downloads/stonehenge-v2/src/components/quotes/QuickViewPieceRow.tsx | head -5

Bake the confirmed component name into the prompt as a verified fact.

### 2D — The Source Type Check (Prop Pass-Through Sprints)

When adding fieldName to a child component's PieceData interface AND passing
p.fieldName at the call site in QuoteDetailClient.tsx, verify the field exists
on the SOURCE type (QuotePiece, line ~99), not just the destination interface.

Railway's build is stricter than local tsc. This caused a failed Railway deploy.

  grep -n "fieldName\|field_name" ~/Downloads/stonehenge-v2/src/app/\(dashboard\)/quotes/\[id\]/QuoteDetailClient.tsx | head -10

If the field is not on QuotePiece — add it there first as part of the same sprint.

### 2E — DB Verification Bash

Before any sprint that reads or writes DB fields:

  DB="postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway"
  psql "$DB" -c "\d quote_pieces;" | grep -i "field_name"

Column casing is inconsistent across tables:
- quote_pieces: mostly snake_case
- edge_types: "isActive", "sortOrder" (quoted camelCase)
- service_rates: "serviceType", "rate20mm" (quoted camelCase)

Always run \d tablename to check actual casing before writing SQL.

### 2F — Scope Confirmation

Before writing a prompt, explicitly state:
- Files to be touched (list every file)
- Files that must NOT be touched
- Whether a schema migration is required
- Whether prisma migrate resolve --applied is required after manual SQL
  IMPORTANT: After any manual SQL migration, ALWAYS run:
    cd ~/Downloads/stonehenge-v2 && \
    DATABASE_URL="postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway" \
    npx prisma migrate resolve --applied MIGRATION_NAME_HERE
  Skipping this caused a Railway crash loop. Non-negotiable.

---

## PART 3 — CLAUDE.MD REFERENCE

The current CLAUDE.md lives at ~/Downloads/stonehenge-v2/CLAUDE.md.
It contains the Hard Stops box, Uncertainty Protocol, Component Routing Rule,
PR Description Format, Architecture facts, Railway patterns, Standing Rules,
and Allowed Bash Commands.

Read it at every Claude Code session start with: cat CLAUDE.md

---

## PART 4 — PROMPT STRUCTURE TEMPLATE

Every Claude Code prompt must follow this exact structure.

  SPRINT [ID] — [Name]
  Files to touch: [list every file]
  No-touch list: [list files that must not change]
  Risk level: Low / Medium / High

  STEP 0 — MANDATORY ACKNOWLEDGEMENT
  Before writing a single line of code, state the 4 Hard Stops from CLAUDE.md
  in your own words. Do not proceed until you have done this.

  CONTEXT
  [1-2 sentences explaining what this sprint does and why.]

  CONFIRMED FACTS (verified by Claude Chat bash audit — do not re-discover)
  [Table of fact to verified value, including exact line numbers]
  Component for existing piece editing: QuickViewPieceRow.tsx

  GATE 0 — VERIFY PRECONDITIONS
  [Specific bash commands to verify confirmed facts are still accurate]
  Show output. Confirm each item with a checkbox.

  STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate 0 approved. GO."

  Failure conditions (stop and report, do not attempt a fix):
  - If [field] is not found at the expected location
  - If the interface does not include [field]

  GATE 1 — [First change]
  File: [exact filename only]
  [Precise instructions. Reference exact line numbers from Gate 0.]
  Show diff only. Run npx tsc --noEmit. Show exact output.

  STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate 1 approved. GO."

  Failure conditions:
  - If TypeScript errors are introduced — stop and report

  GATE FINAL — Build verification
  Sean runs locally (Claude Code does NOT run this):
  cd ~/Downloads/stonehenge-v2 && npm run build 2>&1 | tail -8
  STOP. WAIT FOR SEAN TO CONFIRM BUILD PASSED.

  AFTER GATE FINAL APPROVED
  Sean runs (NOT Claude Code):
  git add -A && git commit -m "fix(sprint-id): title
  ## What changed
  - src/file.tsx line N: description
  ## Root cause
  Why this was needed
  ## Verify in production
  - [ ] Specific check" && git push origin branch-name

  PRODUCTION ACCEPTANCE CHECKLIST
  - [ ] Navigate to [URL] and confirm [specific thing]
  - [ ] Navigate to [URL] and confirm [specific thing]

  WHAT MUST NOT CHANGE
  - [Specific export/interface]
  - [Specific file — out of scope]

---

## PART 5 — STOP GATE FORMULA

Every gate must use this exact formula. Word for word. No abbreviation.

Standard gate stop:
  STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate [N] approved. GO."
  Any other message — including "looks good", "approved", "continue", or "that is fine"
  — is NOT permission to proceed.

Gate with failure conditions:
  STOP. DO NOT WRITE ANOTHER LINE OF CODE. DO NOT PROCEED.
  WAIT FOR SEAN TO TYPE EXACTLY: "Gate [N] approved. GO."

  Failure conditions — stop and report if any of these are true:
  - If [specific thing] is not found at [expected location]
  - If TypeScript errors are introduced by this change
  - If [assumption] proves incorrect

---

## PART 6 — THE 9 RECURRING FAILURE PATTERNS

FAILURE TYPE 1: Wrong Component (4 occurrences)
  What happened: UI controls added to InlinePieceEditor but Jay could not find them
  because existing piece editing uses QuickViewPieceRow.
  Prevention: Part 2C Component Routing Check, mandatory before every UI sprint.
  The rule: InlinePieceEditor = new pieces only. QuickViewPieceRow = everything else.

FAILURE TYPE 2: Silent Field Disappearance (3 occurrences)
  What happened: Field added to schema and component interface but silently dropped
  by page.tsx serialisation, so the component always received null.
  Prevention: Part 2B 5-Location Data Chain Audit before every sprint with a new field.
  The rule: A field must exist at all 7 locations or it silently does nothing.

FAILURE TYPE 3: Claude Code Commits Without Permission (11 occurrences)
  What happened: Claude Code ran git add/commit/push without explicit instruction.
  Prevention: Hard Stops box at absolute top of CLAUDE.md. Step 0 acknowledgement
  in every prompt. Sean never types ambiguous approval.
  Always use exactly: "Gate N approved. GO."

FAILURE TYPE 4: Source Type vs Destination Interface Mismatch
  What happened: p.fieldName passed at call site but QuotePiece did not have the
  field. Local tsc passed; Railway failed.
  Prevention: Part 2D Source Type Check before any prop pass-through addition.
  The rule: Both source type AND destination interface must have the field.

FAILURE TYPE 5: Architectural Assumption Without Domain Validation
  What happened: 40mm thickness toggle built as a piece property. Jay's input
  (there is no such thing as a 40mm slab) revealed the entire model was wrong.
  Hours of work had to be redesigned.
  Prevention: Part 2A Domain Questions before any data model is designed.
  The rule: Ask first, design second. Always.

FAILURE TYPE 6: Filter Bug Creates New Regression
  What happened: WF-6 filter excluded WATERFALL and SPLASHBACK. Waterfalls correctly
  excluded; splashbacks incorrectly excluded.
  Prevention: When adding exclusion filters, explicitly list what SHOULD be excluded
  vs what SHOULD remain, and verify each case individually.

FAILURE TYPE 7: Debug Logs Left on Production Main
  What happened: Three console.error debug logs pushed to main, left for 2+ hours.
  Prevention: Debug commits labelled "debug:" immediately. Cleanup tracked. Removed
  in same session. Never overnight.

FAILURE TYPE 8: 3+ Iterations on an Impossible Result
  What happened: isMitreEdge("Mitered") returned false despite logic being correct.
  Hours spent confirming the impossible.
  Prevention: Max 3 debug iterations on any single impossible result. After 3:
  check for multiple function definitions, trigger Railway clean redeploy,
  then redesign around the check if still unresolved.

FAILURE TYPE 9: Scope Expansion Mid-Sprint
  What happened: A fix the parts list sprint grew to cover waterfalls, edge types,
  optimizer, and face strips. Ended with more regressions than it started with.
  Prevention: Name exactly what a sprint does. If scope wants to expand during
  investigation, stop and queue a new sprint instead.

---

## PART 7 — THE SESSION OPENING PROMPT

Paste the content of NEW-SESSION-OPENING-PROMPT-V2.1.md verbatim to start every
Claude Chat session. It is also stored in the project instructions.

---

## PART 8 — SPRINT READINESS CHECKLIST

Before marking any sprint as ready to fire, confirm every item:

Architecture:
[ ] Domain questions answered by Jay (if fabrication/pricing logic)
[ ] Locked spec written and attached to prompt
[ ] Scope clearly defined

Data chain (if new field):
[ ] Field in schema.prisma
[ ] Migration created/planned
[ ] Field in page.tsx serialisation map
[ ] Field in QuoteDetailClient QuotePiece interface
[ ] Field in QuoteDetailClient raw API type block
[ ] Field in QuoteDetailClient camelCase prop mapping
[ ] Field returned by API route
[ ] Field in component prop interface

Component routing (if UI):
[ ] Confirmed whether InlinePieceEditor, QuickViewPieceRow, or both
[ ] Verified with grep which component handles existing piece editing

Source type check (if prop pass-through):
[ ] Source type (QuotePiece) confirmed to have the field

DB verification (if new field):
[ ] Column casing verified with \d tablename
[ ] Enum values confirmed if applicable

Prompt structure:
[ ] CONFIRMED FACTS section populated with verified line numbers
[ ] Failure conditions listed per gate
[ ] Gate stops use exact formula
[ ] Production acceptance checklist included
[ ] WHAT MUST NOT CHANGE section complete

---

## PART 9 — KEY SYSTEM FACTS (Quick Reference)

The Two-Component Rule:
  Editing existing piece → QuickViewPieceRow.tsx
  Creating new piece inline → InlinePieceEditor.tsx
  Override controls (material, margin) → QuickViewPieceRow (added by QF-4)
  Edge build-up toggles → QuickViewPieceRow (added by BUILDUPA-2)

The Strip vs Piece Distinction (LOCKED):
  Strip: cut from same slab as parent, no separate material cost, auto-generated
  Piece: own slab allocation, own material cost, created explicitly by stone mason

Build-Up Parts Reference:
  B — Front strip: width = build-up depth, thickness = slab thickness, always
  C — Return strip: width = 60mm default (overridable), always
  D — Support block: width = depth minus (2 x slab thickness), only when depth > 40mm

Critical DB Facts:
  DB: postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway
  Pricing settings ID: ps-org-1
  MITERED_EDGE_ID: cmlar3eu20006znatmv7mbivv
  ARRIS_EDGE_ID: cmlar3etm0002znat72h7jnx0
  PENCIL_ROUND_ID: cmlar3etc0000znatkbilb48y
  BULLNOSE_ID: cmlar3eth0001znathwq93rbm

Auth Pattern:
  import { requireAuth } from '@/lib/auth'
  const auth = await requireAuth();
  if ('error' in auth) { return NextResponse.json({ error: auth.error }, { status: auth.status }); }
  const { companyId } = auth.user;

---

## PART 10 — GOOD vs BAD GATE 0 EXAMPLES

GOOD Gate 0 — Data Chain Sprint:
  Run:
  grep -n "edge_buildups\|edgeBuildups" prisma/schema.prisma
  grep -n "edge_buildups\|edgeBuildups" src/app/(dashboard)/quotes/[id]/page.tsx
  grep -n "edge_buildups\|edgeBuildups" src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx
  grep -n "edge_buildups\|edgeBuildups" src/app/api/quotes/[id]/pieces/route.ts
  grep -n "edge_buildups\|edgeBuildups" src/components/quotes/QuickViewPieceRow.tsx

  For each location confirm the field exists. If any returns zero results — STOP.

GOOD Gate 0 — UI Sprint:
  Run:
  grep -n "isEditMode" src/components/quotes/QuickViewPieceRow.tsx | head -3
  grep -n "savePieceImmediate" src/components/quotes/QuickViewPieceRow.tsx | head -5
  sed -n '111,125p' src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx

  Confirm isEditMode is defined, savePieceImmediate exists, QuotePiece interface
  includes the field. Report exact line numbers. If anything differs — STOP.

BAD Gate 0 (never use):
  Look around the codebase and get familiar with it.
  (Too vague. Gate 0 must have specific things to find and explicit failure conditions.)

---

Stone Henge Development Bible v1.0
Compiled from 80+ lessons across 30+ sessions — March 2026
Next review: When lesson count exceeds 90 or a new failure pattern emerges
