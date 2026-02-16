'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Redirects /materials/suppliers to /materials?tab=suppliers.
 * The suppliers list is embedded as a tab on the Materials page.
 */
export default function SuppliersRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/materials?tab=suppliers');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <p className="text-gray-500">Redirecting to suppliers...</p>
    </div>
  );
}
