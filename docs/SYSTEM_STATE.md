# Stone Henge — System State

> **Purpose:** Living snapshot of the actual codebase. Updated in every PR.
> **NOT an issue tracker** — see `docs/AUDIT_TRACKER.md` for open issues.
> **Rule:** Every PR that touches schema, routes, components, or core services
>           MUST update this file in the same commit as AUDIT_TRACKER.md.
>           See Rules 52–53 in `docs/stonehenge-dev-rulebook.md`.
> **Last Updated:** 2026-02-28
> **Last Updated By:** claude/wall-edge-no-strip-toggle-HYxEq

---

## Documentation

| Document | Stable Path | Notes |
|----------|------------|-------|
| Dev Rulebook | docs/stonehenge-dev-rulebook.md | Always current version — no version suffix |
| Audit Tracker | docs/AUDIT_TRACKER.md | Living issue tracker |
| System State | docs/SYSTEM_STATE.md | This file |
| Pricing Bible | *(not yet created)* | Referenced as v1.3 in prior stub |
| Codebase Inventory | docs/stonehenge-codebase-inventory.md | Component/route inventory |
| Pricing Audit Report | docs/pricing-audit-report.md | Pricing system audit |
| Incident Report | docs/incident-2026-02-18-quote-system-crash.md | Quote system crash post-mortem |
| Multi-tenant Audit | docs/AUDIT-multi-tenant-isolation.md | Tenant isolation audit |

---

## 1. Database Schema

### All Models (prisma/schema.prisma)

57 models total. Key models listed below with full field details.

#### quote_pieces
| Field | Type | Notes |
|-------|------|-------|
| id | Int | @id autoincrement |
| room_id | Int | FK → quote_rooms |
| material_id | Int? | FK → materials (nullable) |
| material_name | String? | Denormalized material name |
| description | String? | |
| length_mm | Int | Piece length in mm |
| width_mm | Int | Piece width in mm |
| thickness_mm | Int | Piece thickness in mm |
| area_sqm | Decimal(10,4) | Default 0 |
| material_cost | Decimal(10,2) | **@deprecated** — unreliable, use quotes.calculation_breakdown |
| features_cost | Decimal(10,2) | Default 0 |
| total_cost | Decimal(10,2) | **@deprecated** — unreliable, use quotes.calculation_breakdown |
| sort_order | Int | Default 0 |
| cutouts | Json | Default "[]" |
| edge_top | String? | Edge type for RECTANGLE top |
| edge_right | String? | Edge type for RECTANGLE right |
| edge_bottom | String? | Edge type for RECTANGLE bottom |
| edge_left | String? | Edge type for RECTANGLE left |
| name | String | Default "Piece" |
| lamination_method | LaminationMethod | Default NONE |
| isOversize | Boolean | Default false |
| joinCount | Int | Default 0 |
| joinLengthMm | Int? | |
| requiresGrainMatch | Boolean | Default false |
| waterfall_height_mm | Int? | |
| shape_type | String? | Default "RECTANGLE" — values: RECTANGLE, L_SHAPE, U_SHAPE |
| shape_config | Json? | L/U shape dimensions and edges (see Shape System §6) |
| no_strip_edges | Json? | Default "[]" — edge keys marked as wall edges (no lamination strip) |

#### quotes
| Field | Type | Notes |
|-------|------|-------|
| id | Int | @id autoincrement |
| quote_number | String | @unique |
| revision | Int | Default 1 |
| customer_id | Int? | FK → customers |
| contact_id | Int? | FK → customer_contacts |
| company_id | Int | FK → companies (tenant isolation) |
| project_name | String? | |
| project_address | String? | |
| status | String | Default "draft" |
| subtotal | Decimal(10,2) | |
| tax_rate | Decimal(5,2) | Default 10 |
| tax_amount | Decimal(10,2) | |
| total | Decimal(10,2) | |
| valid_until | DateTime? | |
| notes | String? | |
| internal_notes | String? | |
| created_by | Int? | FK → user |
| created_at | DateTime | |
| updated_at | DateTime | |
| price_book_id | String? | FK → price_books |
| calculated_at | DateTime? | |
| calculated_total | Decimal(10,2)? | |
| calculation_breakdown | Json? | Full pricing breakdown (source of truth) |
| status_changed_at | DateTime? | |
| status_changed_by | String? | |
| sent_at | DateTime? | |
| accepted_at | DateTime? | |
| declined_at | DateTime? | |
| declined_reason | String? | |
| revision_number | Int | Default 1 |
| parent_quote_id | Int? | Self-ref for revisions |
| slabEdgeAllowanceMm | Int? | Per-quote slab edge override (mm) |
| deliveryCost | Decimal(10,2)? | |
| templatingCost | Decimal(10,2)? | |
| deliveryAddress | String? | |
| deliveryDistanceKm | Decimal(10,2)? | |
| templatingRequired | Boolean | Default false |
| templatingDistanceKm | Decimal(10,2)? | |
| overrideSubtotal | Decimal(10,2)? | Manual override |
| overrideTotal | Decimal(10,2)? | Manual override |
| overrideDeliveryCost | Decimal(10,2)? | |
| overrideTemplatingCost | Decimal(10,2)? | |
| overrideReason | String? | |
| overrideBy | Int? | |
| overrideAt | DateTime? | |
| discount_type | String? | |
| discount_value | Decimal(10,2)? | |
| discount_applies_to | String? | Default "ALL" |
| optimizer_slab_count | Int? | |
| optimizer_run_at | DateTime? | |

