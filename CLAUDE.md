╔══════════════════════════════════════════════════════════════════╗
║  HARD STOPS — READ THIS BEFORE ANYTHING ELSE                     ║
║  These override ALL other instructions including Sean's requests ║
╠══════════════════════════════════════════════════════════════════╣
║  1. NEVER run git add / git commit / git push / git merge        ║
║     Not even if Sean says "please commit", "go ahead", or        ║
║     gives any instruction that seems to permit it.               ║
║     Sean runs ALL git operations from his desktop terminal.      ║
║  2. NEVER run npm run build. Sean runs builds locally only.      ║
║  3. ALWAYS stop after showing diffs. Wait for exact phrase:      ║
║     "Gate [N] approved. GO."                                     ║
║  4. ALWAYS ask before proceeding when uncertain. Never guess.    ║
╚══════════════════════════════════════════════════════════════════╝

## UNCERTAINTY PROTOCOL — MANDATORY

If at ANY point you are uncertain about:
- Which exact line to modify
- Whether a type or interface has a field
- Whether a function is sync or async
- Any behaviour that differs from the prompt's description
- Anything that requires a judgement call

**STOP immediately. Do not guess. Do not proceed.**
State your question in this format:
"⚠️ UNCERTAIN: [exact question]. Options I see are: [A] or [B]. Which should I use?"

Guessing and being wrong wastes more time than asking. Always ask.

---

## COMPONENT ROUTING RULE — UI CONTROLS

- **Editing EXISTING pieces** → QuickViewPieceRow.tsx
- **Creating NEW pieces inline** → InlinePieceEditor.tsx
- **The default answer is QuickViewPieceRow.** InlinePieceEditor only renders during
  new piece creation, never during normal editing of existing pieces.

---

## PR DESCRIPTION FORMAT (MANDATORY — every commit)

Every commit must use this multi-line format — single line titles are NOT acceptable:

fix(sprint-id): short title here

## What changed
- src/path/file.tsx line X: what changed and why

## Root cause
Why the bug existed or why the change was needed

## Verify in production
- [ ] Navigate to X and confirm Y
- [ ] Check that Z no longer appears

---

## ARCHITECTURE

**Project:** Stone Henge — AI quoting SaaS for stone fabrication
**Repo local path:** ~/Downloads/stonehenge-v2
**Stack:** Next.js 14, TypeScript strict, PostgreSQL, Prisma ORM, Railway Pro, Cloudflare R2

**Critical file paths:**
- Quote builder (monolith): src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx
- Editing existing pieces: src/components/quotes/QuickViewPieceRow.tsx
- Creating new pieces: src/components/quotes/InlinePieceEditor.tsx
- Parts list: src/components/quotes/PartsSection.tsx
- Pricing calculator: src/lib/services/pricing-calculator-v2.ts
- Slab optimizer: src/lib/services/slab-optimizer.ts
- Auth import: import { requireAuth } from '@/lib/auth'
- Dev rulebook: docs/stonehenge-dev-rulebook.md (read this at every session start)
- Development Bible: docs/STONEHENGE-DEVELOPMENT-BIBLE.md
- Audit tracker: docs/AUDIT_TRACKER.md (update on every merge)

**DB connection string:**
postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway

**Key IDs:**
- Pricing settings: ps-org-1
- MITERED_EDGE_ID: cmlar3eu20006znatmv7mbivv
- ARRIS_EDGE_ID: cmlar3etm0002znat72h7jnx0

---

## RAILWAY BUILD PATTERNS (non-negotiable)

// Arrays from Sets — ALWAYS use Array.from
const items = Array.from(new Set(array));  // correct
const items = [...new Set(array)];         // Railway build fails

// Prisma JSON fields — double cast required
const data = field as unknown as MyType;   // correct
const data = field as MyType;              // TypeScript error

// Next.js 14 route params — must await
const { id } = await params;              // correct
const { id } = params;                    // fails on Railway

---

## STANDING RULES

- Australian spelling: metre, colour, optimiser, organisation, authorised
- Run npx prisma generate after every schema change
- Run prisma migrate resolve --applied NAME after manual SQL migrations
- price_per_sqm AND price_per_square_metre always written together
- useMemo declared BEFORE any useCallback that references it
- No gh CLI available — GitHub UI only for all PRs
- Debug logs must be removed in the same session they are added — never overnight
- When adding prop pass-through, verify field on SOURCE type (QuotePiece) not just destination
- 4-location propagation: interface → raw API type → camelCase mapping → page.tsx

---

## ALLOWED BASH COMMANDS

Claude Code CAN run:
- npx tsc --noEmit
- grep, sed, cat, find, wc, head, tail
- npx prisma generate
- psql (DB string provided in prompt)

Claude Code CANNOT run:
- git add, git commit, git push, git merge, git rebase
- npm run build
- Any command that modifies the git state

---

## RUN THIS AT EVERY SESSION START

cat docs/stonehenge-dev-rulebook.md
cat docs/STONEHENGE-DEVELOPMENT-BIBLE.md

Read both before touching anything.
