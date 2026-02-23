# 14.0 Discovery Audit — Complete Report

> **Date:** 2026-02-17
> **Series:** 14 — Customer Contacts + PDF Generation
> **Type:** Read-only audit (NO code changes)
> **Dev Rules:** v7 (Rule 5 — audit before series)

---

## Schema Status

| Item | Status | Details |
|---|---|---|
| Customer model | EXISTS | `prisma/schema.prisma:82-103` — 8 fields + 8 relations, table `customers` |
| User model | EXISTS | `prisma/schema.prisma:668-695` — 13 fields + 8 relations, `@@map("users")` |
| CustomerUserRole enum | EXISTS | `prisma/schema.prisma:763-768` — `CUSTOMER_ADMIN`, `CUSTOMER_APPROVER`, `CUSTOMER_VIEWER`, `CUSTOM` |
| Quote→Customer FK | EXISTS | `customer_id Int?` at line 522, relation at line 547 |
| Contact model | MISSING | No dedicated contact model — contact info stored directly on `customers` |
| Address fields | STRING | Single `address String?` on customers; `project_address`/`deliveryAddress` on quotes; structured fields only on `unit_block_projects` |

---

## Customer Model — Full Field Listing

**Location:** `prisma/schema.prisma:82-103`

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | Int | Yes | `@id @default(autoincrement())` |
| `name` | String | Yes | Primary display name |
| `company` | String? | No | Company name |
| `email` | String? | No | Single contact email |
| `phone` | String? | No | Single phone number |
| `address` | String? | No | Free-text address (single string, not structured) |
| `notes` | String? | No | General notes |
| `created_at` | DateTime | Yes | `@default(now())` |
| `updated_at` | DateTime | Yes | No `@updatedAt` decorator |
| `client_tier_id` | String? | No | FK → `client_tiers` |
| `client_type_id` | String? | No | FK → `client_types` |
| `default_price_book_id` | String? | No | FK → `price_books` |

**Relations:**
- `client_tiers` → optional
- `client_types` → optional
- `price_books` → optional
- `drawings[]` → one-to-many
- `pricing_rules_engine[]` → one-to-many
- `quotes[]` → one-to-many
- `user[]` → one-to-many (portal users)
- `unitBlockProjects[]` → one-to-many

**No indexes defined.**

---

## User Model — Full Field Listing

**Location:** `prisma/schema.prisma:668-695` (mapped to `users` table)

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | Int | Yes | `@id @default(autoincrement())` |
| `email` | String | Yes | `@unique` |
| `password_hash` | String | Yes | bcrypt, salt=10 |
| `name` | String? | No | Display name |
| `created_at` | DateTime | Yes | `@default(now())` |
| `updated_at` | DateTime | Yes | No `@updatedAt` decorator |
| `customer_id` | Int? | No | FK → `customers` (portal users only) |
| `invited_at` | DateTime? | No | When portal invite was sent |
| `invited_by` | Int? | No | User ID who sent invite |
| `is_active` | Boolean | Yes | `@default(true)` |
| `last_active_at` | DateTime? | No | Last activity timestamp |
| `last_login_at` | DateTime? | No | Last login timestamp |
| `role` | UserRole | Yes | `@default(SALES_REP)` — values: `ADMIN`, `SALES_REP`, `CUSTOMER`, `CUSTOM` |
| `customer_user_role` | CustomerUserRole? | No | `CUSTOMER_ADMIN`, `CUSTOMER_APPROVER`, `CUSTOMER_VIEWER`, `CUSTOM` |
| `company_id` | Int? | No | FK → `companies` |

**User-Customer Link Mechanism:**
- Direct FK: `customer_id Int?` on `user` → `customers.id`
- No pivot table — 1:many (customer has many users)
- Portal users distinguished by `role = UserRole.CUSTOMER`
- Access level differentiated by `customer_user_role` enum

---

## Address Fields Across All Models

