# CRITICAL ISSUE: Railway 502 Despite App Ready

## Current Situation

**Status:** 🔴 Still failing after multiple fixes

### What's Working ✅
1. Database connection successful
2. Migrations apply correctly
3. Next.js builds successfully
4. App starts and shows "✓ Ready in 390ms"
5. Binds to port 8080 (correct Railway port)

### What's NOT Working ❌
- Railway returns 502 "Application failed to respond"
- Health endpoint unreachable
- Main page unreachable

## Investigation Summary

| Attempt | Change | Result |
|---------|--------|--------|
| 1 | Added health check, fixed start command | DB connection failed |
| 2 | Added `?sslmode=disable` to DATABASE_URL | Still DB connection failed |
| 3 | Used DATABASE_PUBLIC_URL | ✅ DB connected! |
| 4 | Removed `output: standalone` from next.config | Build successful, still 502 |
| 5 | Removed `-p ${PORT:-3000}` from start script | Still 502 |
| 6 | Explicitly set `PORT=8080` | Still 502 |

## The Mystery

```
Logs show:
✓ Ready in 390ms
- Local:        http://localhost:8080
- Network:      http://0.0.0.0:8080

But Railway returns:
{"status":"error","code":502,"message":"Application failed to respond"}
```

**This suggests:**
- App IS running inside the container
- App IS listening on port 8080
- But Railway's edge proxy CANNOT reach it

## Possible Causes

### 1. Health Check Failure
Railway might be using a health check path that doesn't exist or times out.

**Solution:** Configure health check in Railway Dashboard
- Path: `/api/health`
- Timeout: 30s
- Interval: 60s

### 2. Container Network Issue
The app might be running but not accessible from Railway's network layer.

**Check:** Are there any firewall/network settings in Railway?

### 3. IPv6 vs IPv4 Issue
Binding to `0.0.0.0` should work, but there might be an IPv6 issue.

**Try:** Bind to specific `::` (IPv6) or change network configuration

### 4. Next.js Server Not Responding
Even though logs show "Ready", the HTTP server might not be accepting connections.

**Test:** Add logging to see if requests are reaching the app

### 5. Railway Edge Timeout
The edge proxy might have a very short timeout before marking the app as failed.

**Check:** Railway service settings for timeout configuration

## Next Steps to Try

### Option 1: Add Request Logging

Create `src/middleware.ts`:
```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  console.log('[Middleware] Request received:', request.url);
  return NextResponse.next();
}

export const config = {
  matcher: '/(.*)',
};
```

This will log EVERY request. If we see nothing in logs when testing, the requests aren't reaching Next.js.

### Option 2: Try Different Start Command

Instead of `next start`, try using the standalone server:

In `railway.toml`:
```toml
[deploy]
startCommand = "DATABASE_URL=\"$DATABASE_PUBLIC_URL\" npx prisma migrate deploy && node server.js"
```

Create `server.js`:
```javascript
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');

const port = parseInt(process.env.PORT || '8080', 10);
const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  })
    .once('error', (err) => {
      console.error(err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://0.0.0.0:${port}`);
    });
});
```

### Option 3: Check Railway Service Configuration

In Railway Dashboard:
1. Go to stonehenge-v2 service
2. Settings → Networking
3. Check if there's a specific port configuration
4. Check if there's a health check path configured
5. Check if there's a domain/routing configuration

### Option 4: Compare with Working v1

The original stonehenge (v1) IS working on Railway. Let me compare configurations:

```bash
# Check v1 configuration
cd /Users/seanstone/Downloads/stonehenge
cat railway.toml
cat package.json | grep start
```

See what's different!

### Option 5: Nuclear - Fresh Railway Service

Create a completely new Railway service:
1. Delete current stonehenge-v2 service
2. Create new service from GitHub
3. Add PostgreSQL
4. Link database
5. Deploy

## Recommendation

**IMMEDIATE:** Compare with working stonehenge v1 configuration to see what's different.

**IF v1 comparison doesn't help:** Try Option 2 (custom server.js) for more control and logging.

**LAST RESORT:** Fresh Railway service (Option 5).

---

**Status:** Need to investigate why Railway edge can't reach the app despite it being "Ready"
