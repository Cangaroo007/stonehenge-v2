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

In the **"Variables"** tab, add these variables:

| Variable | Value |
|----------|-------|
| `JWT_SECRET` | `stonehenge-production-secret-change-me-2024` |
| `NEXT_PUBLIC_APP_NAME` | `Stone Henge` |
| `NEXT_PUBLIC_CURRENCY` | `AUD` |
| `NEXT_PUBLIC_TAX_RATE` | `10` |
| `NEXT_PUBLIC_TAX_NAME` | `GST` |
| `COMPANY_NAME` | `Northcoast Stone Pty Ltd` |
| `COMPANY_ABN` | `57 120 880 355` |
| `COMPANY_ADDRESS` | `20 Hitech Drive, KUNDA PARK Queensland 4556, Australia` |
| `COMPANY_PHONE` | `0754767636` |
| `COMPANY_EMAIL` | `admin@northcoaststone.com.au` |

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

---

## Updating the App

After making changes locally:

```bash
git add .
git commit -m "Your change description"
git push
```

Railway will automatically redeploy!
