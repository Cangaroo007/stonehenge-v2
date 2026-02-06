# 🗺️ Google Maps API Setup Guide

## Overview

Stonehenge uses Google Maps Distance Matrix API to calculate delivery and templating costs based on distance from your workshop to the customer's location.

---

## 📋 Prerequisites

- Google Cloud account (free to create)
- Credit card (required by Google, but you get $200/month free credit)

---

## 🚀 Step-by-Step Setup

### 1. Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Sign in with your Google account
3. Click the project dropdown at the top of the page
4. Click **"New Project"**
5. Enter a project name (e.g., "Stonehenge Production")
6. Click **"Create"**

### 2. Enable Billing

1. In the left menu, click **"Billing"**
2. Click **"Link a billing account"** or **"Create billing account"**
3. Follow the prompts to add your payment method
4. **Don't worry:** Google provides $200 in free monthly credit
   - Distance Matrix API costs approximately $0.005 per request
   - Even with 1,000 quotes per month, you'll only use ~$5-10

### 3. Enable the Distance Matrix API

1. In the search bar at the top, type **"Distance Matrix API"**
2. Click on **"Distance Matrix API"** in the results
3. Click the blue **"Enable"** button
4. Wait a few seconds for it to activate

### 4. Create API Credentials

1. In the left menu, click **"APIs & Services"** → **"Credentials"**
2. Click **"Create Credentials"** → **"API Key"**
3. A popup will appear with your new API key
4. **Copy the API key** - you'll need this for your `.env` file
5. Click **"Restrict Key"** (very important for security!)

### 5. Secure Your API Key

#### API Restrictions
1. Under **"API restrictions"**, select **"Restrict key"**
2. Click **"Select APIs"** dropdown
3. Choose **"Distance Matrix API"**
4. Click **"Save"**

#### Application Restrictions (Choose one)

**Option A: IP Address Restriction (Recommended for production)**
- Select **"IP addresses"**
- Add your server's IP address
- For Railway: Find your IP in Railway's deployment logs

**Option B: HTTP Referrers (For web apps)**
- Select **"HTTP referrers"**
- Add your domain (e.g., `https://yourdomain.com/*`)

**Option C: No Restrictions (Temporary, for testing only)**
- Only use this during initial development
- Switch to IP or HTTP referrer restrictions before going live

### 6. Add API Key to Your Environment

1. Open your `.env` file (or create it from `.env.example`)
2. Add your Google Maps API key:

```env
GOOGLE_MAPS_API_KEY="AIza..."
```