#### materials
| Field | Type | Notes |
|-------|------|-------|
| id | Int | @id autoincrement |
| name | String | |
| collection | String? | |
| description | String? | |
| price_per_sqm | Decimal(10,2) | |
| is_active | Boolean | Default true |
| created_at | DateTime | |
| updated_at | DateTime | |
| price_per_slab | Decimal(10,2)? | Cost price / slab price |
| price_per_square_metre | Decimal(10,2)? | |
| slab_length_mm | Int? | |
| slab_width_mm | Int? | |
| fabrication_category | FabricationCategory | Default ENGINEERED |
| company_id | Int | Tenant isolation |
| supplier_id | String? | FK → suppliers |
| wholesale_price | Decimal(10,2)? | Supplier list price |
| product_code | String? | |
| supplier_range | String? | |
| surface_finish | String? | |
| margin_override_percent | Decimal(5,2)? | Null = use supplier default |
| is_discontinued | Boolean | Default false |
| discontinued_at | DateTime? | |

#### service_rates
| Field | Type | Notes |
|-------|------|-------|
| id | String | @id |
| pricing_settings_id | String | FK → pricing_settings |
| serviceType | ServiceType | Enum |
| fabricationCategory | FabricationCategory | Default ENGINEERED |
| name | String | |
| description | String? | |
| rate20mm | Decimal(10,2) | |
| rate40mm | Decimal(10,2) | |
| minimumCharge | Decimal(10,2)? | |
| isActive | Boolean | Default true |
| @@unique | [pricing_settings_id, serviceType, fabricationCategory] | |

#### edge_types
| Field | Type | Notes |
|-------|------|-------|
| id | String | @id |
| name | String | @unique |
| description | String? | |
| category | String | Default "polish" |
| baseRate | Decimal(10,2) | |
| isActive | Boolean | Default true |
| sortOrder | Int | Default 0 |
| code | String? | @unique |
| rate20mm | Decimal(10,2)? | |
| rate40mm | Decimal(10,2)? | |
| minimumCharge | Decimal(10,2)? | |
| minimumLength | Decimal(10,2)? | |
| isCurved | Boolean | Default false |

#### cutout_types
| Field | Type | Notes |
|-------|------|-------|
| id | String | @id |
| name | String | @unique |
| description | String? | |
| baseRate | Decimal(10,2) | |
| isActive | Boolean | Default true |
| sortOrder | Int | Default 0 |

#### pricing_settings
| Field | Type | Notes |
|-------|------|-------|
| id | String | @id |
| organisation_id | String | @unique |
| material_pricing_basis | MaterialPricingBasis | Default PER_SLAB |
| cutting_unit | ServiceUnit | Default LINEAR_METRE |
| polishing_unit | ServiceUnit | Default LINEAR_METRE |
| installation_unit | ServiceUnit | Default SQUARE_METRE |
| unit_system | UnitSystem | Default METRIC |
| currency | String | Default "AUD" |
| gst_rate | Decimal(5,4) | Default 0.10 |
| laminated_multiplier | Decimal(5,2) | Default 1.30 |
| mitred_multiplier | Decimal(5,2) | Default 1.50 |
| waste_factor_percent | Decimal(5,2) | Default 15.0 |
| grain_matching_surcharge_percent | Decimal(5,2) | Default 15.0 |
| cutout_thickness_multiplier | Decimal(5,2) | Default 1.0 |
| waterfall_pricing_method | WaterfallPricingMethod | Default FIXED_PER_END |
| slab_edge_allowance_mm | Int? | |

#### companies (tenant)
| Field | Type | Notes |
|-------|------|-------|
| id | Int | @id autoincrement |
| name | String | |
| created_at | DateTime? | |
| updated_at | DateTime? | |
| website | String? | |
| logo_storage_key | String? | |
| primary_color | String? | Default "#1e40af" |
| quote_intro_text_1–3 | String? | Quote PDF intro lines |
| quote_please_note | String? | |
| quote_terms_text_1–4 | String? | Quote PDF terms lines |
| quote_validity_days | Int? | Default 30 |
| deposit_percent | Int? | Default 50 |
| terms_url | String? | |
| signature_name | String? | |
| signature_title | String? | |

#### user
| Field | Type | Notes |
|-------|------|-------|
| id | Int | @id autoincrement |
| email | String | @unique |
| password_hash | String | |
| name | String? | |
| customer_id | Int? | FK → customers (portal users) |
| is_active | Boolean | Default true |
| role | UserRole | Default SALES_REP |
| customer_user_role | CustomerUserRole? | |
| company_id | Int? | FK → companies (tenant) |
| last_login_at | DateTime? | |
| last_active_at | DateTime? | |
| invited_at | DateTime? | |
| invited_by | Int? | |

### Other Models (not detailed)

audit_logs, client_tiers, client_types, customers, customer_contacts, customer_locations,
cutout_rates, cutout_category_rates, edge_type_category_rates, material_edge_compatibility,
drawings, machine_profiles, machine_operation_defaults, piece_features, price_book_rules,
price_books, pricing_rule_cutouts, pricing_rule_edges, pricing_rule_materials, pricing_rules,
pricing_rules_engine, quote_drawing_analyses, quote_files, quote_rooms, quote_signatures,
quote_views, quote_custom_charges, quote_versions, settings, slab_optimizations,
thickness_options, user_permissions, suppliers, price_list_uploads, edge_profile_templates,
starter_templates, unit_block_projects, unit_block_units, unit_type_templates,
finish_tier_mappings, buyer_change_snapshots, buyer_change_records, quote_options,
quote_option_overrides, unit_block_files, custom_room_presets, quote_templates,
piece_relationships, drawing_corrections

### Migration History (last 10)

| Migration | Description |
|-----------|-------------|
| 20260301000000 | add_room_notes |
| 20260302000000 | add_quote_templates |
| 20260303000000 | add_company_id_to_core_tables |
| 20260304000000 | extend_quote_templates_sections |
| 20260305000000 | add_custom_charges_and_discount |
| 20260306000000 | add_drawing_corrections |
| 20260307000000 | add_requires_grain_match_to_quote_pieces |
| 20260308000000 | add_optimizer_slab_count |
| 20260309000000 | add_shape_fields_to_pieces |

