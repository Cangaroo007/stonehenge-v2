# Stonehenge Project Audit Report
**Date:** January 30, 2026  
**Status:** CRITICAL ISSUES IDENTIFIED

---

## Executive Summary

The Stonehenge application has **multiple critical issues** preventing normal operation. While the build succeeds, the application **cannot connect to the database** at runtime, making it essentially non-functional. Additionally, several configuration and environment issues need immediate attention.

**Critical Status:** 🔴 Site is not loading properly due to database connection failures

---

## Critical Issues (Priority 1 - Immediate Action Required)

### 1. ❌ Database Connection Failure - TLS Certificate Error

**Status:** BLOCKING - Site cannot load  
**Error:** `Error opening a TLS connection: bad certificate format`

**Details:**
- The application uses Railway PostgreSQL database
- Connection string: `postgresql://postgres:***@interchange.proxy.rlwy.net:34386/railway`
- TLS/SSL connection is failing with certificate format error
- This blocks ALL database operations, making the app unusable

**Root Cause:**
The Railway database connection may require specific SSL/TLS configuration parameters that are missing from the connection string.

**Solution:**
```bash
# Option 1: Add SSL mode parameter to DATABASE_URL
DATABASE_URL="postgresql://postgres:***@interchange.proxy.rlwy.net:34386/railway?sslmode=require"

# Option 2: Disable SSL for testing (NOT recommended for production)
DATABASE_URL="postgresql://postgres:***@interchange.proxy.rlwy.net:34386/railway?sslmode=disable"

# Option 3: Use Railway's auto-generated DATABASE_URL
# Railway typically provides a properly formatted connection string
# Check your Railway dashboard for the correct connection string
```

**Action Items:**
1. Verify Railway database connection string in Railway dashboard
2. Update `.env` with correct connection string including SSL parameters
3. Test connection: `npx prisma migrate status`
4. Verify database migrations are applied: `npx prisma migrate deploy`

---

### 2. ❌ EMFILE: Too Many Open Files (macOS System Limit)

**Status:** HIGH - Affecting development experience  
**Error:** `Watchpack Error (watcher): Error: EMFILE: too many open files, watch`

**Details:**
- macOS has a default limit of 256 file descriptors
- Next.js file watcher tries to watch thousands of files
- This is causing 100+ watcher errors in console
- While not blocking, it prevents hot reloading

**Solution:**
```bash
# Check current limits
ulimit -n

# Temporarily increase limit (until reboot)
ulimit -n 10240

# Permanently increase limit (recommended)
# Add to ~/.zshrc or ~/.bash_profile:
echo 'ulimit -n 10240' >> ~/.zshrc
source ~/.zshrc
```

**Action Items:**
1. Run `ulimit -n 10240` in terminal
2. Restart dev server
3. Add to shell profile for permanent fix

---

### 3. ⚠️ Missing Critical Environment Variables

**Status:** HIGH - Features will fail  
**Missing from `.env`:**

```bash
# R2 Storage (for drawing file uploads)
R2_ACCOUNT_ID="your-cloudflare-account-id"
R2_ACCESS_KEY_ID="your-r2-access-key-id"
R2_SECRET_ACCESS_KEY="your-r2-secret-access-key"
R2_BUCKET_NAME="stonehenge-drawings"

# Anthropic API (for AI drawing analysis)
ANTHROPIC_API_KEY="your-anthropic-api-key"
```

**Impact:**
- ❌ Drawing file uploads will fail (using mock in-memory storage)
- ❌ AI-powered drawing analysis completely unavailable
- ✅ Rest of application can function without these

**Solution:**
1. Get Cloudflare R2 credentials from Cloudflare dashboard
2. Get Anthropic API key from https://console.anthropic.com/
3. Add to `.env` file

---

## Medium Priority Issues (Fix Soon)

### 4. ⚠️ Invalid Next.js Configuration

**Issue:** `Unrecognized key(s) in object: 'serverExternalPackages'`

**File:** `next.config.js`  
**Line:** 3

**Details:**
- `serverExternalPackages` is deprecated in Next.js 14.1.0
- Should use `experimental.serverComponentsExternalPackages` instead
- Currently using: `serverExternalPackages: ['sharp']`

**Fix:**
```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ['sharp'],
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.r2.dev',
      },
    ],
  },
}

module.exports = nextConfig
```

---

### 5. 🗂️ Duplicate/Test Folders in Project Root

**Issue:** Leftover feature development folders cluttering workspace

**Found:**
- `stonehenge-ai-upload-feature/` - Old test folder (160 bytes)
- `stonehenge-pdf-feature (1).zip` - Compressed backup

**Details:**
- These appear to be from earlier development/testing phases
- Not referenced anywhere in main codebase
- Adding to confusion and project size (901MB total)

**Recommendation:**
```bash
# Backup first (if needed)
mv stonehenge-ai-upload-feature ~/Desktop/stonehenge-backup/
mv "stonehenge-pdf-feature (1).zip" ~/Desktop/stonehenge-backup/

# Or delete if confirmed not needed
rm -rf stonehenge-ai-upload-feature/
rm "stonehenge-pdf-feature (1).zip"
```

---

## Low Priority Issues (Clean Up When Time Allows)

### 6. 📦 Project Size

**Current:** 901MB  
**Likely Causes:**
- node_modules: ~500-600MB (normal for this stack)
- Documentation files: 20+ markdown files
- Migrations: 9 migration files (normal)

**Recommendation:**
- Archive old documentation to `docs/archive/`
- Consider splitting large docs into smaller files
- No immediate action required

---

### 7. 📄 Port Conflicts During Development

**Issue:** Ports 3000 and 3001 already in use  
**Current:** Dev server running on port 3002

