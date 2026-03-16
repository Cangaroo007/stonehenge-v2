# Stone Henge — Claude Code Instructions

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

If at ANY point you are uncertain about which exact line to modify,
whether a type has a field, whether a function is sync or async,
or anything that requires a judgement call:

STOP immediately. Do not guess. Do not proceed.
State: "UNCERTAIN: [exact question]. Options: [A] or [B]. Which?"

## COMPONENT ROUTING RULE

- Editing EXISTING pieces: QuickViewPieceRow.tsx
- Creating NEW pieces inline: InlinePieceEditor.tsx
- Default answer is QuickViewPieceRow. InlinePieceEditor only renders
  during new piece creation, never during normal editing.

## PR DESCRIPTION FORMAT (MANDATORY — every commit)

fix(sprint-id): short title

## What changed
- src/path/file.tsx line X: what changed and why

## Root cause
Why the bug existed

## Verify in production
- [ ] Navigate to X and confirm Y

## ARCHITECTURE

Project: Stone Henge — AI quoting SaaS for stone fabrication
Repo: ~/Downloads/stonehenge-v2
Stack: Next.js 14, TypeScript strict, PostgreSQL, Prisma ORM, Railway Pro

Critical file paths:
- Quote builder monolith: src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx
- Editing existing pieces: src/components/quotes/QuickViewPieceRow.tsx
- Creating new pieces: src/components/quotes/InlinePieceEditor.tsx
- Parts list: src/components/quotes/PartsSection.tsx
- Calculator: src/lib/services/pricing-calculator-v2.ts
- Optimizer: src/lib/services/slab-optimizer.ts
- Auth: import { requireAuth } from '@/lib/auth'
- Dev rulebook: docs/stonehenge-dev-rulebook.md
- Development Bible: docs/STONEHENGE-DEVELOPMENT-BIBLE.md
- Audit tracker: docs/AUDIT_TRACKER.md

DB: postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway

Key IDs:
- Pricing settings: ps-org-1
- MITERED_EDGE_ID: cmlar3eu20006znatmv7mbivv
- ARRIS_EDGE_ID: cmlar3etm0002znat72h7jnx0

## RAILWAY BUILD PATTERNS

Arrays from Sets: Array.from(new Set(array))  — never [...new Set(array)]
Prisma JSON fields: field as unknown as MyType  — never direct cast
Next.js 14 params: const { id } = await params  — never without await

## STANDING RULES

- Australian spelling: metre, colour, optimiser, organisation
- npx prisma generate after every schema change
- prisma migrate resolve --applied NAME after manual SQL migrations
- price_per_sqm AND price_per_square_metre always written together
- useMemo declared BEFORE any useCallback that references it
- No gh CLI — GitHub UI only for PRs
- Debug logs removed in same session they are added, never overnight
- Verify field on SOURCE type (QuotePiece) not just destination interface
- 4-location propagation: interface, raw API type, camelCase mapping, page.tsx

## ALLOWED BASH COMMANDS

CAN run: npx tsc --noEmit, grep, sed, cat, find, wc, head, tail,
         npx prisma generate, psql

CANNOT run: git add, git commit, git push, git merge, git rebase, npm run build

## SESSION START

Read these first:
  cat docs/stonehenge-dev-rulebook.md
  cat docs/STONEHENGE-DEVELOPMENT-BIBLE.md