---

## 2. API Routes

### Protected Routes (all have auth guard)

All 136 API route files contain auth guards (`requireAuth`, `auth()`, or `getRequiredUserId`).

<details>
<summary>Full protected route list (136 routes)</summary>

**Admin Pricing:**
- `src/app/api/admin/pricing/client-tiers/[id]/route.ts`
- `src/app/api/admin/pricing/client-tiers/route.ts`
- `src/app/api/admin/pricing/client-types/[id]/route.ts`
- `src/app/api/admin/pricing/client-types/route.ts`
- `src/app/api/admin/pricing/cutout-types/[id]/route.ts`
- `src/app/api/admin/pricing/cutout-types/route.ts`
- `src/app/api/admin/pricing/edge-types/[id]/route.ts`
- `src/app/api/admin/pricing/edge-types/route.ts`
- `src/app/api/admin/pricing/interpret-price-list/route.ts`
- `src/app/api/admin/pricing/machine-defaults/route.ts`
- `src/app/api/admin/pricing/machines/[id]/route.ts`
- `src/app/api/admin/pricing/machines/route.ts`
- `src/app/api/admin/pricing/price-books/[id]/route.ts`
- `src/app/api/admin/pricing/price-books/route.ts`
- `src/app/api/admin/pricing/pricing-rules/[id]/route.ts`
- `src/app/api/admin/pricing/pricing-rules/route.ts`
- `src/app/api/admin/pricing/service-rates/[id]/route.ts`
- `src/app/api/admin/pricing/service-rates/route.ts`
- `src/app/api/admin/pricing/settings/route.ts`
- `src/app/api/admin/pricing/thickness-options/[id]/route.ts`
- `src/app/api/admin/pricing/thickness-options/route.ts`
- `src/app/api/admin/users/[id]/route.ts`
- `src/app/api/admin/users/route.ts`