| Field | Model | Type | Line | Notes |
|---|---|---|---|---|
| `address` | customers | `String?` | 88 | Free-text, single string |
| `project_address` | quotes | `String?` | 524 | Free-text, single string |
| `deliveryAddress` | quotes | `String?` | 561 | `@map("delivery_address")`, single string |
| `address` | unit_block_projects | `String?` | 966 | Structured (has suburb, state, postcode) |
| `suburb` | unit_block_projects | `String?` | 967 | Part of structured address |
| `state` | unit_block_projects | `String?` | 968 | Part of structured address |
| `postcode` | unit_block_projects | `String?` | 969 | Part of structured address |

**No reusable address components exist** (no `AddressForm`, `AddressInput`, etc.).

---

## Component Status

| Component | Path | Lines | Action |
|---|---|---|---|
| UsersTab | `src/app/(dashboard)/customers/[id]/page.tsx:332-442` | 111 | EVOLVE → ContactsTab |
| CustomerUserModal | `src/app/(dashboard)/customers/[id]/page.tsx:509-749` | 240 | EVOLVE → ContactModal |
| CustomerDetail | `src/app/(dashboard)/customers/[id]/page.tsx` | 749 | MODIFY (add Locations tab, rename Users → Contacts) |
| DetailsTab | `src/app/(dashboard)/customers/[id]/page.tsx:269-328` | 60 | KEEP (may update address display) |
| QuotesTab | `src/app/(dashboard)/customers/[id]/page.tsx:446-506` | 60 | KEEP |
| NewCustomerPage | `src/app/(dashboard)/customers/new/page.tsx` | 327 | MODIFY (update portal user → contact creation) |
| EditCustomerPage | `src/app/(dashboard)/customers/[id]/edit/page.tsx` | 314 | KEEP |
| CustomerDrawings | `src/app/(dashboard)/customers/[id]/components/CustomerDrawings.tsx` | 128 | KEEP |
| CustomersListPage | `src/app/(dashboard)/customers/page.tsx` | 80 | KEEP |
| QuoteForm | `src/components/QuoteForm.tsx` | 2023 | EXTEND (add contact selector) |
| QuoteDetailClient | `src/app/(dashboard)/quotes/[id]/QuoteDetailClient.tsx` | 2489 | EXTEND (add contact selector) |
| NewQuoteWizard | `src/components/quotes/NewQuoteWizard.tsx` | 231 | EXTEND (pass contactId) |
| PortalPage | `src/app/(portal)/portal/page.tsx` | ~80 | KEEP (review after contact migration) |
| PortalQuoteDetail | `src/app/(portal)/portal/quotes/[id]/page.tsx` | ~80 | KEEP |

---

## API Route Status

| Route | Methods | Lines | Auth | Action |
|---|---|---|---|---|
| `/api/customers` | GET, POST | 123 | None | KEEP. POST creates portal user inline — review for contact creation |
| `/api/customers/[id]` | GET, PUT, DELETE | 86 | None | KEEP |
| `/api/customers/[id]/drawings` | GET | 25 | None | KEEP |
| `/api/admin/users` | GET, POST | 222 | Yes (VIEW_USERS, MANAGE_USERS) | KEEP. GET supports `?customerId` filter |
| `/api/admin/users/[id]` | GET, PUT, DELETE | 276 | Yes (VIEW_USERS, MANAGE_USERS) | KEEP |
| `/api/auth/login` | POST | 35 | None | KEEP |

### Portal User Creation Flow (Current)

1. `POST /api/customers` with `createPortalUser: true` in body
2. Inside a Prisma transaction:
   - Creates customer record
   - Generates 12-char temporary password
   - Hashes with bcrypt (salt=10)
   - Creates `user` record with `role: UserRole.CUSTOMER`, `customer_user_role`, linked by `customer_id`
3. Returns customer + `portalUser: { id, email, role }`
4. **Note:** Email invitation not implemented (TODO in code)

