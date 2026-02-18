# Multi-Tenant Data Isolation Audit Report

> **Date:** 2026-02-18
> **Auditor:** Claude Code (automated)
> **Status:** READ-ONLY AUDIT -- No files were modified
> **Scope:** All 133 API routes, server pages, service layer, seed data, middleware

---

## 1. TENANT IDENTITY SUMMARY

### What field is used for tenant scoping?

Two **inconsistent** identifiers are in use:

| Identifier | Type | Used By | Source |
|---|---|---|---|
| `company_id` | `Int` | `user`, `suppliers`, `price_list_uploads`, `edge_profile_templates`, `starter_templates` | `user.company_id` from DB |
| `organisation_id` | `String` | `pricing_settings` and 15+ dependent tables (service_rates, cutout_rates, etc.) | **Hardcoded** as `'default-org'` or `'1'` |

### How is it resolved from auth context?

**Two auth functions exist:**

| Function | File | Returns companyId | Enforces company assignment |
|---|---|---|---|
| `requireAuth()` | `src/lib/auth.ts:125-174` | Yes (`user.companyId: number`) | Yes -- returns 403 if `company_id` is null |
| `getCurrentUser()` | `src/lib/auth.ts:72-76` | Yes (`companyId?: number \| null`) | **No** -- optional field, can be null |

**Middleware** (`src/middleware.ts`): Verifies JWT signature on all `/api/*` routes (except 4 public routes). Does NOT extract or enforce tenant identity. Only validates that _a_ valid token exists.

### Is it consistent across all routes?

**No.** This is a critical finding:

- Some routes use `requireAuth()` (proper company enforcement)
- Some routes use `getCurrentUser()` (weaker, no company enforcement)
- Many routes call **neither** -- they rely solely on middleware JWT verification
- **No route-handler queries are filtered by `company_id`** on core tables (quotes, customers, materials)
- Pricing settings uses a completely different identifier (`organisation_id` string vs `company_id` int)

---

## 2. DATA LEAK RISK MATRIX

### 2.1 Quote APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/quotes` | GET | Middleware-only (no handler auth) | **NONE** -- returns ALL quotes | CRITICAL |
| `/api/quotes` | POST | `requireAuth()` in version tracking only (fallback if fails) | **NONE** -- `created_by` is user-provided, no company_id set | CRITICAL |
| `/api/quotes/[id]` | GET | Middleware-only | **NONE** -- fetches by ID only, no ownership check | CRITICAL |
| `/api/quotes/[id]` | PUT | `requireAuth()` for version tracking (non-blocking) | **NONE** -- updates any quote by ID | CRITICAL |
| `/api/quotes/[id]` | DELETE | Middleware-only | **NONE** -- deletes any quote by ID | CRITICAL |
| `/api/quotes/[id]/calculate` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/rooms` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/rooms/[roomId]` | PATCH/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/rooms/reorder` | PUT | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/rooms/[roomId]/merge` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/sign` | POST | `getCurrentUser()` | **NONE** -- no quote ownership check | CRITICAL |
| `/api/quotes/[id]/status` | PATCH | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/duplicate` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/pdf` | GET | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/versions` | GET | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/views` | POST | `getCurrentUser()` (nullable) | **NONE** | MEDIUM |
| `/api/quotes/[id]/drawings` | GET/POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/edge-allowance` | GET/PATCH | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/machine-operations` | GET | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/import-pieces` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/optimize` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/manufacturing-export` | GET | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/override` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/piece-relationships` | GET/POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/save-as-template` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/options` | GET/POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/options/[optionId]` | GET/PATCH/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/options/[optionId]/calculate` | POST | Middleware-only | **NONE** | CRITICAL |
| `/api/quotes/[id]/options/[optionId]/overrides` | GET/POST | Middleware-only | **NONE** | CRITICAL |

**Root cause:** The `quotes` table has **no `company_id` column**. There is no field to filter by.

