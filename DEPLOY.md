# Deploying Stone Henge to Railway

## Prerequisites

- GitHub account (username: Cangaroo007)
- Railway account (sign up at railway.app with GitHub)

## Step 1: Push to GitHub

Open your terminal and run these commands one at a time:

```bash
# Navigate to your project folder
cd stonehenge

# Initialize git repository
git init

# Add all files
git add .

# Create first commit
git commit -m "Initial commit - Stone Henge MVP"

# Add your GitHub repository as remote
git remote add origin https://github.com/Cangaroo007/stonehenge.git

# Push to GitHub
git branch -M main
git push -u origin main
```

**Note:** If this is your first time using git from command line, you may be prompted to authenticate. Follow the prompts.

## Step 2: Create Railway Project

1. Go to https://railway.app
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Find and select **"stonehenge"** from your repos
5. Click **"Deploy Now"**

## Step 3: Add PostgreSQL Database

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Wait for it to provision (30 seconds)

## Step 4: Connect Database to App

1. Click on your **stonehenge** service
2. Go to **"Variables"** tab
3. Click **"Add Variable Reference"**
4. Select **DATABASE_URL** from the PostgreSQL service
5. It will automatically link them

## Step 5: Add Required Environment Variables

In the **"Variables"** tab, add the production variables below. Never reuse a development `.env` file or any value copied from this document.

Generate `JWT_SECRET` locally with:

```bash
openssl rand -base64 48
```

| Variable | Required | Notes |
|----------|----------|-------|
| `DATABASE_URL` | Yes | Railway PostgreSQL private/internal URL. |
| `DATABASE_PUBLIC_URL` | Yes | Railway PostgreSQL public URL used during deploy migrations. |
| `JWT_SECRET` | Yes | Use a newly generated secret. Production auth fails if this is missing. |
| `ANTHROPIC_API_KEY` | Yes | Required for drawing interpretation and price-list parsing. |
| `R2_ACCESS_KEY_ID` | Yes | Required for production drawing/file uploads. |
| `R2_SECRET_ACCESS_KEY` | Yes | Required for production drawing/file uploads. |
| `R2_BUCKET_NAME` | Yes | Usually `stonehenge-drawings`. |
| `R2_ACCOUNT_ID` or `R2_ENDPOINT` | Yes | Provide one. Endpoint wins if both are set. |
| `GOOGLE_MAPS_API_KEY` | Recommended | Server-side distance calculations. |
| `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` | Recommended | Browser-side maps/distance UI. |
| `NEXT_PUBLIC_CLARITY_PROJECT_ID` | Recommended | Microsoft Clarity project id for session replay and quote-entry diagnostics. |
| `COMPANY_ADDRESS` | Recommended | Default origin for distance calculations. |
| `NEXT_PUBLIC_BUILD_ID` | Recommended | Set per deploy if you want browser version mismatch detection. |
| `LOG_LEVEL` | Optional | Defaults to quiet in production. |

## Step 6: Trigger Redeploy

After adding variables:
1. Go to **"Deployments"** tab
2. Click the three dots on the latest deployment
3. Select **"Redeploy"**

## Step 7: Seed the Database

After successful deployment:
1. Click on your stonehenge service
2. Go to **"Settings"** tab
3. Find **"Railway CLI"** or use the web terminal
4. Run: `npx prisma db seed`

Alternatively, use the Railway CLI locally:
```bash
railway link
railway run npx prisma db seed
```

## Step 8: Get Your URL

1. Go to **"Settings"** tab
2. Under **"Domains"**, click **"Generate Domain"**
3. You'll get a URL like: `stonehenge-production.up.railway.app`

## Done!

Your app is now live! Share the URL with others to test.

**Default login:**
- Email: admin@northcoaststone.com.au
- Password: demo1234

---

## Troubleshooting

### Build fails
- Check the deploy logs for errors
- Make sure all environment variables are set

### Database connection error
- Verify DATABASE_URL is linked from PostgreSQL service
- Try redeploying after adding the variable

### Can't login
- Make sure you ran the seed command
- Check that JWT_SECRET is set

### JWT_SECRET warning during build
- Local development can run without `JWT_SECRET`, but production cannot.
- Production requests return an auth configuration error if `JWT_SECRET` is missing.
- Set `JWT_SECRET` in Railway and redeploy.

---

## Updating the App

After making changes locally:

```bash
git add .
git commit -m "Your change description"
git push
```

Railway will automatically redeploy!
