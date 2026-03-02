# CLAUDE.md — Stone Henge Project Instructions

This file is read automatically by Claude Code at the start of every session.
Follow every instruction in this file before doing anything else.

---

## Step 1 — Session Startup (Run First, Every Time)

```bash
cd ~/Downloads/stonehenge-v2
source scripts/db-connect.sh
psql "$DATABASE_URL" -c "SELECT NOW();" && echo "DB connected" || echo "DB FAILED — stop and report"
```

If **DB FAILED**: stop immediately and report. Do not proceed. Do not infer answers from code alone.

## Step 2 — Read the Rulebook

```bash
cat docs/stonehenge-dev-rulebook.md
```

Every session must read the rulebook before writing any code. No exceptions.
The rulebook is currently at **v14** with **65 rules** — all non-negotiable.

---

## Project Identity

| Key | Value |
|-----|-------|
| **Project** | Stone Henge — AI-powered quote automation for stone benchtop fabrication |
| **Client** | Northcoast Stone Pty Ltd, Queensland, Australia |
| **Repo** | `Cangaroo007/stonehenge-v2` |
| **Local path** | `~/Downloads/stonehenge-v2` |
| **Tech stack** | Next.js 14, TypeScript (strict), PostgreSQL, Prisma ORM |
| **Deployment** | Railway Pro — auto-deploys from `main` branch |
| **Node version** | 20+ |

---

## Tech Stack Details

| Layer | Technology |
|-------|-----------|
| **Framework** | Next.js 14.1.0 (App Router) |
| **Language** | TypeScript 5.3+ (strict mode) |
| **Database** | PostgreSQL via Prisma ORM 5.22+ |
| **Auth** | JWT (jose) + httpOnly cookies (`stonehenge-token`), bcryptjs for passwords |
| **UI Components** | shadcn/ui pattern (Tailwind + Radix primitives) |
| **Styling** | Tailwind CSS 3.4 + tailwind-merge + clsx |
| **Icons** | Lucide React |
| **Notifications** | React Hot Toast |
| **Cloud Storage** | Cloudflare R2 (S3-compatible, via @aws-sdk/client-s3) |
| **PDF Generation** | @react-pdf/renderer + pdf-lib |
| **Image Processing** | sharp, @napi-rs/canvas |
| **AI Integration** | Anthropic SDK (@anthropic-ai/sdk) for drawing analysis |
| **Validation** | Zod |
| **Testing** | Jest + ts-jest |
| **Deployment** | Railway Pro (auto-deploy on merge to main) |

---

## Critical Rules (Always Apply)

### Never push directly to main

Always use feature branches and PRs. Auto-deploy triggers on merge to `main`.

### Array.from — never spread a Set

```typescript
// NEVER
const items = [...new Set(array)];
// ALWAYS
const items = Array.from(new Set(array));
```

### Prisma JSON — always double cast

```typescript
// Reading
const data = field as unknown as MyType;
// Writing
data: obj as unknown as Prisma.InputJsonValue
```

### Next.js 14 route params — always await

```typescript
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
}
```

### Pre-commit workflow — run every time, one at a time

```bash
npm run build
npx tsc --noEmit
git add -A
git commit -m "your message"
```

### Stop Gate

Before any push or PR, write the stop gate phrase from the rulebook.
Wait for human confirmation. Do not proceed without it.

---

## Database Rules

- `scripts/db-connect.sh` contains `DATABASE_URL` — **never commit this file**
- `.env` contains `DATABASE_URL` — **never commit this file**
- Both are in `.gitignore`
- Diagnostic prompts may run `SELECT` queries freely
- **No INSERT, UPDATE, or DELETE** without showing the exact SQL to the human and receiving explicit written approval in that session

---

## Australian Spelling (Always)

| Use | Never |
|-----|-------|
| metre | meter |
| lineal metre | linear meter |
| square metre | square meter |
| colour | color |
| organisation | organization |
| optimiser | optimizer |
| authorised | authorized |
| visualisation | visualization |

---

## Codebase Structure

