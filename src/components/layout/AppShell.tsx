'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Square,
  Layers,
  Settings,
  ChevronLeft,
  ChevronRight,
  User,
  Building2,
  Menu,
  X,
  LogOut,
  Users,
  Sliders,
  UserCircle,
  ClipboardList,
  Truck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import toast from 'react-hot-toast';
import CommandMenu from './CommandMenu';

interface NavigationItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  indent?: boolean;
}

const navigation: NavigationItem[] = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Quotes', href: '/quotes', icon: FileText },
  { name: 'Unit Block', href: '/quotes/unit-block', icon: Building2 },
  { name: 'Templates', href: '/templates', icon: ClipboardList },
  { name: 'Customers', href: '/customers', icon: UserCircle },
  { name: 'Materials', href: '/materials', icon: Layers },
  { name: 'Suppliers', href: '/materials/suppliers', icon: Truck, indent: true },
  { name: 'Optimiser', href: '/optimize', icon: Square },
  { name: 'Pricing', href: '/admin/pricing', icon: Sliders },
  { name: 'Users', href: '/admin/users', icon: Users },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface AppShellProps {
  children: React.ReactNode;
  user?: {
    name: string;
    email: string;
    organization?: string;
  };
}

export default function AppShell({ children, user }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      toast.success('Logged out successfully');
      router.push('/login');
      router.refresh();
    } catch {
      toast.error('Failed to logout');
    }
  }

  const isActive = (href: string) => {
    if (pathname === href) return true;
    if (!pathname.startsWith(`${href}/`)) return false;
    // Prevent parent items highlighting when a child sub-link is active
    // e.g. /materials should not be active when on /materials/suppliers/*
    const childLinks = navigation.filter((n) => n.indent && n.href.startsWith(`${href}/`));
    for (const child of childLinks) {
      if (pathname === child.href || pathname.startsWith(`${child.href}/`)) return false;
    }
    return true;
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* Command Menu - Triggered by Cmd+K */}
      <CommandMenu user={user} />
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-zinc-900/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar - Desktop */}
      <aside
        className={cn(
          'hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-50 bg-background-sidebar transition-all duration-250 ease-linear-ease',
          collapsed ? 'lg:w-20' : 'lg:w-64'
        )}
      >
        {/* Sidebar Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-800">
          {!collapsed && (
            <Link href="/dashboard" className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
              <span className="text-text-inverse font-semibold text-base">Stone Henge</span>
            </Link>
          )}
          {collapsed && (
            <Link href="/dashboard" className="mx-auto">
              <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
                <span className="text-white font-bold text-lg">S</span>
              </div>
            </Link>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                  'hover:bg-zinc-800',
                  active
                    ? 'bg-zinc-800 text-primary-600'
                    : 'text-zinc-400 hover:text-text-inverse',
                  collapsed && 'justify-center',
                  item.indent && !collapsed && 'pl-10 text-xs'
                )}
                title={collapsed ? item.name : undefined}
              >
                <Icon className={cn(item.indent ? 'h-4 w-4' : 'h-5 w-5', 'shrink-0', active && 'text-primary-600')} />
                {!collapsed && <span>{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User Profile / Org Switcher */}
        <div className="border-t border-zinc-800 p-4">
          <button
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-all duration-150',
              'hover:bg-zinc-800 text-zinc-400 hover:text-text-inverse',
              collapsed && 'justify-center'
            )}
            title={collapsed ? (user?.name || 'User Profile') : undefined}
          >
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-zinc-400" />
            </div>
            {!collapsed && user && (
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-text-inverse text-sm font-medium truncate">{user.name}</p>
                {user.organization && (
                  <p className="text-zinc-500 text-xs truncate flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {user.organization}
                  </p>
                )}
              </div>
            )}
          </button>
        </div>

        {/* Collapse Toggle */}
        <div className="border-t border-zinc-800 p-4">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className={cn(
              'flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-all duration-150',
              'hover:bg-zinc-800 text-zinc-400 hover:text-text-inverse',
              collapsed && 'justify-center'
            )}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? (
              <ChevronRight className="h-5 w-5" />
            ) : (
              <>
                <ChevronLeft className="h-5 w-5" />
                <span>Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 bg-background-sidebar transform transition-transform duration-250 ease-linear-ease lg:hidden',
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Mobile Header */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-zinc-800">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">S</span>
            </div>
            <span className="text-text-inverse font-semibold text-base">Stone Henge</span>
          </Link>
          <button
            onClick={() => setMobileMenuOpen(false)}
            className="p-2 rounded-md text-zinc-400 hover:text-text-inverse hover:bg-zinc-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Mobile Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);

            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={() => setMobileMenuOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all duration-150',
                  'hover:bg-zinc-800',
                  active
                    ? 'bg-zinc-800 text-primary-600'
                    : 'text-zinc-400 hover:text-text-inverse',
                  item.indent && 'pl-10 text-xs'
                )}
              >
                <Icon className={cn(item.indent ? 'h-4 w-4' : 'h-5 w-5', 'shrink-0', active && 'text-primary-600')} />
                <span>{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {/* Mobile User Profile */}
        <div className="border-t border-zinc-800 p-4">
          <button
            className="flex items-center gap-3 w-full px-3 py-2 rounded-md text-sm transition-all duration-150 hover:bg-zinc-800 text-zinc-400 hover:text-text-inverse"
          >
            <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center shrink-0">
              <User className="h-4 w-4 text-zinc-400" />
            </div>
            {user && (
              <div className="flex-1 text-left overflow-hidden">
                <p className="text-text-inverse text-sm font-medium truncate">{user.name}</p>
                {user.organization && (
                  <p className="text-zinc-500 text-xs truncate flex items-center gap-1">
                    <Building2 className="h-3 w-3" />
                    {user.organization}
                  </p>
                )}
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div
        className={cn(
          'flex-1 flex flex-col transition-all duration-250 ease-linear-ease',
          'lg:ml-64',
          collapsed && 'lg:ml-20'
        )}
      >
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-border bg-background-surface px-4 lg:px-6">
          {/* Mobile menu button */}
          <button
            onClick={() => setMobileMenuOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-md text-text-secondary hover:text-text-primary hover:bg-zinc-100"
          >
            <Menu className="h-5 w-5" />
          </button>

          {/* Header content can be customized per page */}
          <div className="flex-1" />
          
          {/* Right side of header - user info and logout */}
          <div className="flex items-center gap-4">
            {user && (
              <>
                <span className="text-sm text-text-secondary hidden sm:inline">
                  {user.name || user.email}
                </span>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-zinc-100 rounded-md transition-colors"
                  title="Sign out"
                >
                  <LogOut className="h-4 w-4" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 overflow-y-auto">
          <div className="p-4 lg:p-6 lg:p-8">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
