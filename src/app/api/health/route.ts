import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const environment = process.env.NODE_ENV || 'development';
  const configChecks = {
    jwtSecret: Boolean(process.env.JWT_SECRET),
    anthropicApiKey: Boolean(process.env.ANTHROPIC_API_KEY),
    r2Storage: Boolean(
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET_NAME &&
      (process.env.R2_ACCOUNT_ID || process.env.R2_ENDPOINT)
    ),
    googleMapsServerKey: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    googleMapsBrowserKey: Boolean(process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY),
    clarityProjectId: Boolean(process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID),
  };
  const missingRequired = [
    environment === 'production' && !configChecks.jwtSecret ? 'JWT_SECRET' : null,
    environment === 'production' && !configChecks.anthropicApiKey ? 'ANTHROPIC_API_KEY' : null,
    environment === 'production' && !configChecks.r2Storage ? 'R2 storage variables' : null,
  ].filter((item): item is string => Boolean(item));

  try {
    // Quick DB ping
    await prisma.$queryRaw`SELECT 1`;
    
    return NextResponse.json(
      {
        status: missingRequired.length > 0 ? 'degraded' : 'ok',
        buildId: process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
        timestamp: new Date().toISOString(),
        database: 'connected',
        environment,
        config: configChecks,
        missingRequired,
      },
      {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'X-Build-Id': process.env.NEXT_PUBLIC_BUILD_ID ?? 'dev',
        },
      }
    );
  } catch (error) {
    console.error('[Health Check] Database connection failed:', error);
    return NextResponse.json(
      { 
        status: 'error',
        timestamp: new Date().toISOString(),
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 503 }
    );
  }
}