**Auth:**
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`

**Company:**
- `src/app/api/company/logo/route.ts`
- `src/app/api/company/logo/view/route.ts`
- `src/app/api/company/settings/route.ts`

**Customers:**
- `src/app/api/customers/[id]/contacts/[contactId]/route.ts`
- `src/app/api/customers/[id]/contacts/route.ts`
- `src/app/api/customers/[id]/drawings/route.ts`
- `src/app/api/customers/[id]/locations/[locationId]/route.ts`
- `src/app/api/customers/[id]/locations/route.ts`
- `src/app/api/customers/[id]/route.ts`
- `src/app/api/customers/route.ts`

**Drawings:**
- `src/app/api/analyze-drawing/elevation/route.ts`
- `src/app/api/analyze-drawing/refine/route.ts`
- `src/app/api/analyze-drawing/route.ts`
- `src/app/api/drawing-corrections/route.ts`
- `src/app/api/drawing-corrections/stats/route.ts`
- `src/app/api/drawings/[id]/details/route.ts`
- `src/app/api/drawings/[id]/file/route.ts`
- `src/app/api/drawings/[id]/thumbnail/route.ts`
- `src/app/api/drawings/[id]/url/route.ts`
- `src/app/api/drawings/backfill-thumbnails/route.ts`
- `src/app/api/drawings/simple-upload/route.ts`
- `src/app/api/drawings/upload-complete/route.ts`
- `src/app/api/elevation-pipeline/route.ts`
- `src/app/api/upload/drawing/route.ts`

**Materials & Pricing:**
- `src/app/api/materials/[id]/route.ts`
- `src/app/api/materials/route.ts`
- `src/app/api/pricing-rules/route.ts`
- `src/app/api/pricing/cutout-category-rates/route.ts`
- `src/app/api/pricing/edge-category-rates/route.ts`
- `src/app/api/pricing/edge-compatibility/route.ts`
- `src/app/api/pricing/interpret/route.ts`
- `src/app/api/edge-templates/[id]/route.ts`
- `src/app/api/edge-templates/route.ts`

**Quotes:**
- `src/app/api/quotes/route.ts`
- `src/app/api/quotes/batch-create/route.ts`
- `src/app/api/quotes/create-draft/route.ts`
- `src/app/api/quotes/[id]/route.ts`
- `src/app/api/quotes/[id]/calculate/route.ts`
- `src/app/api/quotes/[id]/custom-charges/route.ts`
- `src/app/api/quotes/[id]/custom-charges/[chargeId]/route.ts`
- `src/app/api/quotes/[id]/drawings/route.ts`
- `src/app/api/quotes/[id]/duplicate/route.ts`
- `src/app/api/quotes/[id]/edge-allowance/route.ts`
- `src/app/api/quotes/[id]/import-pieces/route.ts`
- `src/app/api/quotes/[id]/machine-operations/route.ts`
- `src/app/api/quotes/[id]/manufacturing-export/route.ts`
- `src/app/api/quotes/[id]/optimize/route.ts`
- `src/app/api/quotes/[id]/options/route.ts`
- `src/app/api/quotes/[id]/options/[optionId]/route.ts`
- `src/app/api/quotes/[id]/options/[optionId]/calculate/route.ts`
- `src/app/api/quotes/[id]/options/[optionId]/overrides/route.ts`
- `src/app/api/quotes/[id]/options/[optionId]/overrides/[overrideId]/route.ts`
- `src/app/api/quotes/[id]/override/route.ts`
- `src/app/api/quotes/[id]/pdf/route.ts`
- `src/app/api/quotes/[id]/piece-relationships/route.ts`
- `src/app/api/quotes/[id]/pieces/route.ts`
- `src/app/api/quotes/[id]/pieces/[pieceId]/route.ts`
- `src/app/api/quotes/[id]/pieces/[pieceId]/duplicate/route.ts`
- `src/app/api/quotes/[id]/pieces/[pieceId]/override/route.ts`
- `src/app/api/quotes/[id]/pieces/bulk-delete/route.ts`
- `src/app/api/quotes/[id]/pieces/bulk-edges/route.ts`
- `src/app/api/quotes/[id]/pieces/bulk-move/route.ts`
- `src/app/api/quotes/[id]/pieces/bulk-update/route.ts`
- `src/app/api/quotes/[id]/pieces/reorder/route.ts`
- `src/app/api/quotes/[id]/readiness/route.ts`
- `src/app/api/quotes/[id]/relationships/route.ts`
- `src/app/api/quotes/[id]/relationships/[relationshipId]/route.ts`
- `src/app/api/quotes/[id]/rooms/route.ts`
- `src/app/api/quotes/[id]/rooms/[roomId]/route.ts`
- `src/app/api/quotes/[id]/rooms/[roomId]/merge/route.ts`
- `src/app/api/quotes/[id]/rooms/reorder/route.ts`
- `src/app/api/quotes/[id]/save-as-template/route.ts`
- `src/app/api/quotes/[id]/sign/route.ts`
- `src/app/api/quotes/[id]/status/route.ts`
- `src/app/api/quotes/[id]/track-view/route.ts`
- `src/app/api/quotes/[id]/versions/route.ts`
- `src/app/api/quotes/[id]/versions/[version]/route.ts`
- `src/app/api/quotes/[id]/versions/[version]/rollback/route.ts`
- `src/app/api/quotes/[id]/versions/compare/route.ts`
- `src/app/api/quotes/[id]/views/route.ts`
- `src/app/api/quote-templates/[id]/route.ts`
- `src/app/api/quote-templates/route.ts`

**Room Presets & Suggestions:**
- `src/app/api/room-presets/[id]/route.ts`
- `src/app/api/room-presets/route.ts`
- `src/app/api/custom-charge-suggestions/route.ts`
- `src/app/api/suggestions/route.ts`
- `src/app/api/distance/calculate/route.ts`

**Health:**
- `src/app/api/health/route.ts`
- `src/app/api/health/quote-system/route.ts`

**Storage:**
- `src/app/api/storage/status/route.ts`

**Suppliers:**
- `src/app/api/suppliers/route.ts`
- `src/app/api/suppliers/[id]/route.ts`
- `src/app/api/suppliers/[id]/materials/route.ts`
- `src/app/api/suppliers/[id]/price-lists/route.ts`
- `src/app/api/suppliers/[id]/price-lists/[uploadId]/apply/route.ts`

**Templates:**
- `src/app/api/templates/route.ts`
- `src/app/api/templates/[id]/route.ts`
- `src/app/api/templates/[id]/clone/route.ts`
- `src/app/api/templates/[id]/mappings/route.ts`
- `src/app/api/templates/[id]/mappings/[mappingId]/route.ts`
- `src/app/api/templates/[id]/mappings/resolve/route.ts`
- `src/app/api/templates/from-analysis/route.ts`
- `src/app/api/starter-templates/route.ts`
- `src/app/api/starter-templates/[id]/route.ts`
- `src/app/api/starter-templates/[id]/apply/route.ts`
- `src/app/api/starter-templates/[id]/roles/route.ts`

**Unit Blocks:**
- `src/app/api/unit-blocks/route.ts`
- `src/app/api/unit-blocks/[id]/route.ts`
- `src/app/api/unit-blocks/[id]/auto-generate-templates/route.ts`
- `src/app/api/unit-blocks/[id]/calculate/route.ts`
- `src/app/api/unit-blocks/[id]/change-report/route.ts`
- `src/app/api/unit-blocks/[id]/generate/route.ts`
- `src/app/api/unit-blocks/[id]/mapping-status/route.ts`
- `src/app/api/unit-blocks/[id]/parse-register/route.ts`
- `src/app/api/unit-blocks/[id]/parse-schedule/route.ts`
- `src/app/api/unit-blocks/[id]/units/route.ts`
- `src/app/api/unit-blocks/[id]/units/[unitId]/route.ts`
- `src/app/api/unit-blocks/[id]/units/[unitId]/changes/route.ts`

</details>

### Unprotected Routes (no auth guard)

**None found.** All 136 API routes contain auth guards.

---

## 3. Page Routes (Site Map)

### Dashboard Pages
| Path | Description |
|------|-------------|
| `/(dashboard)/dashboard/page.tsx` | Main dashboard |
| `/(dashboard)/quotes/page.tsx` | Quote list |
| `/(dashboard)/quotes/new/page.tsx` | New quote wizard |
| `/(dashboard)/quotes/new/unit-block/page.tsx` | New unit block quote |
| `/(dashboard)/quotes/[id]/page.tsx` | Quote detail view |
| `/(dashboard)/quotes/[id]/builder/page.tsx` | Quote builder (main editor) |
| `/(dashboard)/quotes/[id]/edit/page.tsx` | Quote edit |
| `/(dashboard)/quotes/[id]/print/page.tsx` | Quote print view |
| `/(dashboard)/quotes/[id]/job-view/page.tsx` | Job view |
| `/(dashboard)/quotes/[id]/drawings/[drawingId]/page.tsx` | Drawing detail |
| `/(dashboard)/quotes/[id]/pieces/[pieceId]/page.tsx` | Piece detail |
| `/(dashboard)/quotes/unit-block/page.tsx` | Unit block list |
| `/(dashboard)/quotes/unit-block/[id]/page.tsx` | Unit block detail |
| `/(dashboard)/customers/page.tsx` | Customer list |
| `/(dashboard)/customers/new/page.tsx` | New customer |
| `/(dashboard)/customers/[id]/page.tsx` | Customer detail |
| `/(dashboard)/customers/[id]/edit/page.tsx` | Customer edit |
| `/(dashboard)/materials/page.tsx` | Materials list |
| `/(dashboard)/materials/new/page.tsx` | New material |
| `/(dashboard)/materials/[id]/edit/page.tsx` | Material edit |
| `/(dashboard)/materials/suppliers/page.tsx` | Supplier list |
| `/(dashboard)/materials/suppliers/[id]/page.tsx` | Supplier detail |
| `/(dashboard)/templates/page.tsx` | Template list |
| `/(dashboard)/templates/new/page.tsx` | New template |
| `/(dashboard)/templates/[id]/edit/page.tsx` | Template edit |
| `/(dashboard)/optimize/page.tsx` | Slab optimizer |
| `/(dashboard)/admin/pricing/page.tsx` | Admin pricing dashboard |
| `/(dashboard)/admin/pricing/edges/page.tsx` | Edge type admin |
| `/(dashboard)/admin/pricing/cutouts/page.tsx` | Cutout type admin |
| `/(dashboard)/admin/pricing/services/page.tsx` | Service rates admin |
| `/(dashboard)/admin/pricing/settings/page.tsx` | Pricing settings admin |
| `/(dashboard)/admin/users/page.tsx` | User management |
| `/(dashboard)/settings/page.tsx` | Settings |
| `/(dashboard)/settings/company/page.tsx` | Company settings |
| `/(dashboard)/settings/quote-templates/page.tsx` | Quote template settings |

### Portal Pages
| Path | Description |
|------|-------------|
| `/(portal)/portal/page.tsx` | Customer portal home |
| `/(portal)/portal/quotes/[id]/page.tsx` | Customer portal quote view |

### Public Pages
| Path | Description |
|------|-------------|
| `/login/page.tsx` | Login page |
| `/page.tsx` | Root / landing page |

---

## 4. Core Service Functions

### pricing-calculator-v2.ts
| Function | Line | Purpose |
|----------|------|---------|
| `loadPricingContext` | 131 | Loads all pricing config for an organisation |
| `calculateMaterialCost` | 167 | Calculates material cost for a piece |
| `buildMaterialGroupings` | 350 | Groups pieces by material for slab calculation |
| `calculateQuotePrice` | 476 | **Main entry point** — calculates full quote pricing. PROMPT-12: strips all edges minus noStripEdges (wall edges) via `stripLm` |
| `getServiceRate` | 1573 | Looks up service rate by type/category |
| `applyMinimumCharge` | 1610 | Applies minimum charge to a line item |
| `getApplicableRules` | 1626 | Finds pricing rules matching a piece |
| `mapEdgeBreakdownFromEngine` | 1667 | Maps engine edge results to breakdown format |
| `mapCutoutBreakdownFromEngine` | 1703 | Maps engine cutout results to breakdown format |
| `zeroedPieceBreakdown` | 1734 | Returns zeroed breakdown (error fallback) |
| `extractFabricationDiscount` | 1761 | Extracts discount from client tier — **never called (dead code, A-01)** |
| `checkGrainMatchFeasibility` | 1772 | Checks if grain matching is possible for piece dims |
| `roundToTwo` | 1811 | Rounds to 2 decimal places |

### shapes.ts
| Function | Line | Purpose |
|----------|------|---------|
| `calculateLShapeGeometry` | 27 | Calculates L-shape area, perimeter, joins |
| `calculateUShapeGeometry` | 56 | Calculates U-shape area, perimeter, joins |
| `decomposeShapeIntoRects` | 106 | Decomposes L/U shape into rectangles for slab optimizer |
| `getBoundingBox` | 195 | Returns bounding box for a shaped piece |
| `getShapeEdgeLengths` | 242 | Returns named edge lengths for a shape |
| `getCuttingPerimeterLm` | 279 | Sum of decomposed leg perimeters (Rule 59A) — used by pricing-calculator-v2.ts |
| `getFinishableEdgeLengthsMm` | 317 | 6 exposed edges for L-shape (Rule 59B) — used by pricing-calculator-v2.ts |
| `getShapeGeometry` | 366 | Dispatcher — calls L or U geometry calculator |

### slab-optimizer.ts
| Function | Line | Purpose |
|----------|------|---------|
| `getStripWidthForEdge` | 59 | Calculates lamination strip width for an edge type |
| `generateLaminationStrips` | 79 | Generates lamination strips for all 4 rectangle edges minus noStripEdges |
| `generateShapeStrips` | 186 | Generates strips for all L/U finishable edges minus noStripEdges |
| `generateLaminationSummary` | 484 | Summarises lamination strip usage |
| `preprocessOversizePieces` | 539 | Splits oversize pieces into joinable segments |
| `optimizeSlabs` | 635 | **Main entry point** — bin-packs pieces onto slabs |
| `createSlab` | 1020 | Creates empty slab with free rectangles |
| `findPosition` | 1032 | Finds placement position on a slab |
| `placePiece` | 1054 | Places piece at position on slab |
| `updateFreeRects` | 1098 | Updates free rectangles after placement |
| `calculateSlabResult` | 1159 | Calculates utilisation stats for a slab |

### multi-material-optimizer.ts
| Function | Line | Purpose |
|----------|------|---------|
| `optimizeMultiMaterial` | 69 | **Main entry point** — groups by material, runs optimizer per group |
| `resolveSlabLength` | 224 | Resolves slab length for a material |
| `resolveSlabWidth` | 233 | Resolves slab width for a material |
| `detectOversizePieces` | 251 | Detects pieces exceeding slab dimensions |

### pricing-rules-engine.ts
| Function | Line | Purpose |
|----------|------|---------|
| `ruleCutting` | 132 | Calculates cutting cost |
| `rulePolishing` | 152 | Calculates polishing cost |
| `ruleEdgeProfiles` | 176 | Calculates edge profile cost |
| `ruleLamination` | 205 | Calculates lamination cost (40mm) |
| `ruleCutouts` | 227 | Calculates cutout cost |
| `ruleJoin` | 247 | Calculates corner join cost |
| `ruleGrainSurcharge` | 267 | Calculates grain matching surcharge |
| `ruleInstallation` | 279 | Calculates installation cost |
| `calculateQuote` | 296 | **Main entry point** — runs all rules for a quote |

### auth.ts
| Function | Line | Purpose |
|----------|------|---------|
| `hashPassword` | 26 | Hashes password with bcrypt |
| `verifyPassword` | 30 | Verifies password against hash |
| `createToken` | 34 | Creates JWT token |
| `verifyToken` | 42 | Verifies JWT token |
| `setAuthCookie` | 51 | Sets auth cookie |
| `removeAuthCookie` | 62 | Removes auth cookie |
| `getAuthCookie` | 67 | Gets auth cookie value |
| `getCurrentUser` | 72 | Gets current user from token |
| `login` | 78 | Login flow |
| `logout` | 117 | Logout flow |
| `requireAuth` | 125 | Auth middleware — requires valid token + company |
| `verifyQuoteOwnership` | 180 | Verifies quote belongs to company |
| `verifyCustomerOwnership` | 192 | Verifies customer belongs to company |
| `requireAuthLegacy` | 204 | Legacy auth middleware |

---

## 5. Quote Builder Components

### File Sizes (lines of code)

| Component | Lines |
|-----------|-------|
| PieceVisualEditor.tsx | 1883 |
| PieceRow.tsx | 1268 |
| QuickViewPieceRow.tsx | 1195 |
| RoomSpatialView.tsx | 1183 |
| InlinePieceEditor.tsx | 938 |
| ManualQuoteWizard.tsx | 860 |
| QuoteAdjustments.tsx | 589 |
| PartsSection.tsx | 582 |
| BulkMaterialSwap.tsx | 563 |
| FromTemplateSheet.tsx | 540 |
| RelationshipEditor.tsx | 495 |
| MiniPieceEditor.tsx | 489 |
| RoomTypePicker.tsx | 488 |
| MiniSpatialDiagram.tsx | 483 |
| RoomPieceSVG.tsx | 477 |
| BulkMaterialDialog.tsx | 477 |
| DrawingUploadStep.tsx | 450 |
| StreamlinedAnalysisView.tsx | 430 |
| PieceContextMenu.tsx | 409 |
| RoomLinearView.tsx | 393 |
| QuoteLevelCostSections.tsx | 383 |
| QuoteReadinessChecker.tsx | 368 |
| VersionHistoryTab.tsx | 363 |
| QuoteLayout.tsx | 337 |
| **Total** | **21,336** |

### All Components (55 files)

BulkMaterialDialog, BulkMaterialSwap, ClassicQuoteBuilder, ContactPicker,
CreateOptionDialog, CustomerInfoAccordion, CutoutAddDialog, DrawingUploadStep,
DrawingsAccordion, EdgeProfilePopover, FloatingActionButton, FromTemplateSheet,
InlinePieceEditor, MachineOperationsAccordion, ManualQuoteWizard,
MaterialAssignment, MaterialCostSection, MaterialGroupOptimisation,
MiniPieceEditor, MiniSpatialDiagram, MultiSelectToolbar, NewQuoteWizard,
OptimizerStatusBar, OptionComparisonSummary, OptionTabsBar,
OversizePieceIndicator, PartsSection, PieceContextMenu,
PieceEditorErrorBoundary, PieceOverrideEditor, PieceOverrideIndicator,
PieceRow, PieceVisualEditor, QuickViewPieceRow, QuoteAdjustments,
QuoteCostSummaryBar, QuoteLayout, QuoteLevelCostSections,
QuoteReadinessChecker, RelationshipConnector, RelationshipEditor,
RelationshipSuggestions, RoomLinearView, RoomNameAutocomplete,
RoomPieceSVG, RoomSpatialView, RoomTypePicker, StatusBadge,
StreamlinedAnalysisView, TemplateSelector, TotalBreakdownAccordion,
VersionDiffView, VersionHistoryTab

### Key Props Interfaces

#### QuoteDetailClient.tsx (PROMPT-11 updates)
- `fullPiece` now includes `shapeConfig: p.shapeConfig ?? null` — prevents silent overwrite of L/U shape geometry on edge save
- `handleShapeEdgeChange` already wired internally in QuickViewPieceRow and PieceRow via `onSavePiece` chain

#### PieceVisualEditor.tsx (PROMPT-11 + PROMPT-12 updates)
- Null guards at L-shape layout (~line 638): `if (!cfg.leg1 || !cfg.leg2) return null`
- Null guards at U-shape layout (~line 720): `if (!cfg.leftLeg || !cfg.back || !cfg.rightLeg) return null`
- Null guards at cutout area constraint (~line 835/844): safe skip when leg sub-objects missing
- Returns safe `null` fallback when leg sub-objects missing (same as RECTANGLE path)
- **PROMPT-12:** "Against wall" toggle per edge — sets noStripEdges. Wall edges show "WALL" label in SVG.

#### PieceVisualEditorProps (line 54)
- `lengthMm`, `widthMm` — piece dimensions
- `edgeTop`, `edgeRight`, `edgeBottom`, `edgeLeft` — edge type IDs (string | null)
- `edgeTypes` — available edge type options
- `cutouts` — cutout display data
- `joinAtMm?` — oversize join position
- `isEditMode` — view/edit toggle
- `isMitred?` — mitred lamination flag
- `onEdgeChange?` — single edge change callback
- `onEdgesChange?` — multi-edge change callback (template apply)
- `onCutoutAdd?`, `onCutoutRemove?` — cutout callbacks
- `onBulkApply?` — bulk edge apply to room/quote scope
- `noStripEdges?` — edge keys marked as wall edges (no lamination strip)
- `onNoStripEdgesChange?` — callback when wall edge state changes

#### QuickViewPieceRowProps (line 106)
- `piece` — PieceData object
- `breakdown?` — PiecePricingBreakdown
- `machines?`, `machineOperationDefaults?` — machine assignment data
- `mode` — 'view' | 'edit'
- `onMachineChange?`, `onSavePiece?`, `onDelete?`, `onDuplicate?`
- `onBulkEdgeApply?` — bulk edge apply with scope
- `onExpand?` — expand to full view
- `relationships?`, `allPiecesForRelationships?` — piece relationship data
- `onBatchEdgeUpdate?` — batch edge update across scope

#### PieceRowProps (line 96)
- `piece` — inline object with id, name, dimensions, edges, shapeType, shapeConfig, requiresGrainMatch
- `breakdown?` — PiecePricingBreakdown
- `machines?`, `machineOperationDefaults?`
- `mode` — 'view' | 'edit'
- `fullPiece?`, `editData?` — for inline editing
- `onSavePiece?`, `onDelete?`, `onDuplicate?`, `onMachineChange?`
- `onBulkEdgeApply?` — bulk edge apply with scope
- `quoteId?` — for bulk operations

#### InlinePieceEditorProps (line 64)
- `piece` — InlinePieceData
- `materials`, `edgeTypes`, `cutoutTypes`, `thicknessOptions` — reference data
- `roomNames` — available rooms
- `onSave`, `saving` — save callback and state
- `isNew?` — create-new-piece mode
- `onCancel?` — cancel create
- `pieceSuggestions?`, `roomSuggestions?` — autocomplete
- `grainMatchingSurchargePercent?` — tenant grain match config

#### PartsSectionProps (line 68)
- `quoteId` — quote ID
- `rooms` — QuoteRoom array
- `calcBreakdown` — { pieces?: PiecePricingBreakdown[] }
- `optimiserRefreshKey?` — bump to re-fetch optimizer
- `externalRelationships?` — piece relationships for edit mode

---

## 6. Shape System

### ShapeType Values
```typescript
export type ShapeType = 'RECTANGLE' | 'L_SHAPE' | 'U_SHAPE';
```

### shape_config Interfaces

```typescript
export interface LShapeConfig {
  shape: 'L_SHAPE';
  leg1: { length_mm: number; width_mm: number };
  leg2: { length_mm: number; width_mm: number };
}

