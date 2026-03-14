# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Run this first — every session, no exceptions
```bash
cd ~/Downloads/stonehenge-v2
cat docs/stonehenge-dev-rulebook.md
```
The rulebook contains 66+ non-negotiable rules. Read it before writing any code.

## What is Stone Henge?

Stone Henge is a multi-tenant SaaS quoting platform for stone fabrication companies (benchtops, splashbacks). Built with **Next.js 14 (App Router)**, **Prisma + PostgreSQL** (hosted on Railway), **Tailwind CSS**, and **TypeScript**. It is a **live production platform** used by real users at Northcoast Stone — rule violations cause real business harm.

## Build & Development Commands

```bash
npm run dev              # Start dev server
npm run build            # prisma generate && next build (MUST pass before commit)
npx tsc --noEmit         # Type check (MUST pass before commit)
npm run lint             # ESLint
npx jest                 # Run all tests
npx jest path/to/file.test.ts  # Run single test
```

**Both `npm run build` and `npx tsc --noEmit` must pass before every commit.** No exceptions.

### Database
```bash
npm run db:migrate               # prisma migrate deploy
npm run db:seed                  # Seed database
npm run seed:pricing             # Seed pricing data
npm run seed:pricing-settings    # Seed pricing settings
```

## Database Queries — How This Works

Claude Code cannot reach the Railway database directly (sandbox blocks outbound connections).

For any query that requires DB data:
1. Claude Code writes the exact SQL
2. Sean runs it in his local terminal:
   `psql "postgresql://postgres:PJKvvXsaFIRMCyDrDRmSBndDXadvuRIb@switchyard.proxy.rlwy.net:40455/railway" -c "YOUR SQL HERE"`
3. Sean pastes the results back into Claude Code
4. Claude Code proceeds based on actual output only — never infers or assumes

## Architecture

### Tech Stack
- **Framework:** Next.js 14 (App Router) with `@/*` path alias → `./src/*`
- **Database:** Prisma ORM + PostgreSQL (57 models in `prisma/schema.prisma`)
- **Auth:** JWT (jose) via cookies, middleware-enforced on all API routes
- **Storage:** Cloudflare R2 (drawings, images)
- **Styling:** Tailwind CSS
- **Deployment:** Railway (see `railway.toml`)

### Route Groups
- `src/app/(dashboard)/` — Main app (quotes, customers, materials, templates, settings, admin). Protected by auth in layout.
- `src/app/(portal)/` — Customer-facing portal
- `src/app/api/` — API routes (25+ resource directories)
- `src/app/login/` — Auth page

### Quote Component Tree (CRITICAL — Rule 1)
There is exactly ONE component tree for quotes. All routes render through `QuoteLayout`.

| Route | Renders | Mode |
|-------|---------|------|
| `/quotes/new` | `NewQuoteWizard` | — |
| `/quotes/[id]` | `QuoteDetailClient` → `QuoteLayout` | View |
| `/quotes/[id]?mode=edit` | `QuoteDetailClient` → `QuoteLayout` | Edit |

**`QuoteForm.tsx` is RETIRED.** It must not be imported by any route.

### Key Directories
- `src/lib/services/` — Business logic (50+ services: pricing calculator, slab optimiser, drawing analyser, quote lifecycle, PDF generation, etc.)
- `src/lib/types/` — Shared TypeScript types (shapes, pricing, quotes, etc.)
- `src/lib/auth.ts` — Auth helpers (`requireAuth`, `getCurrentUser`, `verifyQuoteOwnership`)
- `src/lib/db.ts` — Singleton Prisma client
- `src/components/quotes/` — Quote UI components
- `src/components/pricing/` — Pricing UI components
- `src/lib/constants/` — Constants
- `src/lib/contexts/` — React contexts (e.g. `UnitContext`)

### Auth Pattern
- Middleware (`src/middleware.ts`) checks JWT cookie on all non-public API routes
- API routes use `requireAuth(allowedRoles?)` from `src/lib/auth.ts`
- Multi-tenant: all queries must scope by `companyId` from the authenticated user

### Pricing System
- All prices are tenant-configurable via Pricing Admin — **never hardcode dollar amounts**
- Pricing Bible v1.3 is the source of truth for calculation logic
- Main calculator: `src/lib/services/pricing-calculator-v2.ts`
- Pricing rules engine: `src/lib/services/pricing-rules-engine.ts`

## Critical Patterns (Railway Build Failures)

```typescript
// ✅ Set from Array
const items = Array.from(new Set(array));
// ❌ NEVER: [...new Set(array)]

// ✅ Prisma JSON double cast
const data = someJsonField as unknown as MyType;
// ❌ NEVER: someJsonField as MyType

// ✅ Next.js 14 params
const { id } = await params;
// ❌ NEVER: params.id
```

## Key Rules Summary

- **NEVER run git add, git commit, or git push** without explicit human instruction. Sean handles all git operations. The only exception is when Sean explicitly types "please commit and push".
- **NEVER run `npm run build`**. Sean runs all build checks locally.
- **Extend, never replace** — add code alongside existing code, never restructure in the same change
- **Australian spelling** in all UI text (metre, colour, organisation, etc.)
- **Business logic outside UI** — never inside conditionally-rendered panels (Rule 23)
- **Empty quote = $0.00** — no phantom charges
- **Schema changes MUST include migrations** (Rule 26)
- **Prisma client NEVER in browser bundle** (Rule 27)
- **Both AUDIT_TRACKER.md and SYSTEM_STATE.md updated on every merge** (Rule 28)
- **Every button must work** — no silent no-ops (Rule 15)
- Avoid em-dashes (—) and special characters in PR/commit titles — they break zsh

## Git Workflow

Never push directly to main. Always use feature branches:
```bash
git checkout -b feat/your-feature-name
npm run build && npx tsc --noEmit
git add -A && git commit -m "feat: descriptive message"
git push origin feat/your-feature-name
gh pr create --base main --head feat/your-feature-name --title "feat: title" --body "description"
```

## All project rules and state live in:
- `docs/stonehenge-dev-rulebook.md` — 66+ rules, all non-negotiable
- `docs/SYSTEM_STATE.md` — living codebase snapshot
- `docs/AUDIT_TRACKER.md` — all known open issues