3. **Important:** Never commit your `.env` file to Git (it's in `.gitignore`)

---

## 💰 Pricing Information

### Free Tier
- **$200 free credit per month** (covers ~40,000 distance calculations)
- More than enough for most fabrication businesses

### Cost Per Request
- Distance Matrix API: **$0.005 per element**
- 1 quote with 1 distance calculation = 1 element = $0.005
- 1,000 quotes/month = ~$5

### Example Monthly Costs
- **100 quotes/month:** ~$0.50
- **500 quotes/month:** ~$2.50
- **1,000 quotes/month:** ~$5.00
- **2,000 quotes/month:** ~$10.00

### Staying Within Budget
- Set up billing alerts in Google Cloud Console
- Configure daily quota limits to prevent overages
- Monitor usage in the Google Cloud Console

---

## 🏢 Multi-Tenancy Architecture

### How It Works

When you onboard a new fabrication company to Stonehenge, each company gets:

1. **Their own Company record** with:
   - Company name, ABN, contact details
   - **Workshop address** (used for distance calculations)
   - Custom branding (logo, colors)
   - Default tax rate and currency

2. **Their own Delivery Zones**:
   - Local (0-30km): $50 base + $2.50/km
   - Regional (30-100km): $75 base + $3.00/km
   - Remote (100-500km): $100 base + $3.50/km
   - Each company can customize these zones

3. **Their own Templating Rates**:
   - Base charge + per km rate
   - Fully customizable per company

4. **Their own Price Books**:
   - Material pricing
   - Edge types and rates
   - Cutout pricing
   - Service rates

### Data Isolation

- All users belong to a Company
- All pricing data is scoped to a Company
- Quotes automatically use the correct company's:
  - Workshop address for distance calculations
  - Delivery zones for cost calculations
  - Pricing rules and rates
  - Tax rates and currency

### Adding New Companies

When onboarding a new fabricator:

```typescript
// Create the company
const company = await prisma.company.create({
  data: {
    name: "New Fabricator Pty Ltd",
    abn: "12 345 678 901",
    address: "123 Main St, City, State, Postcode",
    workshopAddress: "123 Main St, City, State, Postcode", // For Google Maps
    phone: "0412345678",
    email: "contact@newfabricator.com.au",
    defaultTaxRate: 10, // GST %
    currency: "AUD"
  }
});

// Create their admin user
const admin = await prisma.user.create({
  data: {
    email: "admin@newfabricator.com.au",
    name: "Admin User",
    role: "ADMIN",
    companyId: company.id,
    passwordHash: await hash("temporary-password")
  }
});

// Seed their delivery zones
// Seed their templating rates
// Seed their price books
```

---

## 🧪 Testing the Integration

### 1. Test Distance Calculation

```bash
curl -X POST http://localhost:3000/api/distance/calculate \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "destination": "Brisbane, Queensland, Australia"
  }'
```

**Expected Response:**
```json
{
  "distanceKm": 105.3,
  "durationMinutes": 78,
  "originAddress": "20 Hitech Drive, Kunda Park QLD 4556, Australia",
  "destinationAddress": "Brisbane QLD, Australia",
  "deliveryZone": {
    "id": 2,
    "name": "Regional",
    "maxDistanceKm": 100,
    "ratePerKm": 3.00,
    "baseCharge": 75.00
  },
  "deliveryCost": 390.90,
  "templatingCost": 360.60
}
```

### 2. Common Issues

#### "GOOGLE_MAPS_API_KEY not configured"
- Make sure your `.env` file has the API key
- Restart your Next.js dev server after adding the key

#### "REQUEST_DENIED"
- Your API key restrictions are too strict
- Check that "Distance Matrix API" is enabled
- Verify IP restrictions allow your server's IP

#### "OVER_QUERY_LIMIT"
- You've exceeded your daily quota
- Check usage in Google Cloud Console
- Increase quota or wait for daily reset

#### "User is not associated with a company"
- Run the seed script to create the default company
- Update existing users to have a `companyId`

---

## 🔧 Configuration

### Workshop Address Format

The workshop address should be as specific as possible for accurate results:

✅ **Good:** `"20 Hitech Drive, Kunda Park, Queensland 4556, Australia"`

❌ **Bad:** `"Kunda Park"` (too vague)

### Delivery Zones

Edit zones via the Admin UI or database:

```sql
-- View current zones
SELECT * FROM delivery_zones WHERE company_id = 1;

-- Update a zone
UPDATE delivery_zones 
SET base_charge = 60.00, rate_per_km = 2.75 
WHERE id = 1 AND company_id = 1;
```

### Templating Rates

```sql
-- View current rate
SELECT * FROM templating_rates WHERE company_id = 1;

-- Update rate
UPDATE templating_rates 
SET base_charge = 175.00, rate_per_km = 2.50 
WHERE id = 1 AND company_id = 1;
```

---

## 📊 Monitoring Usage

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **"APIs & Services"** → **"Dashboard"**
4. Click on **"Distance Matrix API"**
5. View graphs showing:
   - Requests per day
   - Errors
   - Latency
   - Cost breakdown

---

## 🚨 Security Best Practices

1. **Never commit API keys to Git**
   - Keys belong in `.env` (which is gitignored)
   - Use environment variables in production

2. **Always restrict API keys**
   - Use IP restrictions for server-side apps
   - Use HTTP referrer restrictions for web apps

3. **Set up billing alerts**
   - Get notified if costs exceed expectations
   - Configure in Google Cloud Console → Billing

4. **Rotate keys periodically**
   - Create a new key
   - Update your `.env` file
   - Delete the old key

5. **Monitor for unusual activity**
   - Check request logs regularly
   - Investigate sudden spikes in usage

---

## 📚 Additional Resources

- [Google Maps Distance Matrix API Docs](https://developers.google.com/maps/documentation/distance-matrix)
- [Google Cloud Pricing Calculator](https://cloud.google.com/products/calculator)
- [API Key Security Best Practices](https://cloud.google.com/docs/authentication/api-keys)

---

## 🆘 Support

If you encounter issues:
1. Check the error message in your console logs
2. Verify API key is enabled and restricted correctly
3. Check Google Cloud Console for quota/billing issues
4. Review the testing section above

For Stonehenge-specific issues, refer to the main documentation or contact support.
