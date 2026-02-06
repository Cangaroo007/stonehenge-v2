import { NextResponse } from 'next/server';
import prisma from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  let dbStatus = 'unavailable';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch (error) {
    // Database may be unavailable during build - that's expected
    console.log('Health check: DB not reachable (normal during build)');
  }

  return NextResponse.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    database: dbStatus,
  });
}
