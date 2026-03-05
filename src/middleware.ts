import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';

const PUBLIC_API_ROUTES = [
  '/api/auth/login',
  '/api/auth/logout',
  '/api/health',
  '/api/company/logo/view',
];

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'fallback-dev-secret-do-not-use-in-production'
);

const COOKIE_NAME = 'stonehenge-token';

function addCacheHeaders(response: NextResponse) {
  response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  response.headers.set('Pragma', 'no-cache');
  response.headers.set('Expires', '0');
  response.headers.set('Surrogate-Control', 'no-store');
  response.headers.set('X-Build-Id', process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev');
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // For non-API routes, add cache-busting headers and pass through
  if (!pathname.startsWith('/api/')) {
    const response = NextResponse.next();
    return addCacheHeaders(response);
  }

  // Allow public API routes (with cache headers)
  if (PUBLIC_API_ROUTES.some(route => pathname.startsWith(route))) {
    const response = NextResponse.next();
    return addCacheHeaders(response);
  }

  // Check for auth token
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return NextResponse.json(
      { error: 'Unauthorized: No authentication token' },
      { status: 401 }
    );
  }

  try {
    await jwtVerify(token, JWT_SECRET);
    const response = NextResponse.next();
    return addCacheHeaders(response);
  } catch {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid token' },
      { status: 401 }
    );
  }
}

export const config = {
  // Match all routes except static files and images
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js)$).*)',
  ],
};
