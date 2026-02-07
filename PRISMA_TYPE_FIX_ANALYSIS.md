# Prisma Type Mismatch - Root Cause Analysis

## Problem
Railway logs show runtime Prisma errors:
```
Error converting field "id" of expected non-nullable type "String", found incompatible value of "1".
Error converting field "company_id" of expected non-nullable type "String", found incompatible value of "1".
```

## Root Cause
The `companies` model uses **UUID (String)** but the database contains **Integer values**.

### Schema Definition (Lines 56-79)
```prisma
model companies {
  id          String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  company_id  String?   @db.Uuid  // In user model (line 536)
  ...
}
```

### Actual Database State
- `companies.id` = `1` (Integer)
- `user.company_id` = `1` (Integer)

## Impact
Affects ALL queries that touch:
- `companies` table
- `user` table (via `company_id` foreign key)
- Any API endpoints that query company settings
- PDF generation (requires company data)
- Quote views (may reference company)

## Fix Strategy

### Option A: Change Schema to Int (RECOMMENDED)
**Pros:**
- Matches existing data
- No data migration needed
- Auto-increment is simpler
- Better performance for joins

**Cons:**
- Loses UUID benefits (global uniqueness, security)
- Migration file needed

### Option B: Convert Database to UUIDs
**Pros:**
- Keeps UUID benefits
- Follows original design intent

**Cons:**
- Complex data migration
- Need to update all foreign keys
- Potential downtime
- Risk of data loss if not careful

## Recommended Fix: Option A

Change schema to use `Int` for `companies.id` and `user.company_id`.

### Migration Steps

1. **Update Schema** (`prisma/schema.prisma`)
```prisma
model companies {
  id         Int       @id @default(autoincrement())  // Changed from String/UUID
  // ... rest stays same
}

model user {
  company_id Int?      // Changed from String? @db.Uuid
  // ... rest stays same
}
```

2. **Create Migration**
```bash
npx prisma migrate dev --name fix_company_id_to_int
```

3. **Test Locally**
- Run migration on local dev database
- Test all company-related endpoints
- Test user authentication and company assignment
- Test PDF generation
- Test quote creation

4. **Deploy to Railway**
```bash
git add .
git commit -m "fix: change companies.id from UUID to Int to match database"
git push origin main
```

5. **Verify**
- Check Railway logs for Prisma errors
- Test company settings page
- Test quote PDF generation
- Test all CRUD operations on users

## Other Potential Mismatches Found

### Already Correct (Int in both schema and DB):
- ✅ `customers.id` - Int @default(autoincrement())
- ✅ `quotes.id` - Int @default(autoincrement())
- ✅ `user.id` - Int @default(autoincrement())
- ✅ `materials.id` - Int @default(autoincrement())
- ✅ `quote_pieces.id` - Int @default(autoincrement())
- ✅ `quote_rooms.id` - Int @default(autoincrement())
- ✅ All other auto-increment models

### Already Correct (String/UUID in both):
- ✅ `client_tiers.id` - String @id
- ✅ `client_types.id` - String @id
- ✅ `price_books.id` - String @id
- ✅ `machine_profiles.id` - String @id
- ✅ `edge_types.id` - String @id
- ✅ `cutout_types.id` - String @id
- ✅ `pricing_rules_engine.id` - String @id
- ✅ `pricing_settings.id` - String @id

### ONLY ISSUE:
- 🔴 `companies.id` - Schema says String/UUID, DB has Int
- 🔴 `user.company_id` - Schema says String/UUID, DB has Int

## Files to Modify
1. `prisma/schema.prisma` (lines 57, 536)
2. Create new migration file via Prisma CLI

## Post-Fix Testing Checklist
- [ ] No Prisma errors in Railway logs
- [ ] Company settings page loads
- [ ] User profile shows company correctly
- [ ] Quote PDF generation works
- [ ] Can create/edit/delete users with company assignment
- [ ] All existing quotes still accessible
- [ ] No 500 errors in any API routes
