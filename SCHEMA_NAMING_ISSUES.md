# 🔧 Schema Naming Convention Issues

## Problem
The Prisma schema has **inconsistent** naming conventions across different models.

## Current State

### Snake_case Models (use `created_at`, `updated_at`)
- `audit_logs`
- `companies`
- **`customers`** ← We're accessing this one
- `cutout_rates`
- `machine_profiles`
- `materials`
- `pricing_rules`
- `pricing_settings`
- `quotes`
- `service_rates`
- `user_permissions`
- `user`

### CamelCase Models (use `createdAt`, `updatedAt`)
- `client_tiers`
- `client_types`
- `cutout_types`
- `edge_types`
- `price_books`
- `pricing_rules_engine`
- `slab_optimizations`
- `thickness_options`

## Fixes Applied

### Commit 1: `7cfaa84` - Relations (client_types, client_tiers)
- Fixed: `clientType` → `client_types`
- Fixed: `clientTier` → `client_tiers`

### Commit 2: `9deccce` - Price Books Relation
- Fixed: `defaultPriceBook` → `price_books`

### Commit 3: `c837de6` - Timestamp Field
- Fixed: `customer.createdAt` → `customer.created_at`

## Key Rules

1. **Relation names**: Always **snake_case** (as defined in schema `@relation`)
   - `client_types`, `client_tiers`, `price_books`, etc.

2. **Foreign key IDs**: Match schema exactly
   - Snake_case: `client_type_id`, `client_tier_id`, `default_price_book_id`

3. **Timestamp fields**: Check **each model individually** in schema
   - `customers` uses `created_at` (snake_case)
   - `client_tiers` uses `createdAt` (camelCase)
   - `client_types` uses `createdAt` (camelCase)

## Important
When accessing ANY field, always verify the exact field name in `prisma/schema.prisma` first!