### Portal User Management (Current)

- **Add user:** CustomerUserModal in customer detail page → `POST /api/admin/users`
- **Edit user:** CustomerUserModal → `PUT /api/admin/users/[id]`
- **Deactivate:** Toggle via `PUT /api/admin/users/[id]` setting `isActive: false`
- **Admin Users endpoint** supports `?customerId` query param for filtering

---

## Quote-Customer Linking

| Aspect | Detail |
|---|---|
| FK field | `customer_id Int?` on `quotes` model (line 522) |
| Relation | `customers customers? @relation(fields: [customer_id], references: [id])` (line 547) |
| Required? | No — `customer_id` is optional |
| Customer dropdown | Searchable dropdown in `QuoteDetailClient.tsx` — fetches from `/api/customers` |
| Pre-selection | `/quotes/new?customerId=<id>` query param, passed through `NewQuoteWizard` |
| Pricing impact | Customer selection triggers pricing recalculation (tier/type affects pricing) |

---

## Customer Portal

| Aspect | Detail |
|---|---|
| Location | `src/app/(portal)/portal/page.tsx`, `src/app/(portal)/portal/quotes/[id]/page.tsx` |
| Layout | `src/app/(portal)/layout.tsx` |
| Auth method | `getCurrentUser()` → checks `user.role === UserRole.CUSTOMER` && `user.customerId` |
| Capabilities | Dashboard with stats, quote listing, quote detail view, quote signing |
| Status | **ACTIVELY USED** — full implementation with database queries |
| Migration risk | LOW — portal reads from `quotes` via `customer_id`, does not directly manage contacts |

---

## Seed Data

| Item | Count | Details |
|---|---|---|
| Demo customers | 4 | Gem Life, John Smith, Sarah Johnson, Premium Kitchens Pty Ltd |
| Admin user | 1 | `admin@northcoaststone.com.au` / `demo1234` |
| Portal users | 0 | No portal users created in seed (only admin) |
| Seed files | 17 | Main `seed.ts` + 16 sub-seed files |

### Demo Customers
1. **Gem Life** — Builder, Tier 1, `projects@gemlife.com.au`
2. **John Smith** — Builder, Tier 2, `john@smithbuilding.com.au`
3. **Sarah Johnson** — Direct Consumer, Tier 3, `sarah.j@email.com`
4. **Premium Kitchens Pty Ltd** — Cabinet Maker, Tier 1, `orders@premiumkitchens.com.au`

---

## Migration Plan

### 1. What Needs Renaming
- `UsersTab` component → `ContactsTab` (in `src/app/(dashboard)/customers/[id]/page.tsx:332`)
- `CustomerUserModal` → `ContactModal` (in `src/app/(dashboard)/customers/[id]/page.tsx:509`)
- Tab label "Users" → "Contacts" in the customer detail UI

### 2. What Needs New Fields
- **Customer model:** No new fields needed directly (contact info moves to separate Contact model)
- **Quote model:** Add `contact_id Int?` FK to link quotes to specific contacts (not just customers)
- **Contact model (NEW):** Fields for name, email, phone, role/title, is_primary, is_portal_user

### 3. What Needs New Tables
- **`contacts` table (NEW):**
  - `id` — Int, PK, autoincrement
  - `customer_id` — Int, FK → customers (required)
  - `name` — String (required)
  - `email` — String? (optional)
  - `phone` — String? (optional)
  - `role` — String? (optional, e.g., "Project Manager", "Site Supervisor")
  - `is_primary` — Boolean, default false
  - `is_portal_user` — Boolean, default false
  - `portal_user_id` — Int?, FK → users (links to portal user account if applicable)
  - `notes` — String?
  - `created_at` — DateTime
  - `updated_at` — DateTime