export interface UShapeConfig {
  shape: 'U_SHAPE';
  leftLeg: { length_mm: number; width_mm: number };
  back:    { length_mm: number; width_mm: number };
  rightLeg: { length_mm: number; width_mm: number };
}

export type ShapeConfig = LShapeConfig | UShapeConfig | null;

export interface ShapeGeometry {
  totalAreaSqm: number;       // total stone area (corner overlap deducted)
  cuttingPerimeterLm: number; // full outer perimeter for cutting cost
  cornerJoins: number;        // 1 for L-shape, 2 for U-shape
  boundingLength_mm: number;  // longest outer dimension (for optimiser)
  boundingWidth_mm: number;   // widest outer dimension (for optimiser)
}
```

### Edge Storage Model

| Shape | Storage | Edge Keys |
|-------|---------|-----------|
| RECTANGLE | edge_top, edge_right, edge_bottom, edge_left (DB columns) | top, right, bottom, left |
| L_SHAPE | shape_config.edges (JSON) | top, left, r_top, inner, r_btm, bottom |
| U_SHAPE | shape_config.edges (JSON) | top_left, outer_left, bottom, outer_right, top_right, inner_right, back_inner, inner_left |

### Key Functions (shapes.ts)

```
getCuttingPerimeterLm(shapeType, shapeConfig, fallbackLengthMm, fallbackWidthMm): number
  — Returns sum of perimeters of all decomposed legs (Rule 59A)
  — Formula: 2×(leg1.length+leg1.width) + 2×(leg2Net+leg2.width)
  — leg2Net = leg2.length_mm - leg1.width_mm (subtraction happens ONCE here only)
  — Verified: 3200×600 + 1800×600 → 12.4 Lm ✅ (FIX-11-Phase1, Feb 27 2026)

