'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const tabs = [
  { name: 'Configuration Health', href: '/admin/pricing/gaps' },
  { name: 'Settings', href: '/admin/pricing/settings' },
  { name: 'Service Rates', href: '/admin/pricing/services' },
  { name: 'Cutout Rates', href: '/admin/pricing/cutouts' },
  { name: 'Edge Rates', href: '/admin/pricing/edges' },
];

export default function PricingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [gapCount, setGapCount] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/admin/pricing/gaps')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.summary?.totalGaps !== undefined) {
          setGapCount(data.summary.totalGaps);
        }
      })
      .catch(() => {
        // Silently fail — badge just won't show
      });
  }, [pathname]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Pricing Management</h1>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8 overflow-x-auto" aria-label="Tabs">
          {tabs.map((tab) => {
            const isActive = pathname === tab.href;
            const isGapsTab = tab.name === 'Configuration Health';

            return (
              <Link
                key={tab.name}
                href={tab.href}
                className={cn(
                  'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium',
                  isActive
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                )}
              >
                {tab.name}
                {isGapsTab && gapCount !== null && gapCount > 0 && (
                  <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full">
                    {gapCount}
                  </span>
                )}
                {isGapsTab && gapCount !== null && gapCount === 0 && (
                  <span className="ml-1 text-green-500">{'\u2713'}</span>
                )}
              </Link>
            );
          })}
        </nav>
      </div>

      {children}
    </div>
  );
}
