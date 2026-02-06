import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  const checks: Record<string, string> = {};

  try {
    // Quick DB ping
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'connected';
  } catch (error) {
    checks.database = `error: ${error instanceof Error ? error.message : 'Unknown'}`;
    return NextResponse.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      checks,
    }, { status: 503 });
  }

  try {
    // Check seed data
    const userCount = await prisma.user.count();
    const companyCount = await prisma.company.count();
    const adminUser = await prisma.user.findUnique({
      where: { email: 'admin@northcoaststone.com.au' },
      select: { id: true, email: true, role: true, companyId: true, isActive: true },
    });
    checks.users = `${userCount} total`;
    checks.companies = `${companyCount} total`;
    checks.adminUser = adminUser
      ? `found (companyId=${adminUser.companyId}, role=${adminUser.role}, active=${adminUser.isActive})`
      : 'NOT FOUND - seed may not have run';
  } catch (error) {
    checks.seedCheck = `error: ${error instanceof Error ? error.message : 'Unknown'}`;
  }

  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    checks,
  });
}