getFinishableEdgeLengthsMm(shapeType, shapeConfig, fallbackLengthMm, fallbackWidthMm): Record<string, number>
  — Returns 6 keys: top, left, r_top, inner, r_btm, bottom (Rule 59B)
  — inner = leg1.length - leg2.width (exposed step face, NOT leg2Net)

calculateLShapeGeometry(config: LShapeConfig | null | undefined): ShapeGeometry
  — Returns zeroed result if config or leg data is missing (null-safe)
  — cuttingPerimeterLm uses decomposed leg perimeters (Rule 59A), same as getCuttingPerimeterLm
  — Fixed Feb 27 2026: was using outer 6-sided perimeter (11.2 Lm), now returns 12.4 Lm

calculateUShapeGeometry(config: UShapeConfig | null | undefined): ShapeGeometry
  — Returns zeroed result if config or leg data is missing (null-safe)

getCuttingPerimeterLm(shapeType, shapeConfig, fallbackLengthMm, fallbackWidthMm): number
  — Returns 0 if config is missing (null-safe)

getFinishableEdgeLengthsMm(shapeType, shapeConfig, fallbackLengthMm, fallbackWidthMm): Record<string, number>
  — Returns {} if config is missing (null-safe)

getShapeGeometry(shapeType, shapeConfig: ShapeConfig | null | undefined, length_mm, width_mm): ShapeGeometry
  — Dispatcher accepts null/undefined shapeConfig safely