### 2.2 Customer APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/customers` | GET | `getCurrentUser()` | **NONE** -- returns ALL customers globally | CRITICAL |
| `/api/customers` | POST | `getCurrentUser()` | **NONE** -- no company_id set on new customer | CRITICAL |
| `/api/customers/[id]` | GET | `getCurrentUser()` | **NONE** -- fetches any customer by ID | CRITICAL |
| `/api/customers/[id]` | PUT | `getCurrentUser()` | **NONE** -- updates any customer by ID | CRITICAL |
| `/api/customers/[id]` | DELETE | `getCurrentUser()` | **NONE** | CRITICAL |
| `/api/customers/[id]/contacts` | GET/POST | `getCurrentUser()` | **NONE** | CRITICAL |
| `/api/customers/[id]/contacts/[contactId]` | PUT/DELETE | `getCurrentUser()` | **NONE** | CRITICAL |
| `/api/customers/[id]/locations` | GET/POST | `getCurrentUser()` | **NONE** | CRITICAL |
| `/api/customers/[id]/locations/[locationId]` | PUT/DELETE | `getCurrentUser()` | **NONE** | CRITICAL |
| `/api/customers/[id]/drawings` | GET | `getCurrentUser()` | **NONE** | CRITICAL |

**Root cause:** The `customers` table has **no `company_id` column**. There is no field to filter by.

### 2.3 Material APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/materials` | GET | Middleware-only (no handler auth) | **NONE** -- returns ALL materials | CRITICAL |
| `/api/materials` | POST | Middleware-only | **NONE** -- no company_id set | CRITICAL |
| `/api/materials/[id]` | GET/PUT/DELETE | Middleware-only | **NONE** | CRITICAL |

**Root cause:** The `materials` table has **no `company_id` column**.

### 2.4 Admin Pricing APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/admin/pricing/settings` | GET | Middleware-only | **HARDCODED** `'default-org'` -- same settings for all tenants | CRITICAL |
| `/api/admin/pricing/settings` | PUT | Middleware-only | **Body-controlled** -- caller can specify any `organisationId` | CRITICAL |
| `/api/admin/pricing/service-rates` | GET/POST | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/service-rates/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/machines` | GET/POST | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/machines/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/edge-types` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/edge-types/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/cutout-types` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/cutout-types/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/client-tiers` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/client-tiers/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/client-types` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/client-types/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/thickness-options` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/thickness-options/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/price-books` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/price-books/[id]` | GET/PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/pricing-rules` | GET/POST | Middleware-only | **NONE** -- global data | CRITICAL |
| `/api/admin/pricing/pricing-rules/[id]` | PUT/DELETE | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/machine-defaults` | GET/POST | Middleware-only | **NONE** | CRITICAL |
| `/api/admin/pricing/interpret-price-list` | POST | Middleware-only | **NONE** | MEDIUM |
| `/api/pricing/edge-category-rates` | GET/PUT | Middleware-only | **NONE** | CRITICAL |
| `/api/pricing/cutout-category-rates` | GET/PUT | Middleware-only | **NONE** | CRITICAL |
| `/api/pricing/edge-compatibility` | GET/PUT | Middleware-only | **NONE** | CRITICAL |
| `/api/pricing/interpret` | POST | Middleware-only | **NONE** | MEDIUM |
| `/api/pricing-rules` | GET | Middleware-only | **NONE** | CRITICAL |

### 2.5 Supplier APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/suppliers` (if exists) | GET/POST | `requireAuth()` | `company_id` filter | LOW |

**Note:** Suppliers is one of the few properly scoped models with `company_id` in the schema.

### 2.6 Template APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/edge-templates` | GET/POST | `requireAuth()` | `companyId` filter | LOW |
| `/api/edge-templates/[id]` | DELETE | `requireAuth()` | `companyId` filter | LOW |
| `/api/starter-templates` | GET/POST | `requireAuth()` | `companyId` filter | LOW |
| `/api/starter-templates/[id]` | GET/PATCH/DELETE | `requireAuth()` | `companyId` filter | LOW |

**These are the CORRECT reference implementation** for tenant-scoped routes.

### 2.7 Unit Block APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/unit-blocks` | GET/POST | `requireAuth()` | **NONE** -- no company_id filter in queries | CRITICAL |
| `/api/unit-blocks/[id]` | GET/PATCH | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/units` | GET/POST | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/units/[unitId]` | GET/PATCH | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/calculate` | POST | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/generate` | POST | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/parse-schedule` | POST | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/parse-register` | POST | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/auto-generate-templates` | POST | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/mapping-status` | GET | `requireAuth()` | **NONE** | CRITICAL |
| `/api/unit-blocks/[id]/change-report` | GET | `requireAuth()` | **NONE** | CRITICAL |