- **`customer_locations` table (NEW):** (if Locations tab is planned)
  - `id` — Int, PK, autoincrement
  - `customer_id` — Int, FK → customers
  - `label` — String (e.g., "Head Office", "Site A")
  - `address` — String
  - `suburb` — String?
  - `state` — String?
  - `postcode` — String?
  - `is_default` — Boolean, default false
  - `created_at` — DateTime
  - `updated_at` — DateTime

### 4. Data Migration Requirements
- **Existing portal users → contacts:**
  - For each `user` with `role = CUSTOMER` and `customer_id IS NOT NULL`:
    - Create a `contact` record linked to that customer
    - Set `is_portal_user = true`, `portal_user_id = user.id`
    - Copy `name`, `email` from user record
  - The `user` table is NOT modified — portal users remain as auth entities
  - The `contact` record becomes the business-facing entity

- **Existing customer contact info → contacts:**
  - For each customer with `email` or `phone`:
    - Create a primary contact record with `is_primary = true`
    - Copy `name`, `email`, `phone` from customer record
  - Decision needed: remove `email`/`phone` from customer model or keep as denormalized cache

- **Existing customer address → locations:**
  - For each customer with `address`:
    - Create a location record with `label = "Primary"`, `is_default = true`
    - Copy address text (note: unstructured → may need manual cleanup)

---

## Concerns for Series 14

### 1. `as any` Casts in Pricing Calculator
**File:** `src/lib/services/pricing-calculator-v2.ts:705-752`
- `quote as any` used to access delivery/templating fields
- Fields exist in schema (`deliveryAddress`, `deliveryDistanceKm`, etc.) but Prisma types may not include them in the query result type
- **Risk:** Adding `contact_id` to quotes could interact with this pattern
- **Action:** These casts should be resolved before or during Series 14

### 2. Customer API Routes Have No Authentication
- `GET/POST /api/customers` and `GET/PUT/DELETE /api/customers/[id]` have zero auth checks
- New contact endpoints must have proper auth from day one
- **Risk:** If contacts inherit this pattern, customer data is exposed
- **Action:** Consider adding auth middleware when creating contact routes

### 3. Portal User Email Invitation Not Implemented
- `POST /api/admin/users` has a TODO comment about email invitation (line 196)
- Creating contacts with portal access will hit the same gap
- **Risk:** Portal users created but never notified
- **Action:** Out of scope for Series 14 but worth tracking

### 4. Large Monolithic Component
- `CustomerDetail` page is 749 lines with all tabs inline
- `QuoteDetailClient` is 2489 lines
- Adding contact selector to these will increase complexity
- **Action:** Consider extracting tabs to separate files during evolution

### 5. Quote `customer_id` is Optional
- Quotes can exist without a customer, meaning `contact_id` must also be optional
- **Risk:** Orphaned contacts or inconsistent data if contact is set but customer is not
- **Action:** Enforce constraint: `contact_id` can only be set if `customer_id` is set

### 6. No Structured Address Format on Customers
- Customer `address` is a single free-text string
- `unit_block_projects` has structured address (address, suburb, state, postcode)
- **Risk:** If Locations tab needs structured addresses, existing data cannot be auto-parsed
- **Action:** New `customer_locations` table should use structured fields; migration of existing freeform addresses will be best-effort

### 7. Seed Data Has No Portal Users
- Seed creates 4 customers but 0 portal users
- **Action:** Update seed to create sample contacts (and optionally portal users) for testing

---

## Verification Checklist

- [x] All 8 audit areas documented (Schema, User-Customer Link, Users Tab, API Routes, Quote-Customer, Portal, Address Fields, Seed Data)
- [x] Every customer-related file path recorded
- [x] Line counts noted for large files: `QuoteForm.tsx` (2023), `QuoteDetailClient.tsx` (2489), `CustomerDetail page.tsx` (749)
- [x] Existing data volume estimated (4 demo customers, 1 admin user, 0 portal users in seed)
- [x] Migration risks identified (7 concerns listed)
- [x] No code changes made (read-only audit)