```
stonehenge-v2/
├── CLAUDE.md                  # This file — session instructions
├── package.json               # Scripts, dependencies
├── next.config.js             # Next.js config (server actions, sharp, R2 images)
├── tsconfig.json              # TypeScript strict mode, @/* path alias
├── tailwind.config.js         # Tailwind theme configuration
├── jest.config.ts             # Jest + ts-jest, @/ path mapping
├── railway.toml               # Railway build/deploy config
├── docker-compose.yml         # Local PostgreSQL dev setup
├── postcss.config.js          # PostCSS for Tailwind
├── prisma/
│   ├── schema.prisma          # Database schema (30+ models)
│   ├── migrations/            # SQL migration files
│   ├── seed-production.js     # Production seed data
│   ├── seed-pricing.ts        # Pricing configuration seed
│   └── seed-pricing-settings.ts
├── scripts/
│   ├── db-connect.sh          # DB credentials (GITIGNORED)
│   ├── install-hooks.sh       # Git hook installer (pre-push)
│   └── hooks/
│       └── pre-push           # Enforces AUDIT_TRACKER + SYSTEM_STATE updates
├── docs/
│   ├── stonehenge-dev-rulebook.md  # Mandatory rulebook v14 (65 rules)
│   ├── AUDIT_TRACKER.md       # Living issue tracker (must update every PR)
│   ├── SYSTEM_STATE.md        # Living system snapshot (must update every PR)
│   └── [audit reports, architecture docs]
├── src/
│   ├── middleware.ts           # Auth middleware for /api/* routes
│   ├── app/
│   │   ├── layout.tsx         # Root layout (Inter font, Toast provider)
│   │   ├── page.tsx           # Root redirect → /dashboard or /login
│   │   ├── login/             # Login page
│   │   ├── (dashboard)/       # Authenticated dashboard (AppShell + UnitProvider)
│   │   │   ├── layout.tsx     # Auth guard, sidebar, header
│   │   │   ├── dashboard/     # Main dashboard
│   │   │   ├── quotes/        # Quote CRUD, builder, print, job-view
│   │   │   ├── customers/     # Customer management
│   │   │   ├── materials/     # Materials & suppliers
│   │   │   ├── templates/     # Quote templates
│   │   │   ├── optimize/      # Slab optimiser tool
│   │   │   ├── settings/      # Company settings
│   │   │   └── admin/         # Pricing admin, user management
│   │   ├── (portal)/          # Customer portal (role-gated, CUSTOMER only)
│   │   │   └── portal/        # Portal views for customers
│   │   └── api/               # 143 REST API endpoints
│   │       ├── auth/          # login, logout (public)
│   │       ├── quotes/        # Quote CRUD, calculate, optimise, PDF, versions
│   │       ├── customers/     # Customer CRUD, contacts, locations
│   │       ├── materials/     # Material & supplier management
│   │       ├── drawings/      # Upload, thumbnail, file serving
│   │       ├── admin/pricing/ # Pricing config (tiers, edges, cutouts, rules)
│   │       ├── company/       # Company settings, logo
│   │       ├── templates/     # Template CRUD, clone, mappings
│   │       ├── unit-blocks/   # Bulk quote generation
│   │       ├── health/        # Health checks (public)
│   │       └── [other]/       # distance, storage, suggestions, etc.
│   ├── components/
│   │   ├── layout/            # AppShell, CommandMenu, Header, Sidebar
│   │   ├── quotes/            # 60+ quote components (builder, pieces, rooms, etc.)
│   │   ├── customers/         # Contact/location tabs
│   │   ├── drawings/          # Drawing viewer, thumbnails
│   │   ├── pricing/           # Machine, tier, price mapping management
│   │   ├── slab-optimizer/    # Optimisation visualisation
│   │   ├── visual-layout/     # Layout tool with SVG canvas
│   │   ├── unit-block/        # Unit block upload
│   │   ├── ui/                # Base UI components (button, card, input, etc.)
│   │   └── [other]/           # Drawing analysis, signatures, PDF
│   ├── hooks/
│   │   ├── useQuoteOptions.ts        # Quote options management (15+ methods)
│   │   ├── useUnsavedChanges.ts      # Browser beforeunload warning
│   │   ├── useAutoSlabOptimiser.ts   # Auto-optimisation logic
│   │   ├── useUndoRedo.ts            # Undo/redo state management
│   │   ├── useDrawingUrl.ts          # Drawing URL management
│   │   └── useQuoteKeyboardShortcuts.ts
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── auth.ts            # JWT auth (login, logout, requireAuth, RBAC)
│   │   ├── permissions.ts     # Role-based access control (7 roles, 21+ permissions)
│   │   ├── logger.ts          # Structured logging (LOG_LEVEL env var)
│   │   ├── audit.ts           # Audit trail logging
│   │   ├── utils.ts           # cn(), formatCurrency(), generateQuoteNumber()
│   │   ├── contexts/
│   │   │   └── UnitContext.tsx # METRIC/IMPERIAL unit system provider
│   │   ├── storage/
│   │   │   └── r2.ts          # Cloudflare R2 wrapper (upload, download, presigned URLs)
│   │   ├── services/          # 60+ business logic services (~17,000 lines)
│   │   │   ├── pricing-calculator-v2.ts    # Main pricing engine
│   │   │   ├── pricing-rules-engine.ts     # Pricing rules evaluation
│   │   │   ├── slab-optimizer.ts           # FFD bin-packing algorithm
│   │   │   ├── multi-slab-calculator.ts    # Multi-material optimisation
│   │   │   ├── quote-version-service.ts    # Version management & rollback
│   │   │   ├── drawing-analyzer.ts         # AI-powered drawing analysis
│   │   │   ├── manufacturing-export.ts     # Cut list & manufacturing export
│   │   │   ├── quote-lifecycle-service.ts  # Quote status workflows
│   │   │   ├── template-applier.ts         # Apply templates to quotes
│   │   │   └── [40+ more services]
│   │   ├── types/             # TypeScript type definitions
│   │   │   ├── pricing.ts     # PricingOptions, CalculationResult, breakdowns
│   │   │   ├── shapes.ts      # Shape types (RECTANGLE, L_SHAPE, U_SHAPE)
│   │   │   └── [10+ more]
│   │   ├── utils/             # Utility functions
│   │   │   ├── units.ts       # METRIC/IMPERIAL conversions
│   │   │   ├── edge-utils.ts  # Edge type helpers
│   │   │   └── debounce.ts
│   │   ├── constants/         # Slab sizes, room presets
│   │   ├── actions/           # Server actions
│   │   ├── prompts/           # AI prompt templates
│   │   └── saas/              # SaaS subscription logic
│   └── types/
│       ├── slab-optimization.ts  # Optimisation input/output types
│       └── google-maps.d.ts
└── public/                    # Static assets
```

