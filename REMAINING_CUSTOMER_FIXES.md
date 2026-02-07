# ⚠️ Additional Fix Required - Customers Relation

## Current Fix (Commit `7d75fe5`)
Fixed the **immediate build error**:
- Dashboard: `quote.customer` → `quote.customers`
- Quotes list: `quote.customer` → `quote.customers`
- API routes: `include: { customer: true }` → `include: { customers: true }`

## ✅ Build Should Now Succeed

The TypeScript build error has been resolved.

## 📋 Remaining Issues (Runtime)

There are **many more files** that access `quote.customer` which should be `quote.customers`. These won't cause build failures but **will cause runtime errors** when those pages are accessed:

### High Priority (User-Facing Pages)
1. **Quote Detail Page**: `/src/app/(dashboard)/quotes/[id]/page.tsx`
   - Lines 111-113, 138: `quote.customer?.name`, `quote.customer?.company`

2. **Quote Builder**: `/src/app/(dashboard)/quotes/[id]/builder/page.tsx`
   - Lines 743-745, 785: `quote.customer?.company`, `quote.customer?.name`, etc.

3. **Quote Builder Header**: `/src/app/(dashboard)/quotes/[id]/builder/components/QuoteHeader.tsx`
   - Lines 85-86: `quote.customer.name`, `quote.customer.company`

4. **Portal Quote View**: `/src/app/(portal)/portal/quotes/[id]/page.tsx`
   - Line 128: `quote.customer?.company`

5. **Optimize Page**: `/src/app/(dashboard)/optimize/page.tsx`
   - Line 301: `quote.customer?.company`

6. **Unit Block Pages**:
   - `/src/app/(dashboard)/quotes/unit-block/page.tsx` (line 154)
   - `/src/app/(dashboard)/quotes/unit-block/[id]/page.tsx` (line 72)

7. **Admin Users Page**: `/src/app/(dashboard)/admin/users/page.tsx`
   - Line 188: `user.customer.company`

### Medium Priority (Backend/PDF)
8. **Quote PDF**: `/src/components/QuotePDF.tsx`
   - Lines 332-333: `quote.customer?.name`, `quote.customer?.company`

9. **PDF API**: `/src/app/api/quotes/[id]/pdf/route.ts`
   - Line 239: `quote.customer?.name`, `quote.customer?.company`

10. **Sign API**: `/src/app/api/quotes/[id]/sign/route.ts`
    - Line 136 (commented): `quote.customer?.name`

### Low Priority (Calculators - May Work If Already Loaded)
11. **Pricing Calculator**: `/src/lib/services/pricing-calculator-v2.ts`
    - Lines 310, 385-387: `quote.customer?.client_tiers`, `quote.customer?.clientTypeId`

12. **Calculator Index**: `/src/lib/calculators/index.ts`
    - Line 389: `this.quoteData?.customer?.client_tiers`

### Note
13. **Version Services**: These might work since they use custom snapshots:
    - `/src/lib/quote-version-diff.ts`
    - `/src/lib/services/quote-version-service.ts`

## 🎯 Recommendation

**Option 1 (Quick Fix)**: Fix only the high-priority user-facing pages now:
- Quote detail
- Quote builder
- Portal pages
- Unit block pages

**Option 2 (Complete Fix)**: Fix all instances in one go with a search-and-replace:
- Search: `\.customer(?!s)`
- Replace with careful review of each instance

**Option 3 (Schema Fix)**: Rename the relation in `prisma/schema.prisma`:
```prisma
model quotes {
  customer_id  Int?
  customer     customers?  @relation(fields: [customer_id], references: [id])  // singular
}
```
Then run `npx prisma generate` and all TypeScript types will be correct.

## Current Status

✅ Build will succeed  
⚠️ Runtime errors will occur when accessing certain pages  
🔄 Deployment in progress with basic fix

**Next Steps**: Decide which option to pursue based on urgency and scope.
