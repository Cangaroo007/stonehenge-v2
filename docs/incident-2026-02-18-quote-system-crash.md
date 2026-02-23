# Incident: Quote System Complete Crash — Feb 18, 2026

## Timeline

- ~6:30 AM: Wizard Step 4 crash reported (initially thought to be React #310)
- ~7:15 AM: Drawing analysis also crashes
- ~7:50 AM: Create Quote crashes
- ~8:10 AM: ALL quote pages crash — View, Edit, Wizard, even /quotes intermittently
- ~9:00 AM: Root cause identified — Prisma client in browser bundle + missing table
- ~9:40 AM: PR #149 merged — Prisma client fix (UserRole enum → string literals)
- ~10:00 AM: PR #150 merged — Removed sourceRelationships/targetRelationships includes
- ~10:15 AM: Page renders but API routes still return 500
- ~10:30 AM: This PR — creates missing migration + re-adds includes + safety guards

## Root Causes (Two Issues)

### Issue 1: Prisma Client in Browser Bundle

`QuoteViewTracker.tsx` used `import { UserRole } from '@prisma/client'` in a 'use client' component.
`piece-relationship.ts` used `import { RelationshipType } from '@prisma/client'` (value import).
Both pulled ~20kB of Prisma server-side code into the browser bundle, crashing at runtime.

**Fix:** Replaced with string literals and `import type`.
**Prevention:** Rule 50 — Prisma client never in browser bundle.

### Issue 2: Missing Database Migration

PR #124 (feat(13.1): evolve piece_relationships) added the PieceRelationship model to
schema.prisma with relationship_type, notes, and updated_at columns. But `npx prisma migrate dev`
was never run, so no migration file was created. The table never existed in production.

Every page that loaded a quote included `sourceRelationships: true` and `targetRelationships: true`
in its Prisma query, causing: "The column piece_relationships.relationship_type does not exist."

**Fix:** Created the migration + added try/catch safety guards.
**Prevention:** Rules 46-49 — Schema-code parity gate, migration verification.

## Impact

- ~4 hours of complete quote system downtime
- All quote viewing, editing, and creation broken
- 3 separate emergency PRs required

## Prevention Rules Added

- Rule 46: Schema-Code Parity Gate
- Rule 47: New Table Deployment Checklist
- Rule 48: Stub-First for Unreleased Features
- Rule 49: Pre-Merge Migration Verification
- Rule 50: Prisma Client Never in Browser Bundle
