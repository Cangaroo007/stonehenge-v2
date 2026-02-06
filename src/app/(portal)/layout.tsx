import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { UserRole } from '@prisma/client';
import Link from 'next/link';
import { UnitProvider } from '@/lib/contexts/UnitContext';

export default async function PortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  // Redirect if not logged in
  if (!user) {
    redirect('/login');
  }

  // Only allow CUSTOMER role users in portal
  if (user.role !== UserRole.CUSTOMER) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Portal Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/portal" className="text-xl font-bold text-primary-600">
              Stone Henge
            </Link>

            {/* User Info */}
            <div className="flex items-center gap-4">
              <div className="text-right">
                <div className="text-sm font-medium text-gray-900">
                  {user.name || 'Customer'}
                </div>
                <div className="text-xs text-gray-500">{user.email}</div>
              </div>
              <Link
                href="/api/auth/logout"
                className="text-sm text-gray-600 hover:text-gray-900"
              >
                Logout
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <UnitProvider>{children}</UnitProvider>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-sm text-gray-500">
            © {new Date().getFullYear()} Stone Henge. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