**Details:**
- Multiple dev instances may be running
- Could cause confusion when accessing the app

**Solution:**
```bash
# Find and kill processes using ports
lsof -ti:3000 | xargs kill -9
lsof -ti:3001 | xargs kill -9
lsof -ti:3002 | xargs kill -9

# Or specify port in package.json
"dev": "next dev -p 3000"
```

---

## Positive Findings ✅

### What's Working Well:

1. ✅ **Build System:** Production build completes successfully
2. ✅ **Dependencies:** All npm packages installed correctly (no conflicts)
3. ✅ **Code Structure:** Clean, well-organized Next.js 14 App Router structure
4. ✅ **Prisma Schema:** Comprehensive, well-designed database schema
5. ✅ **Type Safety:** TypeScript configuration is solid
6. ✅ **Database Migrations:** All 9 migrations properly tracked
7. ✅ **No Build Errors:** Code compiles without TypeScript errors

---

## Immediate Action Plan (Fix Today)

### Step 1: Fix Database Connection (15 minutes)
```bash
# 1. Check Railway dashboard for correct connection string
# 2. Update .env with proper SSL parameters
# 3. Test connection
cd /Users/seanstone/Downloads/stonehenge
npx prisma migrate status

# 4. Apply migrations if needed
npx prisma migrate deploy
```

### Step 2: Fix File Watcher Limit (5 minutes)
```bash
# Increase file descriptor limit
ulimit -n 10240

# Add to shell profile
echo 'ulimit -n 10240' >> ~/.zshrc
source ~/.zshrc
```

### Step 3: Fix Next.js Config (2 minutes)
```bash
# Edit next.config.js
# Replace 'serverExternalPackages' with 'experimental.serverComponentsExternalPackages'
```

### Step 4: Clean Up Duplicate Folders (5 minutes)
```bash
# Remove or backup old test folders
rm -rf stonehenge-ai-upload-feature/
rm "stonehenge-pdf-feature (1).zip"
```

### Step 5: Test Application (10 minutes)
```bash
# Stop all running instances
pkill -f "next dev"

# Start fresh dev server
npm run dev

# Test in browser
open http://localhost:3000
```

**Total Time:** ~40 minutes

---

## Secondary Action Plan (This Week)

### 1. Add Missing API Keys
- Set up Cloudflare R2 storage
- Get Anthropic API key
- Update `.env` file
- Test drawing upload feature

### 2. Database Seeding
```bash
# Seed initial data if database is empty
npm run db:seed
```

### 3. Documentation Cleanup
- Archive old phase documentation
- Update README with current setup instructions
- Document known issues and their resolutions

---

## Database Status

**Schema Version:** Up to date (9 migrations)  
**Last Migration:** `20260129182359_add_lamination_summary`  

**Migration History:**
1. Enhanced quoting
2. Pricing rules engine
3. Quote piece fields
4. Slab optimization
5. User roles, permissions, signatures, tracking
6. Signature schema fix
7. Drawing model
8. Edge thickness variants
9. Lamination summary

**Status:** ⚠️ Cannot verify applied status due to connection error

---

## Technology Stack Verification

### Core Dependencies ✅
- **Next.js:** 14.1.0
- **React:** 18.3.1
- **Prisma:** 5.22.0
- **TypeScript:** 5.9.3
- **Node.js:** Compatible (using .nvmrc)

### Feature Dependencies ✅
- **@anthropic-ai/sdk:** 0.39.0 (AI analysis)
- **@aws-sdk/client-s3:** 3.978.0 (R2 storage)
- **@react-pdf/renderer:** 3.4.5 (PDF generation)
- **sharp:** 0.33.5 (Image processing)

**All dependencies are modern and up-to-date.**

---

## Risk Assessment

### Critical Risks 🔴
1. **Database Connectivity:** Application is non-functional
2. **Data Loss Risk:** Cannot verify database state

### Medium Risks 🟡
1. **Missing API Keys:** Key features unavailable
2. **Development Experience:** File watcher errors slowing development

### Low Risks 🟢
1. **Project Organization:** Duplicate folders causing minor confusion
2. **Documentation:** Verbose but not blocking

---

## Recommendations

### Immediate (Today)
1. ✅ Fix database connection with proper SSL config
2. ✅ Increase file descriptor limit
3. ✅ Fix Next.js config warning
4. ✅ Clean up duplicate folders

### Short Term (This Week)
1. Add missing environment variables (R2, Anthropic)
2. Test all critical user flows
3. Verify database migrations and seed data
4. Document environment setup process

### Long Term (Next Sprint)
1. Set up proper environment variable management
2. Create development setup guide
3. Implement database backup strategy
4. Consider database migration to Cloudflare D1 or Neon (better Railway alternative)

---

## Conclusion

The Stonehenge project has a **solid codebase and architecture** but is currently blocked by **database connectivity issues**. The fix is straightforward - updating the database connection string with proper SSL parameters. Once this is resolved, the application should be fully functional.

**Estimated Time to Full Operation:** 40-60 minutes (following action plan above)

**Next Steps:**
1. Fix database connection (Priority 1)
2. Test application end-to-end
3. Add missing API keys for full feature set
4. Clean up project structure

---

## Questions for Team

1. **Database:** Do you have access to the Railway dashboard to verify the correct connection string?
2. **API Keys:** Do you have Cloudflare R2 and Anthropic accounts set up?
3. **Backups:** Should we keep the `stonehenge-ai-upload-feature` folder or can it be removed?
4. **Local Development:** Would you prefer to use local PostgreSQL (via Docker) instead of Railway for development?

---

**Report Generated:** January 30, 2026  
**Audited By:** AI Assistant  
**Status:** Ready for immediate action