---

## Key Architecture Decisions

### Quote Component Tree (Rule 1)

There is exactly ONE component tree for quotes — all routes render through `QuoteLayout`:

| Route | Component | Mode |
|-------|-----------|------|
| `/quotes/new` | `NewQuoteWizard` (Drawing / Template / Manual) | — |
| `/quotes/[id]` | `QuoteDetailClient` -> `QuoteLayout` | View |
| `/quotes/[id]?mode=edit` | `QuoteDetailClient` -> `QuoteLayout` | Edit |
| `/quotes/[id]/builder` | **Redirect** -> `/quotes/[id]?mode=edit` | — |

**`QuoteForm.tsx` is RETIRED** — must not be imported by any route.

### Authentication Flow

1. User submits email/password to `/api/auth/login`
2. Password verified with bcryptjs against DB hash
3. JWT token created (7-day expiry) using `jose`
4. Token set in httpOnly cookie `stonehenge-token`
5. Middleware validates JWT on all `/api/*` routes (except public ones)
6. `requireAuth(allowedRoles?)` in route handlers for role checks

### Roles & Permissions

7 roles: `ADMIN`, `SALES_MANAGER`, `SALES_REP`, `FABRICATOR`, `READ_ONLY`, `CUSTOM`, `CUSTOMER`

Customer sub-roles: `CUSTOMER_ADMIN`, `CUSTOMER_APPROVER`, `CUSTOMER_VIEWER`

