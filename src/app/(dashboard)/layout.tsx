import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { UnitProvider } from '@/lib/contexts/UnitContext';
import AppShell from '@/components/layout/AppShell';

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  return (
    <AppShell
      user={{
        name: user.name || user.email,
        email: user.email,
        organization: undefined, // Can be populated from company settings if needed
      }}
    >
      <UnitProvider>{children}</UnitProvider>
    </AppShell>
  );
}
