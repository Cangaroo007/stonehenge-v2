# Setting Up Fresh PostgreSQL for Stonehenge V2

## The Issue

Your v2's Postgres service exists but the hostname `Postgres.railway.internal` or `postgres.railway.internal` doesn't resolve. This means either:
1. The service name is wrong
2. The services aren't in the same private network
3. The Postgres service needs to be recreated

## Solution: Create Fresh PostgreSQL Service

### Step 1: Remove the Broken Postgres Connection

**In Railway Dashboard (stonehenge-v2 service):**

1. Go to **Variables** tab
2. Find `DATABASE_URL` and `DATABASE_PUBLIC_URL`
3. Delete both (click three dots → Remove)

### Step 2: Create New PostgreSQL Service

**In Railway Dashboard (friendly-simplicity project):**

1. Click **"+ New"** button in your project
2. Select **"Database"**
3. Choose **"PostgreSQL"**
4. Wait 30-60 seconds for it to provision
5. You should see a new **"Postgres"** or **"postgresql"** service card

### Step 3: Link Services Properly

**Option A: Automatic (Recommended)**

1. Click on the **new Postgres service** you just created
2. Go to **Settings** tab
3. Look for **"Connected Services"** or similar section
4. Click **"Connect to Service"**
5. Select **stonehenge-v2**
6. Railway should auto-inject `DATABASE_URL` and `DATABASE_PUBLIC_URL`

**Option B: Manual Variable Reference**

1. Click on **stonehenge-v2** service
2. Go to **Variables** tab
3. Click **"+ New Variable"**
4. Select **"Add a Reference"**
5. For variable name: `DATABASE_URL`
6. For service: Select your **new Postgres** service
7. For variable to reference: Select `DATABASE_URL`
8. Click **"Add"**
9. Repeat for `DATABASE_PUBLIC_URL`

### Step 4: Verify the Connection URL

After adding the references, check that DATABASE_URL now shows something like:
```
postgresql://postgres:XXXXX@postgres.railway.internal:5432/railway
```

The key is it should be **lowercase** `postgres.railway.internal` and it should be a **Reference** not a raw value.

### Step 5: Run Migrations

Before deploying, run migrations against the new empty database:

```bash
cd /Users/seanstone/Downloads/stonehenge-v2

# This will run migrations on the new database
railway run npx prisma migrate deploy

# Optionally, seed initial data
railway run npm run db:seed
```

### Step 6: Deploy

1. Go to **Deployments** tab in stonehenge-v2
2. Click **"Redeploy"**
3. Watch the logs - you should see:
   ```
   Datasource "db": PostgreSQL database "railway", schema "public" at "postgres.railway.internal:5432"
   
   16 migrations found in prisma/migrations
   All migrations have been successfully applied.
   
   ✓ Ready in 390ms
   ```

### Step 7: Test

```bash
curl https://stonehenge-v2-production.up.railway.app/api/health
```

Should return:
```json
{"status":"ok","database":"connected","timestamp":"..."}
```

---

## If You Want to Remove the Old Postgres

If the old broken "Postgres" service is still there:

1. Click on the **old Postgres** service
2. Go to **Settings** tab
3. Scroll to bottom → **"Remove Service from All Environments"**
4. Confirm deletion

**WARNING:** Only do this if you're sure the old one isn't used by anything!

---

## Alternative: Check if Current Postgres is Reachable

Before creating a new one, let's verify the current Postgres service:

### Check Service Name:

In Railway Dashboard, look at your Postgres service card - what is it called exactly?
- "Postgres" (capital P)?
- "postgres" (lowercase)?
- "postgresql"?
- Something else?

The hostname will be: `[service-name].railway.internal`

### Check Environment:

Make sure both services are in the **same environment**:
1. Postgres service - check which environment it's in (production, staging, etc.)
2. stonehenge-v2 service - check which environment it's in

They MUST be in the same environment to communicate via private networking!

---

## Expected Final Setup

```
friendly-simplicity project (production environment)
├── Postgres (or postgres)
│   └── DATABASE_URL: postgresql://...@postgres.railway.internal:5432/railway
└── stonehenge-v2
    ├── DATABASE_URL: [Reference to Postgres.DATABASE_URL]
    └── DATABASE_PUBLIC_URL: [Reference to Postgres.DATABASE_PUBLIC_URL]
```

---

## Troubleshooting

**If hostname still doesn't resolve after setup:**

Check that both services show in the same project/environment:
```bash
cd /Users/seanstone/Downloads/stonehenge-v2
railway status
```

Should show both services listed.

**If Railway won't let you create another Postgres:**

You might have a plan limit. In that case:
1. Delete the old broken one first
2. Then create the new one

---

## Next Steps

1. ✅ Create fresh Postgres service
2. ✅ Link it to stonehenge-v2 via Variable References
3. ✅ Run migrations
4. ✅ Deploy
5. ✅ Test

This should give v2 its own clean database with proper private networking! 🚀
