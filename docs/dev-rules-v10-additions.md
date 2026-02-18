# Dev Rules v10 Additions — Post-Incident 18 Feb 2026

## Incident Summary

PieceRelationship model was added to schema.prisma and all associated code (API routes, services, components) was written and merged across multiple PRs. But `npx prisma migrate dev` was never run (or schema evolved without a migration), so no migration file existed for the full table schema. The table either didn't exist in production or had missing columns (`relationship_type`, `notes`, `updated_at`). This caused every quote page to crash for ~4 hours.

## Rule 46: Schema-Code Parity Gate

NEVER merge code that queries a new Prisma model unless the migration has been created and is included in the same PR (or a previously merged and deployed PR).

Before any PR that adds Prisma queries for a new model:

1. Verify the model exists in schema.prisma
2. Run `npx prisma migrate dev --name descriptive-name`
3. Verify a migration SQL file was created in prisma/migrations/
4. Include the migration file in the PR
5. After merge, check Railway logs — migration count must increase

If the migration doesn't exist, the PR MUST NOT be merged. No exceptions.

## Rule 47: New Table Deployment Checklist

When adding a new database table, a single PR must contain ALL of:

- [ ] Model added to schema.prisma
- [ ] Migration SQL in prisma/migrations/
- [ ] API routes with try/catch error handling
- [ ] Components with optional chaining (?? []) for new relation data
- [ ] Services with try/catch around new table queries

## Rule 48: Stub-First for Unreleased Features

When building components/routes for a feature that depends on schema changes:

1. API routes MUST return safe defaults (empty arrays, 501 status) if the query fails
2. Components MUST use optional chaining for data that may not exist yet
3. Services MUST wrap new-table queries in try/catch
4. Add a comment: `// REQUIRES: Series X migration — stub until deployed`

This ensures the app never crashes even if migrations are missing.

## Rule 49: Pre-Merge Migration Verification

Add to mandatory pre-commit workflow — before every PR that touches schema.prisma:

```bash
npx prisma migrate status
```

If it shows pending migrations, those migration files MUST be in the PR.

## Rule 50: Prisma Client Never in Browser Bundle

NEVER use `import { X } from '@prisma/client'` (value import) in any file marked `'use client'` or any file imported by a client component. Use ONLY:

- `import type { X } from '@prisma/client'` (erased at compile time)
- String literals instead of Prisma enums in client code

Prisma requires Node.js APIs and crashes the browser if bundled into client JS.