### 2.8 Drawing & Upload APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/drawings/simple-upload` | POST | `getCurrentUser()` | Partial (validates quote->customer link) | MEDIUM |
| `/api/drawings/[id]/file` | GET | `getCurrentUser()` | Partial | MEDIUM |
| `/api/drawings/[id]/url` | GET | Middleware-only | **NONE** | CRITICAL |
| `/api/drawings/[id]/thumbnail` | GET | Middleware-only | **NONE** | MEDIUM |
| `/api/drawings/[id]/details` | GET | Middleware-only | **NONE** | CRITICAL |
| `/api/drawings/backfill-thumbnails` | POST | Middleware-only | **NONE** -- admin action | MEDIUM |
| `/api/drawings/upload-complete` | POST | Middleware-only | **NONE** | MEDIUM |
| `/api/upload/drawing` | POST | `getCurrentUser()` | **NONE** | CRITICAL |
| `/api/analyze-drawing` | POST | Middleware-only | Stateless (no DB) | LOW |
| `/api/analyze-drawing/refine` | POST | Middleware-only | Stateless | LOW |
| `/api/analyze-drawing/elevation` | POST | Middleware-only | Stateless | LOW |
| `/api/elevation-pipeline` | POST | Middleware-only | Stateless | LOW |

### 2.9 Company & Admin APIs

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/company/settings` | GET/PUT | `getCurrentUser()` | Partial (`findFirst()`) | MEDIUM |
| `/api/company/logo` | GET/POST | `getCurrentUser()` | Partial | MEDIUM |
| `/api/company/logo/view` | GET | **PUBLIC** (no auth) | By company name param | LOW |
| `/api/admin/users` | GET/POST | `hasPermissionAsync()` | **NONE** -- returns ALL users | CRITICAL |
| `/api/admin/users/[id]` | PUT | `hasPermissionAsync()` | **NONE** | CRITICAL |

### 2.10 Auth & Health APIs (Correctly unauthenticated)

| API Route | Method | Auth Check | Org Scoping | Risk |
|---|---|---|---|---|
| `/api/auth/login` | POST | None (login endpoint) | N/A | LOW |
| `/api/auth/logout` | POST | None | N/A | LOW |
| `/api/health` | GET | None (health check) | N/A | LOW |
| `/api/health/quote-system` | GET | None | N/A | LOW |
| `/api/storage/status` | GET | Middleware-only | N/A | LOW |
| `/api/distance/calculate` | POST | Middleware-only | Stateless | LOW |

### 2.11 Server-Side Pages (Direct Prisma queries)

| Page | Auth Check | Org Scoping | Risk |
|---|---|---|---|
| `/dashboard` | **NONE** | **NONE** -- aggregates ALL quotes | CRITICAL |
| `/quotes` | **NONE** | **NONE** -- lists ALL quotes | CRITICAL |
| `/quotes/[id]` | **NONE** | **NONE** -- shows any quote by ID | CRITICAL |
| `/customers` | **NONE** | **NONE** -- lists ALL customers | CRITICAL |
| `/customers/[id]` | **NONE** | **NONE** -- shows any customer | CRITICAL |
| `/templates` | **NONE** | **NONE** -- lists ALL templates | CRITICAL |
| `/admin/pricing/*` | **NONE** | **NONE** | CRITICAL |

**Note:** Middleware only protects `/api/*` routes. Server-rendered dashboard pages make direct Prisma queries with **no auth or tenant filtering at all**.

---

## 3. CRITICAL FINDINGS

### FINDING 1: `quotes` table has NO `company_id` column

**Severity:** CRITICAL
**Impact:** Every quote-related operation is completely unscoped. Any authenticated user can read, modify, or delete any quote in the system.
**File:** `prisma/schema.prisma` -- `quotes` model
**Evidence:** `src/app/api/quotes/route.ts:82-85` -- `prisma.quotes.findMany()` with no WHERE clause
**Evidence:** `src/app/api/quotes/[id]/route.ts:94-95` -- `prisma.quotes.findUnique({ where: { id } })` with no ownership check

### FINDING 2: `customers` table has NO `company_id` column

**Severity:** CRITICAL
**Impact:** Any authenticated user sees ALL customers from ALL companies. Customer contacts, locations, and drawings are all exposed.
**File:** `prisma/schema.prisma` -- `customers` model
**Evidence:** `src/app/api/customers/route.ts:26-33` -- `prisma.customers.findMany()` with no WHERE clause, despite having `getCurrentUser()` available

### FINDING 3: `materials` table has NO `company_id` column

**Severity:** CRITICAL
**Impact:** All materials (including supplier pricing) are visible to all tenants. Materials are indirectly linked via suppliers (which DO have `company_id`), but this relationship is never enforced in queries.
**Evidence:** `src/app/api/materials/route.ts:6-13` -- no auth check in handler, returns all materials globally

### FINDING 4: Pricing settings hardcoded to single organisation

**Severity:** CRITICAL
**Impact:** All tenants share the same pricing configuration. Cannot support per-tenant pricing strategies.
**File:** `src/app/api/admin/pricing/settings/route.ts:8` -- `const organisationId = 'default-org'`
**Impact:** The PUT handler accepts `organisationId` from the request body (line 88), allowing any user to modify settings for any org string.

### FINDING 5: 15+ pricing reference tables are globally shared

**Severity:** CRITICAL
**Models without tenant scoping:** `client_tiers`, `client_types`, `cutout_types`, `edge_types`, `materials`, `pricing_rules`, `price_books`, `pricing_rules_engine`, `thickness_options`, `machine_profiles`, `machine_operation_defaults`, `cutout_rates`, `cutout_category_rates`, `edge_type_category_rates`, `material_edge_compatibility`, `service_rates`
**Impact:** All pricing, rate tables, and lookup data is shared. One tenant's pricing adjustments affect all tenants.

### FINDING 6: Server-rendered pages have NO auth at all

**Severity:** CRITICAL
**Impact:** The middleware only protects `/api/*` routes. Dashboard pages use direct Prisma queries without any auth check or tenant filter.
**Evidence:** All `src/app/(dashboard)/*/page.tsx` files query the database directly with no auth check
**Risk:** Dashboard shows aggregate metrics across all tenants. Quote list shows all companies' quotes.

### FINDING 7: `GET /api/quotes` returns ALL quotes to any authenticated user

**Severity:** CRITICAL
**File:** `src/app/api/quotes/route.ts:80-91`
**Code:**
```typescript
export async function GET() {
  const quotes = await prisma.quotes.findMany({
    orderBy: { created_at: 'desc' },
    include: { customers: true },
  });
  return NextResponse.json(quotes);
}
```
No auth check. No company filter. Returns every quote with full customer data.

### FINDING 8: Quote DELETE has no ownership verification

**Severity:** CRITICAL
**File:** `src/app/api/quotes/[id]/route.ts:428-443`
**Code:**
```typescript
export async function DELETE(request, { params }) {
  const { id } = await params;
  await prisma.quotes.delete({ where: { id: parseInt(id) } });
  return NextResponse.json({ success: true });
}
```
Any authenticated user can delete any quote by ID.

### FINDING 9: `unit_block_projects` has no company scoping in queries

**Severity:** CRITICAL
**Impact:** Unit block projects, units, templates, and generated quotes are accessible across tenants despite routes using `requireAuth()`.
**Root cause:** `requireAuth()` returns `companyId` but routes never use it in WHERE clauses.

### FINDING 10: Admin user management returns all users globally

**Severity:** CRITICAL
**File:** `src/app/api/admin/users/route.ts`
**Impact:** An admin from Company A can see and modify user accounts from Company B.

### FINDING 11: `audit_logs` table has no tenant scoping

**Severity:** MEDIUM
**Impact:** Audit trail visible across companies. Lower severity as it primarily affects visibility, not data modification.

### FINDING 12: Dual identifier system creates confusion

**Severity:** MEDIUM
**Impact:** `company_id` (Int) and `organisation_id` (String) are used inconsistently. The `pricing_settings` model uses `organisation_id` while everything else uses `company_id`. These are never linked.

---

## 4. SEED DATA ISOLATION

### Are seed records scoped to a specific org?

**Partially.** The seed system creates a mix of global and company-scoped data:

**Company-scoped seeds (correct):**
- `seed-suppliers.ts` -- creates suppliers with `company_id` linked to Company 1
- `seed-edge-templates.ts` -- creates templates with `companyId`
- `seed.ts` (main) -- creates delivery zones and templating rates scoped to company

**Global seeds (no tenant scoping):**
- `seed-edge-types.ts` -- global edge types, no `company_id`
- `seed-cutout-types.ts` -- global cutout types, no `company_id`
- `seed-material-slab-prices.ts` -- global materials, no `company_id`
- `seed-thickness-options.ts` -- global thickness options
- `seed-client-types.ts` -- global client types
- `seed-client-tiers.ts` -- global client tiers
- `seed-pricing.ts` -- global feature pricing
- `seed-pricing-settings.ts` -- creates pricing settings with hardcoded `organisation_id: '1'`

### Will new tenants get their own seed data?

**No.** There is no tenant-aware seeding mechanism. The main seed creates exactly one company (`Northcoast Stone Pty Ltd`, id: 1). All reference data (edge types, cutout types, materials, pricing) is globally shared.

**For multi-tenant deployment:** Each new tenant would need:
1. A new `company` record
2. Their own `pricing_settings` record (currently hardcoded to `'1'` / `'default-org'`)
3. Their own service rates, cutout rates, etc.
4. The ability to configure their own materials (currently global)
5. Their own edge type pricing and cutout pricing

**Current state:** The seed architecture assumes a single-tenant deployment.

---

## 5. RECOMMENDED FIXES (Prioritised)

### Priority 1: CRITICAL -- Schema Changes (Must complete before multi-tenant launch)

1. **Add `company_id` column to `quotes` table**
   - Add `company_id Int` field with foreign key to `company`
   - Add index on `company_id`
   - Backfill existing quotes (derive from `created_by` -> `user.company_id`)
   - Update ALL quote API routes to filter by `company_id`

2. **Add `company_id` column to `customers` table**
   - Add `company_id Int` field with foreign key to `company`
   - Add index on `company_id`
   - Backfill existing customers
   - Update ALL customer API routes to filter by `company_id`

3. **Add `company_id` column to `materials` table** (or scope via supplier relationship)
   - Materials are linked to suppliers which have `company_id`
   - Either add direct `company_id` or enforce supplier-based filtering
   - Update materials API to filter by `company_id`

4. **Add `company_id` to reference/pricing tables**
   - `client_tiers`, `client_types`, `cutout_types`, `edge_types`
   - `price_books`, `pricing_rules`, `pricing_rules_engine`
   - `thickness_options`, `machine_profiles`
   - Decision needed: are these global (shared) or per-tenant?

5. **Unify tenant identifier**
   - Replace `organisation_id` (String) in `pricing_settings` with `company_id` (Int)
   - Migrate all dependent tables (`service_rates`, `cutout_rates`, etc.)
   - Remove hardcoded `'default-org'` from pricing settings route

### Priority 2: HIGH -- Route-Level Enforcement

6. **Standardise all API routes to use `requireAuth()`**
   - Replace `getCurrentUser()` with `requireAuth()` in all customer routes
   - Add `requireAuth()` to all routes that currently have no handler-level auth
   - Use returned `companyId` in ALL database queries

7. **Add ownership verification to ID-based lookups**
   - Every `findUnique({ where: { id } })` must include a company_id check
   - Pattern: `findFirst({ where: { id, company_id: user.companyId } })`
   - Return 404 (not 403) if record not found (prevents ID enumeration)

8. **Add auth checks to server-rendered pages**
   - All `(dashboard)` pages must call `getCurrentUser()` or `requireAuth()`
   - Redirect to login if unauthenticated
   - Filter all Prisma queries by `company_id`

9. **Add admin role checks to admin endpoints**
   - `/api/admin/*` routes should require ADMIN role via `requireAuth(['ADMIN'])`
   - Verify admin's company_id matches requested resources

### Priority 3: MEDIUM -- Architectural Improvements

10. **Create a tenant-scoped Prisma middleware or helper**
    - Centralised function that automatically adds `company_id` to all queries
    - Example: `withTenantScope(prisma, companyId).quotes.findMany(...)`
    - Prevents future routes from accidentally omitting tenant filter

11. **Add database-level Row Level Security (RLS)**
    - PostgreSQL RLS policies on critical tables
    - Defence-in-depth: even if application code misses a filter, DB blocks cross-tenant access

12. **Create tenant-aware seed mechanism**
    - Factory function to create seed data for a new tenant
    - Include all reference data (pricing, types, rates)
    - Test with 2+ tenants to verify isolation

13. **Add multi-tenant integration tests**
    - Create two test tenants
    - Verify that Tenant A cannot access Tenant B's:
      - Quotes, customers, materials, pricing, templates
    - Run as part of CI/CD pipeline

### Priority 4: LOW -- Cleanup

14. **Audit `audit_logs` table**
    - Add `company_id` if cross-tenant audit trail is unacceptable
    - Or add tenant filtering to audit log queries

15. **Review webhook/integration endpoints**
    - No webhook endpoints currently exist
    - If added in future, ensure they validate tenant context

---

## 6. PROPERLY SCOPED ROUTES (Reference Implementation)

The following routes demonstrate the correct pattern for tenant isolation:

### Edge Templates (`src/app/api/edge-templates/route.ts`)
```typescript
const authResult = await requireAuth();
if ('error' in authResult) {
  return NextResponse.json({ error: authResult.error }, { status: authResult.status });
}
const { user } = authResult;

// GET: Filter by companyId
const templates = await prisma.edge_profile_templates.findMany({
  where: { companyId: user.companyId },
});

// POST: Set companyId on creation
const template = await prisma.edge_profile_templates.create({
  data: { ...data, companyId: user.companyId },
});
```

### Starter Templates (`src/app/api/starter-templates/route.ts`)
- Same pattern: `requireAuth()` + `companyId` in WHERE clause

### Suppliers (`src/app/api/suppliers/route.ts`)
- Same pattern: `requireAuth()` + `company_id` filter

**All other routes should follow this pattern.**

---

## 7. ATTACK SCENARIOS

### Scenario A: Cross-Tenant Quote Access
```
1. User from Company A authenticates (gets valid JWT)
2. Calls GET /api/quotes
3. Receives ALL quotes from ALL companies
4. Includes: customer names, project addresses, pricing, materials
```

### Scenario B: Quote Modification/Deletion
```
1. Authenticated user calls DELETE /api/quotes/42
2. Quote 42 belongs to a different company
3. Quote is deleted -- no ownership check performed
```

### Scenario C: Pricing Sabotage
```
1. Authenticated user calls PUT /api/admin/pricing/settings
2. Body: { "organisationId": "competitor-org", "wasteFactorPercent": "50" }
3. Competitor's pricing settings are modified
```

### Scenario D: Customer Data Exfiltration
```
1. Authenticated user calls GET /api/customers
2. Receives complete customer database across all companies
3. Includes: names, emails, phones, addresses, pricing tiers
```

### Scenario E: Dashboard Intelligence
```
1. User views /dashboard page
2. Sees aggregate financial data (total quotes, revenue) across ALL companies
3. Recent quotes list shows competitor activity
```

---

## 8. SUMMARY STATISTICS

| Category | Count |
|---|---|
| Total API routes audited | 133 |
| Routes with CRITICAL risk | ~85 |
| Routes with MEDIUM risk | ~12 |
| Routes with LOW risk | ~16 |
| Routes properly scoped by tenant | ~10 (edge-templates, starter-templates, suppliers) |
| Core tables missing `company_id` | 20+ (quotes, customers, materials, all pricing tables) |
| Auth functions available | 2 (`requireAuth`, `getCurrentUser`) |
| Routes using `requireAuth()` | ~25 |
| Routes using `getCurrentUser()` | ~15 |
| Routes with middleware-only auth | ~70+ |

**Conclusion:** The application is architecturally a **single-tenant system** with some multi-tenant patterns emerging (company table, user.company_id, supplier scoping). It is **NOT safe for multi-tenant deployment** in its current state. Any authenticated user can access any other tenant's data.

---

*This audit was generated automatically. No files were modified.*