```

### Cutting vs Finishing Rule (Rule 59)

| Shape | Cutting Perimeter | Finishable Edges |
|-------|------------------|-----------------|
| RECTANGLE | 2 x (length + width) | Up to 4 outer faces |
| L_SHAPE | Sum of Leg A + Leg B perimeters (decomposed rectangles, including join faces) | 6 outer exposed faces (no join faces) |
| U_SHAPE | Sum of Left + Back + Right perimeters (decomposed rectangles, including join faces) | 8 outer exposed faces (no join faces) |

---

## 7. Environment Variables

| Variable | Purpose |
|----------|---------|
| `COMPANY_ADDRESS` | Company address for distance/templating calculations |
| `GOOGLE_MAPS_API_KEY` | Distance calculation API |
| `JWT_SECRET` | JWT signing secret |
| `LOG_LEVEL` | Logging level |
| `NODE_ENV` | Environment (development/production) |
| `R2_ACCESS_KEY_ID` | Cloudflare R2 storage access key |
| `R2_ACCOUNT_ID` | Cloudflare R2 account ID |
| `R2_BUCKET_NAME` | Cloudflare R2 bucket name |
| `R2_ENDPOINT` | Cloudflare R2 endpoint URL |
| `R2_SECRET_ACCESS_KEY` | Cloudflare R2 secret key |

---

## 8. Seed Files

| File | Purpose |
|------|---------|
| `prisma/seed.ts` | Main seed orchestrator |
| `prisma/seed-category-rates.ts` | Category-based service rates |
| `prisma/seed-category-service-rates.ts` | Category service rates |
| `prisma/seed-cutout-category-rates.ts` | Cutout rates by fabrication category |
| `prisma/seed-cutout-types.ts` | Cutout type definitions |
| `prisma/seed-edge-category-rates.ts` | Edge rates by fabrication category |
| `prisma/seed-edge-compatibility.ts` | Material-edge compatibility matrix |
| `prisma/seed-edge-templates.ts` | Edge profile templates |
| `prisma/seed-edge-types.ts` | Edge type definitions |
| `prisma/seed-fabrication-categories.ts` | Fabrication category seed data |
| `prisma/seed-machine-operation-defaults.ts` | Machine operation defaults |
| `prisma/seed-machine-profiles.ts` | Machine profile definitions |
| `prisma/seed-material-slab-prices.ts` | Material slab pricing |
| `prisma/seed-pricing-settings.ts` | Pricing settings defaults |
| `prisma/seed-pricing.ts` | General pricing seed |
| `prisma/seed-production.js` | Production seed data |
| `prisma/seed-quote-templates.ts` | Quote template seed data |
| `prisma/seed-starter-templates.ts` | Starter template definitions |
| `prisma/seed-suppliers.ts` | Supplier seed data |

---

## 9. Slab Size Constants

**File:** `src/lib/constants/slab-sizes.ts`

| Key | Name | Length (mm) | Width (mm) |
|-----|------|-------------|------------|
| ENGINEERED_QUARTZ_JUMBO | Engineered Quartz (Jumbo) | 3200 | 1600 |
| ENGINEERED_QUARTZ_STANDARD | Engineered Quartz (Standard) | 3050 | 1440 |
| NATURAL_STONE | Natural Stone | 2800 | 1600 |
| PORCELAIN | Porcelain | 3200 | 1600 |

### Strip Configurations (40mm lamination)

| Config | Strip Width (mm) | Visible Width (mm) | Lamination Width (mm) | Kerf Loss (mm) |
|--------|-----------------|--------------------|-----------------------|----------------|
| STANDARD | 108 | 60 | 40 | 8 |
| WIDE | 348 | 300 | 40 | 8 |

### Helper Functions
- `getSlabSize(materialCategory)` — maps material category name to slab size
- `getDefaultSlabLength(fabricationCategory)` — returns slab length for fabrication category
- `getDefaultSlabWidth(fabricationCategory)` — returns slab width for fabrication category
- `getMaxUsableDimensions(slabSize, edgeTrimMm)` — returns max usable dims after edge trim (default 20mm)

---

## 10. Known Verified Behaviour

> **CRITICAL:** Only add entries here after MANUAL verification on production
> with a named quote and date. Do NOT mark things verified because code exists.
> "Code exists" does NOT equal "verified working." See Rule 52.

| Feature | Verified | Date | Quote Used |
|---------|----------|------|------------|
| Rectangle piece pricing (cutting, polishing, lamination) | Not verified | — | — |
| L-shape cutting perimeter (decomposed legs) | Formula verified in code | Feb 27 2026 | — |
| [ ] Quote 55 Family Room cutting = $558.00 (12.4 Lm × $45) | Pending production verification | — after merge + recalculate | Quote 55 |
| L-shape edge saving and polishing cost | Not verified | — | — |
| L-shape lamination cost (40mm) | Not verified | — | — |
| Slab optimizer — rectangles | Not verified | — | — |
| Slab optimizer — L/U shapes | Not verified | — | — |
| Grain match surcharge | Not verified | — | — |
| Corner join cost | Not verified | — | — |
| Pre-push hook enforcement (AUDIT_TRACKER + SYSTEM_STATE) | ✅ | Feb 27 | — |
| [ ] Quote 55 Family Room — edge click → leg data intact after save | Pending production verification | — | Quote 55 |
| [ ] Quote 55 Family Room — cutting non-zero after recalculate | Pending production verification | — | Quote 55 |
| [ ] Dashboard loads without crash | Pending production verification | — | — |
| [ ] Kitchen pieces unchanged after edge edit | Pending production verification | — | — |
