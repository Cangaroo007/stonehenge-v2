# Stonehenge V2 - Complete Knowledge Base

> **Version**: 2.0 | **Last Updated**: February 2026 | **Stack**: Next.js 14.1.0, Prisma 5, PostgreSQL, React 18, Tailwind CSS
> **Deployment**: Railway (Railpack) | **Storage**: Cloudflare R2 | **AI**: Claude Sonnet 4.5

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture & Tech Stack](#2-architecture--tech-stack)
3. [Authentication & Permissions](#3-authentication--permissions)
4. [Dashboard & Navigation](#4-dashboard--navigation)
5. [Quote Management](#5-quote-management)
6. [Quote Builder](#6-quote-builder)
7. [Customer Management](#7-customer-management)
8. [Materials Management](#8-materials-management)
9. [Pricing Engine](#9-pricing-engine)
10. [Slab Optimizer](#10-slab-optimizer)
11. [Drawing Analysis (AI)](#11-drawing-analysis-ai)
12. [Customer Portal](#12-customer-portal)
13. [Unit Block Projects](#13-unit-block-projects)
14. [Version History](#14-version-history)
15. [Company Settings & Branding](#15-company-settings--branding)
16. [PDF Generation](#16-pdf-generation)
17. [Calculators & Services](#17-calculators--services)
18. [Database Schema](#18-database-schema)
19. [API Reference](#19-api-reference)
20. [Feature Status Matrix](#20-feature-status-matrix)

---

## 1. System Overview

Stonehenge V2 is a quote management and production planning system for stone/countertop fabricators. It handles the complete workflow from customer enquiry through quoting, approval, and production planning.

### Core Capabilities
- **Quote Management** - Create, edit, calculate, and track quotes with rooms and pieces
- **AI Drawing Analysis** - Upload drawings (PDF/images) and extract piece specifications using Claude AI
- **Pricing Engine** - Multi-tier pricing with rules, price books, client types, and volume discounts
- **Slab Optimization** - Pack pieces onto stone slabs using First Fit Decreasing algorithm with lamination support
- **Customer Portal** - Customer-facing portal for viewing quotes, tracking status, and electronic signatures
- **User Management** - Role-based access control with granular permissions
- **Production Planning** - Cut list generation, material consolidation, and machine profile management
- **Unit Block Projects** - Group quotes for multi-unit developments with volume discounts (prototype)

---

## 2. Architecture & Tech Stack

### Stack
| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14.1.0 (App Router) |
| Language | TypeScript (strict mode) |
| Database | PostgreSQL via Prisma 5 ORM |
| Frontend | React 18, Tailwind CSS, Headless UI |
| Authentication | JWT (7-day tokens) in httpOnly cookies |
| File Storage | Cloudflare R2 (S3-compatible) |
| AI Services | Anthropic Claude Sonnet 4.5 |
| Distance API | Google Maps Distance Matrix |
| PDF Generation | @react-pdf/renderer |
| Deployment | Railway (Railpack) |

### Project Structure
```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (dashboard)/           # Internal staff pages
│   │   ├── dashboard/         # Home dashboard
│   │   ├── quotes/            # Quote list, detail, builder
│   │   ├── customers/         # Customer management
│   │   ├── materials/         # Materials list
│   │   ├── optimize/          # Standalone slab optimizer
│   │   ├── admin/             # Pricing & user admin
│   │   └── settings/          # App settings
│   ├── (portal)/              # Customer portal
│   └── api/                   # 66 API endpoints
├── components/                # Shared React components
└── lib/
    ├── calculators/           # Pricing calculators
    ├── services/              # Business logic services
    ├── auth.ts                # Authentication
    ├── permissions.ts         # RBAC
    ├── audit.ts               # Audit logging
    ├── db.ts                  # Prisma client singleton
    └── utils.ts               # Utilities
```

### Build & Deploy
```bash
# Build command
npx prisma generate && npm run build

# Start command
next start

# Database URL
DATABASE_PUBLIC_URL (Railway PostgreSQL)
```

---

## 3. Authentication & Permissions

### Authentication
- **Method**: Email/password with bcrypt hashing
- **Token**: JWT (HS256, 7-day expiry) stored in httpOnly cookie `stonehenge-token`
- **Secret**: `JWT_SECRET` environment variable
- **Login flow**: Verify credentials → Create token → Set cookie → Update `last_login_at`
- **Demo credentials**: admin@northcoaststone.com.au / demo1234

### User Roles

| Role | Description | Permissions |
|------|------------|-------------|
| ADMIN | Full system access | All 25 permissions |
| SALES_MANAGER | Team management | 14 permissions (manage customers, quotes, materials, pricing) |
| SALES_REP | Own quotes/customers | 8 permissions (create/edit quotes, view customers) |
| FABRICATOR | Production planning | 6 permissions (view quotes, run optimization, export cut lists) |
| READ_ONLY | Viewing only | 5 permissions (view quotes, customers, materials) |
| CUSTOM | Database-defined | Selected from 25 available permissions |
| CUSTOMER | Portal user | Portal-specific roles below |

### Customer Portal Roles

| Role | Capabilities |
|------|-------------|
| CUSTOMER_ADMIN | Full customer control, manage users |
| CUSTOMER_APPROVER | View quotes, approve/sign |
| CUSTOMER_VIEWER | View quotes only |

### All Permissions
User Management: `MANAGE_USERS`, `VIEW_USERS`
Customer Management: `MANAGE_CUSTOMERS`, `VIEW_CUSTOMERS`
Quote Management: `CREATE_QUOTES`, `EDIT_QUOTES`, `DELETE_QUOTES`, `VIEW_ALL_QUOTES`, `VIEW_OWN_QUOTES`, `APPROVE_QUOTES`
Materials & Pricing: `MANAGE_MATERIALS`, `VIEW_MATERIALS`, `MANAGE_PRICING`, `VIEW_PRICING`
Optimization: `RUN_OPTIMIZATION`, `VIEW_OPTIMIZATION`, `EXPORT_CUTLISTS`
Reports: `VIEW_REPORTS`, `EXPORT_DATA`
System: `MANAGE_SETTINGS`, `VIEW_AUDIT_LOGS`, `UPLOAD_FILES`
Customer Portal: `MANAGE_CUSTOMER_USERS`, `DOWNLOAD_QUOTES`, `VIEW_PROJECT_UPDATES`

---

## 4. Dashboard & Navigation

### Main Dashboard (`/dashboard`)
Displays key metrics:
- Total Quotes (all time)
- Quotes This Month
- Total Value (sum of all quote totals)
- Average Quote Value
- Recent Quotes table (last 5 with customer, status, total)

### Sidebar Navigation
| Item | Route | Icon |
|------|-------|------|
| Dashboard | /dashboard | Home |
| Quotes | /quotes | Document |
| Unit Block | /quotes/unit-block | Building |
| Customers | /customers | Users |
| Materials | /materials | Swatch |
| Optimizer | /optimize | Square |
| Pricing | /admin/pricing | Settings |
| Users | /admin/users | Users |
| Settings | /settings | Cog |

Features:
- Collapsible sidebar (desktop)
- Mobile hamburger drawer
- Command palette (Cmd+K) for quick navigation
- Active route highlighting

---

## 5. Quote Management

### Quote Lifecycle
```
draft → sent → viewed → signed → approved → completed → archived
```

### Quote Structure
```
Quote
├── Quote Number (Q-00001 auto-generated)
├── Customer (optional)
├── Project Name / Address
├── Status
├── Price Book
├── Rooms[]
│   ├── Room Name (Kitchen, Bathroom, etc.)
│   └── Pieces[]
│       ├── Name, Description
│       ├── Dimensions (length_mm, width_mm, thickness_mm)
│       ├── Material (linked or text name)
│       ├── Edges (top, bottom, left, right - edge type names)
│       ├── Cutouts (JSON array)
│       ├── Features[] (edges, cutouts with pricing)
│       ├── Costs (material_cost, features_cost, total_cost)
│       └── Sort Order
├── Drawing Analysis (optional)
├── Files[]
├── Signatures[]
├── Slab Optimization (optional)
├── Notes / Internal Notes
└── Totals (subtotal, tax_rate, tax_amount, total)
```

### Quotes List Page (`/quotes`)
- Table view with: Quote #, Customer, Project, Total, Status, Date, Valid Until
- Status badges with colour coding
- Actions: View detail, Edit in builder

### Quote Detail Page (`/quotes/[id]`)
- Full read-only view of quote with all rooms, pieces, and pricing
- Drawing analysis results with confidence indicators
- Signature history with date, signer name, IP address
- Download PDF, Edit, Delete actions
- Per-piece breakdown: Base Price, Tier Discount, Final Cost

### Quote Creation (`/quotes/new`)
- Customer selection with tier/type
- Project name and address
- Drawing upload with AI analysis (drag-drop or file picker)
- Manual piece entry with dimensions, materials, edges
- Room management
- Save as draft or sent

---

## 6. Quote Builder

### Overview (`/quotes/[id]/builder`)
The quote builder is the primary editing interface with advanced features for modifying quotes.

### Layout
- **Header**: Quote number, save status, action buttons
- **Tabs**: Pieces & Pricing | Version History
- **Main Area**: Piece list or room grouping view
- **Side Panels**: Drawing reference, delivery/templating, pricing summary

### Piece Management
- Add, edit, duplicate, delete pieces
- Drag-and-drop reorder
- Room grouping view (alternative to flat list)
- Import pieces from drawing analysis
- Per-piece edge selection (polishing profiles)
- Cutout management
- Material assignment

### Loaded Configuration Data
- Materials (all active)
- Edge types (all active)
- Cutout types (all active)
- Thickness options
- Machine profiles

### Pricing Integration
- Real-time pricing calculation
- Tier-based discounts
- Delivery and templating costs
- Override capability

### Drawing Import
- Upload drawing files
- AI analysis extracts pieces with dimensions
- Confidence indicators on detected features
- Import selected pieces into quote

---

## 7. Customer Management

### Customer Fields
| Field | Type | Required |
|-------|------|----------|
| Name | String | Yes |
| Company | String | No |
| Email | String | No |
| Phone | String | No |
| Address | String | No |
| Notes | String | No |
| Client Type | Relation | No |
| Client Tier | Relation | No |
| Default Price Book | Relation | No |

### Customer Detail Page (`/customers/[id]`)
Four tabs:
1. **Details** - Contact info, pricing classification
2. **Users** - Portal users with access levels, activate/deactivate
3. **Quotes** - All customer quotes
4. **Drawings** - Customer uploaded drawings

### Portal User Creation
When creating a customer, optionally create a portal user:
- Auto-generates temporary password
- Assigns customer portal role (Admin, Approver, Viewer)
- Shows credentials in success toast

---

## 8. Materials Management

### Material Fields
| Field | Type | Description |
|-------|------|-------------|
| name | String | Material name |
| collection | String | Grouping (Granite, Quartz, etc.) |
| description | String | Optional description |
| price_per_sqm | Decimal | Price per square metre |
| price_per_slab | Decimal | Price per whole slab (optional) |
| slab_length_mm | Int | Standard slab length (optional) |
| slab_width_mm | Int | Standard slab width (optional) |
| is_active | Boolean | Active status |

### Materials Page (`/materials`)
- Materials grouped by collection
- Table per collection: Name, Price per m², Status
- Create/edit functionality

---

## 9. Pricing Engine

### Pricing Architecture

The pricing system has multiple layers:

```
Price Books
  └── contain Pricing Rules (via price_book_rules)
        └── Pricing Rules Engine
              ├── Client Type conditions
              ├── Client Tier conditions
              ├── Min/Max quote value conditions
              ├── Thickness conditions
              ├── Custom Edge rates
              ├── Custom Cutout rates
              └── Custom Material rates
```

### Material Pricing Strategies
1. **PER_SQUARE_METER_USED** - Charge only for material used (no wastage)
2. **PER_SQUARE_METER_WITH_WASTAGE** - Charge for material + standard wastage % (default 15%)
3. **PER_WHOLE_SLAB** - Charge for complete slabs regardless of usage
4. **PER_WHOLE_SLAB_WITH_REMNANT_CREDIT** - Slab charge minus usable remnant credit

### Service Types & Units
| Service | Available Units |
|---------|----------------|
| Cutting | Linear Metre, Square Metre, Fixed Per Piece |
| Polishing | Linear Metre, Square Metre, Fixed Per Piece |
| Installation | Square Metre, Linear Metre, Hourly, Fixed Per Piece |
| Waterfall End | Fixed Per Piece |
| Templating | Fixed, Per Kilometre, Square Metre |
| Delivery | Fixed Zone, Per Kilometre, Weight Based |

### Service Rates
Each service rate has:
- `rate20mm` - Rate for 20mm thickness
- `rate40mm` - Rate for 40mm thickness
- `minimumCharge` - Minimum charge amount

### Edge Types
Edge profiles with thickness-variant pricing:
- Pencil Round, Bullnose, Ogee, Beveled, Curved Finished Edge, etc.
- Each has: `baseRate`, `rate20mm`, `rate40mm`, `minimumCharge`, `minimumLength`
- Optional: `code` (e.g., 'PR', 'BN'), `isCurved`

### Cutout Types
- Hotplate, GPO, Tap Hole, Drop-in Sink, Undermount Sink
- Flush Mount Cooktop, Basin, Drainer Grooves, Other
- Each has a `baseRate`

### Thickness Options
- Configurable thickness values (e.g., 20mm, 40mm)
- Each has a `multiplier` (e.g., 1.00 for 20mm, 1.50 for 40mm)
- One marked as default

### Client Types & Tiers
- **Client Types**: Classification (Cabinet Maker, Builder, Direct Consumer, etc.)
- **Client Tiers**: Pricing tiers (Tier 1, Tier 2, Tier 3)
  - Each tier can have a `discount_matrix` (JSON) and `custom_price_list` (JSON)
  - Priority ordering for rule application

### Price Books
- Named collections of pricing rules
- Assigned as default to customers
- Category: general, retail, trade
- Default thickness setting

### Pricing Rules Engine
Rules can apply adjustments based on:
- Client type and/or tier
- Specific customer
- Quote value range (min/max)
- Thickness value
- Adjustment types: percentage, fixed, multiplier
- Applies to: materials, edges, cutouts, or all
- Custom rates per edge type, cutout type, or material

### Admin Pricing Page (`/admin/pricing`)
10 tabs for managing all pricing configuration:
1. Edge Types
2. Cutout Types
3. Thickness Options
4. Strip Configurations
5. Client Types
6. Client Tiers
7. Tiers (TierManagement component)
8. Machines (MachineManagement component)
9. Pricing Rules
10. Price Books

---

## 10. Slab Optimizer

### Algorithm
- **Method**: First Fit Decreasing (FFD) with Guillotine space management
- **Approach**: Sort pieces by area (largest first), place using bottom-left algorithm

### Features
- Configurable slab dimensions (width, height in mm)
- Configurable kerf width (default 8mm)
- Optional rotation support
- **Lamination strip generation** for 40mm+ thickness pieces:
  - Mitre strips: Finished Thickness + Kerf + 5mm wide
  - Standard polish strips: 40mm wide
  - Strips placed alongside parent pieces
- Waste calculation per slab and overall
- Unplaced piece tracking

### Standalone Optimizer Page (`/optimize`)
- Load pieces from existing quote
- Manually add/edit pieces (label, width, height, thickness, edges)
- Configure slab settings
- Run optimization
- Visual slab layout display
- Export options: Save to Quote, Export CSV Cut List, Print

### In-Builder Optimization
- Accessible from quote builder
- Runs on current quote pieces
- Results stored in `slab_optimizations` table
- Visual display in OptimizationDisplay component

### Cut List Export
- CSV format with: Slab #, Piece ID, Label, Type, Parent Piece, Width, Height, X/Y Position, Rotated
- Summary section with totals
- Lamination breakdown section
- Structured data format also available

### Machine Profiles
- Named machine configurations
- `kerf_width_mm` (default 8mm)
- `max_slab_length_mm`, `max_slab_width_mm` (optional constraints)
- One marked as default
- Active/inactive status

---

## 11. Drawing Analysis (AI)

### Pipeline
1. **Upload**: PDF or image file (JPEG, PNG, WebP, GIF)
   - Images compressed to max 2MB before upload
   - PDFs up to 32MB
2. **Classification**: AI categorises the document
   - JOB_SHEET, HAND_DRAWN, CAD_DRAWING, MIXED
   - Confidence score (0-1)
3. **Extraction**: AI extracts piece specifications
   - Dimensions (length, width, thickness) with confidence levels
   - Edge profiles per side with confidence
   - Cutouts (type, dimensions) with confidence
   - Room assignments
4. **Clarification**: Generates follow-up questions
   - Categories: DIMENSION, CUTOUT, EDGE, MATERIAL
   - Priority: CRITICAL, IMPORTANT, NICE_TO_KNOW
5. **Import**: User selects pieces to import into quote

### AI Model
- Claude Sonnet 4.5 (`claude-sonnet-4-5-20250929`)
- Category-specific extraction prompts
- Markdown JSON response parsing

### Storage
- Files stored in Cloudflare R2
- Drawing metadata in `drawings` table
- Analysis results in `quote_drawing_analyses` table (JSON)
- PDF thumbnails auto-generated and cached

---

## 12. Customer Portal

### Portal Homepage (`/portal`)
- Personalised welcome banner
- Stats grid: Total Quotes, Pending, Accepted, Total Value
- Quotes table with signature status indicators
- Help/contact section

### Portal Quote Detail (`/portal/quotes/[id]`)
- Read-only quote view (rooms, pieces, totals)
- Data filtered by customer_id (security)
- View tracking (silent)
- Electronic signature (if CUSTOMER_APPROVER or CUSTOMER_ADMIN)
- PDF download (if permitted)

### Electronic Signatures
- Signature pad for capturing signatures
- Records: signer name, email, title, IP address, user agent
- Document hash for verification
- Document version tracking
- Stored in `quote_signatures` table

---

## 13. Unit Block Projects

### Current Status: **Prototype (localStorage only)**

### Concept
Group multiple quotes together for multi-unit developments (apartment blocks, townhouses) with automatic volume-based pricing discounts.

### Creation Flow (3-Step Wizard)
1. **Project Details**: Name, Type (Apartments/Townhouses/Commercial/Other), Customer
2. **Select Quotes**: Pick existing quotes, see real-time area/discount calculations
3. **Review**: Summary with pricing breakdown, create project

### Volume Discount Tiers
| Tier | Area Range | Discount |
|------|-----------|----------|
| Small | 0 - 50 m² | 0% |
| Medium | 50 - 150 m² | 5% |
| Large | 150 - 500 m² | 10% |
| Enterprise | 500+ m² | 15% |

### Project Detail Page (`/quotes/unit-block/[id]`)
- Stats cards: Units, Total Area, Volume Tier, Grand Total
- Pricing summary breakdown
- Units list with individual quote details
- Edit Project (stub - "coming soon")
- Export PDF (stub - "coming soon")

### What's Missing
- **No database persistence** - Uses localStorage, data lost on cache clear
- **No construction plan upload** - No file upload in the unit block flow
- **No API endpoints** - No `/api/unit-blocks` routes exist
- **Edit/export not functional** - Buttons show "coming soon"
- **No cross-device access** - localStorage is browser-only

### Backend Calculator (Ready but Not Connected)
`unit-block-calculator.ts` exists with:
- Volume tier calculation
- Volume discounts for materials and fabrication
- Phased delivery scheduling
- Consolidated material planning
- Individual vs project pricing comparison

---

## 14. Version History

### Current Status: **Service layer complete, database model planned**

### Capabilities
- **Snapshot creation**: Captures complete quote state (rooms, pieces, features, pricing, delivery, notes)
- **Change detection**: Field-level changes with old/new values, piece additions/removals/modifications
- **Change summaries**: Human-readable descriptions of changes
- **Rollback**: Restore quote to any previous version
- **Comparison**: Side-by-side diff of any two versions

### Change Types
`CREATED`, `UPDATED`, `ROLLED_BACK`, `SENT_TO_CLIENT`, `CLIENT_APPROVED`, `CLIENT_REJECTED`, `CLIENT_VIEWED`, `PRICING_RECALCULATED`, `STATUS_CHANGED`

### UI Components
- **VersionHistoryTab** in quote builder
- **VersionDiffView** for comparing versions
- API routes: `/api/quotes/[id]/versions`, `/api/quotes/[id]/versions/[version]`, `/api/quotes/[id]/versions/compare`

### Limitation
The `quote_versions` model is not yet in the Prisma schema. Version service code uses `as any` type assertions. Version data may not persist until the migration is added.

---

## 15. Company Settings & Branding

### Company Fields
| Field | Description | Default |
|-------|-------------|---------|
| name | Company name | - |
| website | Company website | - |
| primary_color | Brand colour (hex) | #1e40af |
| logo_storage_key | R2 storage key for logo | - |
| quote_intro_text_1-3 | Quote introduction paragraphs | - |
| quote_please_note | "Please note" section | - |
| quote_terms_text_1-4 | Terms and conditions sections | - |
| quote_validity_days | Quote validity period | 30 |
| deposit_percent | Deposit percentage | 50% |
| terms_url | URL to full terms | - |
| signature_name | Signatory name on quotes | - |
| signature_title | Signatory title on quotes | - |
| default_unit_system | METRIC or IMPERIAL | METRIC |

### Logo Management
- Upload via POST `/api/company/logo` (R2 storage)
- Serve via GET `/api/company/logo/view`
- Delete via DELETE `/api/company/logo`

### Settings Page (`/settings`)
Currently MVP - mostly read-only display. Links to `/settings/company` for editing.

---

## 16. PDF Generation

### Quote PDF (`/api/quotes/[id]/pdf`)
Two-page PDF document:
1. **Cover Page**: Company logo, quote header, customer details, introduction text
2. **Breakdown Page**: Rooms and pieces table, pricing, terms, signature block

Uses `@react-pdf/renderer` for server-side PDF generation.

---

## 17. Calculators & Services

### Quote Calculator (`src/lib/calculators/index.ts`)
Main orchestrator that runs all sub-calculations:
```
QuoteCalculator.create(quoteId)
  ├── Material Calculator (area × price × thickness multiplier × waste)
  ├── Edge Calculator (linear metres × rate by thickness)
  ├── Cutout Calculator (count × rate)
  ├── Service Calculator (cutting, polishing, installation)
  ├── Join Calculator (for oversized pieces)
  ├── Delivery Calculator (zone/distance based)
  ├── Templating Calculator (distance based)
  ├── Pricing Rules Application
  └── Tax Calculation
```
- Caching with 5-minute TTL
- Parallel calculation of independent components
- Support for piece-level and quote-level overrides

### Material Calculator (`material-calculator.ts`)
- PER_SLAB and PER_SQUARE_METRE strategies
- Waste factor (default 15%)
- Slab count estimation

### Enhanced Material Calculator (`material-calculator-enhanced.ts`)
Four pricing strategies:
1. Per Square Metre Used (no wastage)
2. Per Square Metre With Wastage (standard %)
3. Per Whole Slab
4. Per Whole Slab With Remnant Credit
- Wastage reporting for customer transparency
- Mitre strip width calculation

### Edge Calculator (`edge-calculator.ts`)
- Thickness-variant pricing (20mm vs 40mm rates)
- Minimum charge enforcement
- Minimum length enforcement
- Grouping by edge type and thickness

### Flexible Service Calculator (`service-calculator-flexible.ts`)
- All service types with multiple unit options
- Thickness-based rate selection
- Waterfall edge detection
- Join estimation for oversized pieces (>3200mm)

### Slab Optimizer (`src/lib/services/slab-optimizer.ts`)
- First Fit Decreasing algorithm
- Bottom-left placement
- Guillotine space management
- Lamination strip generation for 40mm+ pieces
- Waste calculation per slab

### Multi-Slab Calculator (`multi-slab-calculator.ts`)
Join planning for oversized pieces:
- Strategies: NONE, LENGTHWISE, WIDTHWISE, MULTI_JOIN
- Optimal split point calculation
- Centre join avoidance
- Join cost at ~$75/metre

### Drawing Analyzer (`drawing-analyzer.ts`)
AI pipeline for extracting piece specifications from drawings.
See [Drawing Analysis](#11-drawing-analysis-ai) section.

### AI Price Interpreter (`ai-price-interpreter.ts`)
Interpret uploaded price lists (CSV/spreadsheet):
- Maps to internal categories (SLAB, CUTTING, POLISHING, CUTOUT, DELIVERY, INSTALLATION)
- Detects thickness variants
- Confidence scoring
- Australian spelling enforced (Metre, not Meter)

### Distance Service (`distance-service.ts`)
- Google Maps Distance Matrix API integration
- Zone-based delivery pricing
- Per-km rate calculation
- Mock data fallback if API key not configured

### Quote Version Service (`quote-version-service.ts`)
See [Version History](#14-version-history) section.

### Audit Logging (`src/lib/audit.ts`)
Non-blocking audit trail:
- Actions: created, updated, deleted, viewed, signed, login, logout, overrides
- Entity types: quote, customer, user, material, pricing_rule, optimization, system
- Records: IP address, user agent, JSON changes
- Quote view tracking, login/logout timestamps

---

## 18. Database Schema

### Models (27 total)

#### Core Business
| Model | Table | Description |
|-------|-------|-------------|
| quotes | quotes | Main quote records |
| quote_rooms | quote_rooms | Rooms within quotes |
| quote_pieces | quote_pieces | Individual pieces |
| piece_features | piece_features | Features on pieces |
| customers | customers | Customer records |
| materials | materials | Stone/material inventory |

#### Pricing
| Model | Table | Description |
|-------|-------|-------------|
| pricing_rules_engine | pricing_rules_engine | Advanced pricing rules |
| pricing_rules | pricing_rules | Legacy pricing rules |
| price_books | price_books | Price book templates |
| price_book_rules | price_book_rules | Links rules to books |
| pricing_rule_edges | pricing_rule_edges | Custom edge rates per rule |
| pricing_rule_cutouts | pricing_rule_cutouts | Custom cutout rates per rule |
| pricing_rule_materials | pricing_rule_materials | Custom material rates per rule |
| pricing_settings | pricing_settings | Org-level pricing config |
| service_rates | service_rates | Service rates by type |
| cutout_rates | cutout_rates | Cutout rates per settings |

#### Configuration
| Model | Table | Description |
|-------|-------|-------------|
| edge_types | edge_types | Edge profile definitions |
| cutout_types | cutout_types | Cutout type definitions |
| thickness_options | thickness_options | Thickness value options |
| machine_profiles | machine_profiles | Machine cutting profiles |
| client_types | client_types | Customer classification types |
| client_tiers | client_tiers | Pricing tier levels |

#### Users & Auth
| Model | Table | Description |
|-------|-------|-------------|
| user | **users** (@@map) | User accounts - `prisma.user` NOT `prisma.users` |
| user_permissions | user_permissions | Permission assignments |
| companies | companies | Multi-tenant company data |

#### Files & Tracking
| Model | Table | Description |
|-------|-------|-------------|
| drawings | drawings | Drawing/file uploads |
| quote_files | quote_files | Files attached to quotes |
| quote_drawing_analyses | quote_drawing_analyses | AI analysis results |
| quote_signatures | quote_signatures | Electronic signatures |
| quote_views | quote_views | Quote view tracking |
| slab_optimizations | slab_optimizations | Optimization results |
| audit_logs | audit_logs | Audit trail |
| settings | settings | Global key-value settings |

### Enums
```
UserRole: ADMIN, SALES_MANAGER, SALES_REP, FABRICATOR, READ_ONLY, CUSTOM, CUSTOMER
CustomerUserRole: CUSTOMER_ADMIN, CUSTOMER_APPROVER, CUSTOMER_VIEWER, CUSTOM
Permission: (25 values - see Authentication section)
MaterialPricingBasis: PER_SLAB, PER_SQUARE_METRE
ServiceType: CUTTING, POLISHING, INSTALLATION, WATERFALL_END, TEMPLATING, DELIVERY
ServiceUnit: LINEAR_METRE, SQUARE_METRE, FIXED, PER_SLAB, PER_KILOMETRE
UnitSystem: METRIC, IMPERIAL
CutoutRateCategory: HOTPLATE, GPO, TAP_HOLE, DROP_IN_SINK, UNDERMOUNT_SINK, FLUSH_COOKTOP, BASIN, DRAINER_GROOVES, OTHER
RateUnit: LINEAR_METER, SQUARE_METER, FIXED, PER_KM
```

### Key Relationships
```
quotes → customers (optional)
quotes → quote_rooms → quote_pieces → piece_features
quotes → quote_files, quote_signatures, quote_views, quote_drawing_analyses
quotes → slab_optimizations, drawings
quotes → price_books
customers → client_types, client_tiers, price_books (default)
customers → user (portal users), drawings
pricing_rules_engine → client_types, client_tiers, customers
pricing_rules_engine → pricing_rule_edges, pricing_rule_cutouts, pricing_rule_materials
price_books → price_book_rules → pricing_rules_engine
pricing_settings → service_rates, cutout_rates
user → user_permissions, companies, customers
user → audit_logs, quote_signatures, quote_views, quotes
```

### Planned Schema Additions (Not Yet Migrated)
These fields are referenced in code with `as any` type assertions:

**Quote fields**: `deliveryAddress`, `deliveryCost`, `deliveryDistanceKm`, `deliveryZone`, `templatingRequired`, `templatingCost`, `templatingDistanceKm`, `overrideSubtotal`, `overrideTotal`, `overrideDeliveryCost`

**New models**: `quote_versions` (with `QuoteChangeType` enum), `unit_block_projects`, `unit_block_quotes`

**Company fields**: `abn`, `address`, `phone`, `fax`, `email`

---

## 19. API Reference

### Authentication (2 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/auth/login | No | Login with email/password |
| POST | /api/auth/logout | Yes | Clear session |

### Quotes (12 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/quotes | No | List all quotes |
| POST | /api/quotes | No | Create quote with rooms/pieces |
| GET | /api/quotes/[id] | No | Get full quote with all relations |
| PUT | /api/quotes/[id] | No | Update quote |
| DELETE | /api/quotes/[id] | No | Delete quote |
| POST | /api/quotes/[id]/calculate | No | Calculate pricing |
| POST | /api/quotes/[id]/override | Yes | Apply pricing overrides |
| DELETE | /api/quotes/[id]/override | Yes | Clear overrides |
| GET | /api/quotes/[id]/pdf | No | Generate PDF |
| POST | /api/quotes/[id]/sign | Yes | Electronic signature |
| POST | /api/quotes/[id]/import-pieces | No | Import from drawing analysis |
| POST | /api/quotes/[id]/track-view | No | Record view |

### Quote Pieces (8 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/quotes/[id]/pieces | No | List all pieces |
| POST | /api/quotes/[id]/pieces | No | Create piece |
| GET | /api/quotes/[id]/pieces/[pieceId] | No | Get single piece |
| PUT | /api/quotes/[id]/pieces/[pieceId] | No | Update piece |
| DELETE | /api/quotes/[id]/pieces/[pieceId] | No | Delete piece |
| POST | /api/quotes/[id]/pieces/[pieceId]/duplicate | No | Duplicate piece |
| PUT | /api/quotes/[id]/pieces/reorder | No | Reorder pieces |
| POST/DELETE | /api/quotes/[id]/pieces/[pieceId]/override | Yes | Piece cost overrides |

### Quote Versions (4 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/quotes/[id]/versions | Yes | List versions |
| GET | /api/quotes/[id]/versions/[version] | Yes | Get version snapshot |
| POST | /api/quotes/[id]/versions/[version]/rollback | Yes | Rollback to version |
| GET | /api/quotes/[id]/versions/compare | Yes | Compare two versions |

### Slab Optimization (2 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/quotes/[id]/optimize | No | Get saved optimization |
| POST | /api/quotes/[id]/optimize | No | Run and save optimization |

### Drawings (7 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/quotes/[id]/drawings | Yes | List quote drawings |
| POST | /api/quotes/[id]/drawings | Yes | Create drawing record |
| GET | /api/drawings/[id]/file | Yes | Stream drawing file |
| GET | /api/drawings/[id]/url | Yes | Get presigned URL (1hr) |
| GET | /api/drawings/[id]/thumbnail | Yes | Get/generate thumbnail |
| POST | /api/drawings/simple-upload | Yes | Upload to R2 + DB |
| POST | /api/drawings/upload-complete | Yes | Upload + thumbnail generation |

### Customers (6 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/customers | No | List customers |
| POST | /api/customers | No | Create customer (+ optional portal user) |
| GET | /api/customers/[id] | No | Get customer with stats |
| PUT | /api/customers/[id] | No | Update customer |
| DELETE | /api/customers/[id] | No | Delete customer |
| GET | /api/customers/[id]/drawings | No | Customer drawings |

### Materials (5 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/materials | No | List materials (with camelCase aliases) |
| POST | /api/materials | No | Create material |
| GET | /api/materials/[id] | No | Get material |
| PUT | /api/materials/[id] | No | Update material |
| DELETE | /api/materials/[id] | No | Delete material |

### Admin - Pricing (30+ endpoints)
Full CRUD for: client-types, client-tiers, edge-types, cutout-types, thickness-options, price-books, pricing-rules, service-rates, machines, settings

| Category | Endpoints | Auth |
|----------|-----------|------|
| Client Types | GET/POST/GET[id]/PUT/DELETE | No |
| Client Tiers | GET/POST/GET[id]/PUT/DELETE | No |
| Edge Types | GET/POST/GET[id]/PUT/DELETE | No |
| Cutout Types | GET/POST/GET[id]/PUT/DELETE | No |
| Thickness Options | GET/POST/GET[id]/PUT/DELETE | No |
| Price Books | GET/POST/GET[id]/PUT/DELETE | No |
| Pricing Rules | GET/POST/GET[id]/PUT/DELETE | No |
| Service Rates | GET/POST/GET[id]/PUT/DELETE | Yes (ADMIN) |
| Machines | GET/POST/GET[id]/PUT/DELETE | No |
| Settings | GET/PUT | Yes (ADMIN) |

### Admin - Users (5 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/admin/users | Yes (VIEW_USERS) | List users |
| POST | /api/admin/users | Yes (MANAGE_USERS) | Create user |
| GET | /api/admin/users/[id] | Yes (VIEW_USERS) | Get user |
| PUT | /api/admin/users/[id] | Yes (MANAGE_USERS) | Update user |
| DELETE | /api/admin/users/[id] | Yes (MANAGE_USERS) | Delete user |

### Company (5 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/company/settings | Yes | Get company info |
| PUT | /api/company/settings | Yes | Update company |
| POST | /api/company/logo | Yes | Upload logo |
| DELETE | /api/company/logo | Yes | Delete logo |
| GET | /api/company/logo/view | No | Serve logo |

### AI & Analysis (3 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | /api/analyze-drawing | No | AI drawing analysis |
| POST | /api/analyze-drawing/refine | Yes | Refine with answers |
| POST | /api/pricing/interpret | No | AI price list interpretation |

### Health (2 endpoints)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | /api/health | No | Database connectivity check |
| GET | /api/storage/status | No | R2 storage status |

---

## 20. Feature Status Matrix

| Feature | Status | Storage | Notes |
|---------|--------|---------|-------|
| Quote CRUD | **Production** | Database | Full lifecycle management |
| Quote Builder | **Production** | Database | Advanced piece editing |
| Quote Calculator | **Production** | Database | Multi-strategy pricing |
| Customer Management | **Production** | Database | With portal user creation |
| Materials Management | **Production** | Database | Collections, pricing |
| Pricing Engine | **Production** | Database | Rules, books, tiers |
| Edge/Cutout Types | **Production** | Database | Thickness variants |
| Machine Profiles | **Production** | Database | Kerf, slab dimensions |
| Slab Optimizer | **Production** | Database | FFD + lamination strips |
| Cut List Export | **Production** | CSV/Data | From optimizer results |
| AI Drawing Analysis | **Production** | Database + R2 | Claude Sonnet 4.5 |
| AI Price Interpreter | **Production** | In-memory | CSV/text to mappings |
| Customer Portal | **Production** | Database | View, sign, download |
| Electronic Signatures | **Production** | Database | Legal compliance data |
| PDF Generation | **Production** | In-memory | 2-page quote documents |
| User Management | **Production** | Database | RBAC with 25 permissions |
| Audit Logging | **Production** | Database | Non-blocking trail |
| Company Branding | **Production** | Database + R2 | Logo, colours, text |
| Distance/Delivery | **Production** | API + calc | Google Maps + zones |
| Quote View Tracking | **Production** | Database | Silent tracking |
| Version History | **Partial** | Service ready, DB planned | `quote_versions` model needed |
| Delivery/Templating Fields | **Partial** | Uses `as any` casts | Schema migration needed |
| Quote Overrides | **Partial** | Uses `as any` casts | Schema migration needed |
| Unit Block Projects | **Prototype** | localStorage only | Needs DB, API, file upload |
| Unit Block Calculator | **Built, not connected** | N/A | Awaiting UI integration |
| Large Piece Breakdown | **Calculator only** | N/A | No UI built yet |
| Settings Page | **MVP/Stub** | Read-only | Most fields disabled |
| Edit/Export Unit Block | **Stub** | N/A | "Coming soon" alerts |

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| DATABASE_URL | Yes | PostgreSQL connection string |
| DATABASE_PUBLIC_URL | Yes | Public DB URL (Railway) |
| JWT_SECRET | Yes | JWT signing secret |
| ANTHROPIC_API_KEY | For AI | Claude API key |
| GOOGLE_MAPS_API_KEY | For distance | Google Maps API key |
| R2_ACCOUNT_ID | For storage | Cloudflare account ID |
| R2_ACCESS_KEY_ID | For storage | R2 access key |
| R2_SECRET_ACCESS_KEY | For storage | R2 secret key |
| R2_BUCKET_NAME | For storage | R2 bucket name |
| R2_PUBLIC_URL | For storage | Public URL for R2 bucket |
| NEXT_PUBLIC_APP_URL | Recommended | Application URL |

---

*This document covers the complete Stonehenge V2 system as of February 2026.*