21+ granular permissions checked via `hasPermission()` / `hasPermissionAsync()`

### Public API Routes (no auth required)

- `/api/auth/login`
- `/api/auth/logout`
- `/api/health`
- `/api/company/logo/view`

---

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DATABASE_URL` | PostgreSQL connection string | Yes |
| `JWT_SECRET` | JWT signing key | Yes (production) |
| `R2_ENDPOINT` or `R2_ACCOUNT_ID` | Cloudflare R2 endpoint | For file storage |
| `R2_ACCESS_KEY_ID` | R2 access key | For file storage |
| `R2_SECRET_ACCESS_KEY` | R2 secret key | For file storage |
| `R2_BUCKET_NAME` | R2 bucket (default: `stonehenge-drawings`) | For file storage |
| `LOG_LEVEL` | Logging level: debug/info/warn/error/none | No (default: info) |
| `COMPANY_ADDRESS` | Default company address for delivery calcs | No |
| `NODE_ENV` | production/development | Auto-set |

---

## npm Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | `prisma generate && next build` — **run before every commit** |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npx tsc --noEmit` | Type check — **run before every commit** |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:seed` | Run Prisma seed |
| `npm run seed:pricing` | Seed pricing data |
| `npm run seed:pricing-settings` | Seed pricing settings |

---

## Git Workflow

### Branch naming

Always use feature branches: `feat/your-feature-name` or `fix/your-fix-name`

### Pre-push hook

Installed via `npm install` (triggers `scripts/install-hooks.sh`). Blocks pushes on `fix/*` and `feat/*` branches if `docs/AUDIT_TRACKER.md` and `docs/SYSTEM_STATE.md` were not modified. Re-install manually with: `sh scripts/install-hooks.sh`

### Commit workflow

```bash
npm run build              # Must pass with 0 errors
npx tsc --noEmit           # Must pass with 0 errors
# Update docs/AUDIT_TRACKER.md and docs/SYSTEM_STATE.md
git add -A
git commit -m "feat: descriptive message — update AUDIT_TRACKER + SYSTEM_STATE"
```

### PR workflow

```bash
git checkout -b feat/your-feature-name
# ... make changes ...
npm run build && npx tsc --noEmit
git add -A
git commit -m "feat: descriptive message"
git push origin feat/your-feature-name
gh pr create --base main --head feat/your-feature-name \
  --title "feat: your title" --body "description"
```

Avoid em-dashes and special characters in PR titles — they break zsh.

---

## Golden Rules (Quick Reference)

1. **Extend, never replace** — never restructure existing code when adding features
2. **Read before writing** — understand the full handler/component before modifying
3. **One route, one tree** — all quote routes render through `QuoteLayout`
4. **Build must pass** — `npm run build` + `npx tsc --noEmit` before every commit
5. **Australian spelling** — metre, colour, optimiser, authorised
6. **Small prompts** — each prompt independently deployable
7. **Test the live URL** — verify changes at actual production URLs after deploy
8. **Empty quote = $0** — zero pieces = $0.00 for ALL costs
9. **Every button works** — no silent no-ops; hide or show "Coming soon"
10. **Pricing Bible is law** — all calculation logic must match Pricing Bible v1.3
11. **Business logic outside UI** — never inside conditionally-rendered panels
12. **Verify with real data** — not just grep; check browser, API, database
13. **Git archaeology first** — `git log`, `git diff` before guessing at fixes
14. **Re-trigger after calculator fixes** — stored calculations have OLD values
15. **Trace the code path** — confirm the function actually executes before fixing it
16. **Grep-verify deletions** — confirm ZERO matches after removing old code
17. **Build passing != feature working** — also verify in browser
18. **Null-guard all nullable state** — early return before property access
19. **Segments, not pieces** — UI displays optimiser placements, not original pieces
20. **Stop Gates are absolute** — no continuation without explicit human approval

---

## Banned Components (Rule 44)

These patterns are permanently banned. Their presence in any file is a build-blocking error:

- `EdgePolishSelection`
- `EdgeSelector` component
- `EdgeDropdown` component
- `EdgeManager` component
- `EdgeConfigPanel`
- `edge.*checkbox` in quotes UI
- Per-side dropdown edge lists

All replaced by `PieceVisualEditor` SVG click interaction.

---

## Living Documentation (Must Update Every PR)

### `docs/AUDIT_TRACKER.md`

Single source of truth for all known issues. Update on every PR:
- Resolved issue: move from open to closed with PR number and date
- New issue discovered: add as open with severity and file
- Chore with no audit relevance: add a note row

### `docs/SYSTEM_STATE.md`

Living snapshot of what exists in the codebase. Update the relevant section:
- Schema changes -> section 1
- API route changes -> section 2
- Page route changes -> section 3
- Service changes -> section 4
- Quote component changes -> section 5
- Shape system changes -> section 6
- Production verification -> section 10

---

## Database Models (Prisma Schema Overview)

Key models in `prisma/schema.prisma`:

| Model | Purpose |
|-------|---------|
| `user` | System users with roles and permissions |
| `customers` | Client companies |
| `customer_contacts` | Contacts per customer |
| `customer_locations` | Delivery locations |
| `quotes` | Quote header (status, customer, totals) |
| `quote_pieces` | Individual stone pieces with dimensions, edges, shape |
| `quote_rooms` | Room groupings within a quote |
| `quote_options` | Multiple pricing options per quote |
| `quote_versions` | Version history snapshots |
| `materials` | Stone materials with pricing |
| `suppliers` | Material suppliers |
| `drawings` | Uploaded drawing files (stored in R2) |
| `client_tiers` | Customer pricing tiers |
| `client_types` | Customer type classifications |
| `edge_types` | Edge profile definitions |
| `cutout_types` | Cutout type definitions |
| `thickness_options` | Available thickness options |
| `service_rates` | Service rate configurations |
| `pricing_rules_engine` | Dynamic pricing rules |
| `price_books` | Price book configurations |
| `machine_profiles` | Machine capability profiles |
| `tenant_settings` | Tenant-wide configuration |
| `audit_logs` | Audit trail for all actions |
| `piece_relationships` | Piece-to-piece relationships |

---

## Pricing System

The pricing engine is the most critical subsystem. Key files:

- `src/lib/services/pricing-calculator-v2.ts` — Main calculator
- `src/lib/services/pricing-rules-engine.ts` — Rule evaluation
- `src/lib/types/pricing.ts` — Type definitions
- Pricing Bible v1.3 is the source of truth for all calculation logic

### Key pricing rules

- Cutting uses full perimeter (all 4 sides); for L/U shapes: sum of decomposed leg perimeters
- Polishing applies ONLY to finished (exposed) edges — never to join faces
- Edge profiles are ADDITIONAL cost on top of base polishing
- 40mm thickness = 20mm slab + lamination edge strips (mandatory)
- Mitred edges -> Pencil Round profile only
- All rates are tenant-configurable via Pricing Admin — no hardcoded prices
- Currency: AUD with GST

---

## L/U Shape Rules

L/U shapes are the most complex domain. Two fundamental rules:

**Cutting (Rule A):** All faces of all decomposed legs — includes join faces
**Finishing (Rule B):** Only outer exposed faces — join faces are never polished

| Shape | Finishable Edges |
|-------|-----------------|
| RECTANGLE | 4: top, right, bottom, left |
| L_SHAPE | 6: top, left, r_top, inner, r_btm, bottom |
| U_SHAPE | 8: top_left, outer_left, bottom, outer_right, top_right, inner_right, back_inner, inner_left |

Rectangle edges stored in DB columns; L/U edges stored in `shape_config.edges` JSON.

---

## Path Alias

`@/*` maps to `./src/*` (configured in tsconfig.json and jest.config.ts).

```typescript
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';
```

---

## Local Path Reference

The project is always at: `~/Downloads/stonehenge-v2`

Never reference: `~/stonehenge` or `~/stonehenge-v2`

---

This file is committed to the repo and read by Claude Code every session.
Real credentials live in `scripts/db-connect.sh` and `.env` — both gitignored.
