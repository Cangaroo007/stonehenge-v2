'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Square,
  Layers,
  Settings,
  User,
  Building2,
  Search,
  Users,
  Sliders,
  UserCircle,
} from 'lucide-react';

interface CommandMenuProps {
  user?: {
    name: string;
    email: string;
    organization?: string;
  };
}

interface Command {
  id: string;
  label: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  action: () => void;
  keywords?: string[];
}

export default function CommandMenu({ user }: CommandMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const router = useRouter();

  // Define available commands
  const commands: Command[] = [
    {
      id: 'dashboard',
      label: 'Go to Dashboard',
      description: 'View your dashboard',
      icon: LayoutDashboard,
      action: () => router.push('/dashboard'),
      keywords: ['home', 'overview'],
    },
    {
      id: 'quotes',
      label: 'Go to Quotes',
      description: 'View and manage quotes',
      icon: FileText,
      action: () => router.push('/quotes'),
      keywords: ['quote', 'estimate'],
    },
    {
      id: 'new-quote',
      label: 'Create New Quote',
      description: 'Start a new quote',
      icon: FileText,
      action: () => router.push('/quotes/new'),
      keywords: ['add', 'create', 'new'],
    },
    {
      id: 'customers',
      label: 'Go to Customers',
      description: 'View and manage customers',
      icon: UserCircle,
      action: () => router.push('/customers'),
      keywords: ['customer', 'client', 'contact'],
    },
    {
      id: 'materials',
      label: 'Go to Materials',
      description: 'Manage materials',
      icon: Layers,
      action: () => router.push('/materials'),
      keywords: ['material', 'inventory', 'stock'],
    },
    {
      id: 'optimizer',
      label: 'Go to Slab Optimiser',
      description: 'Optimize slab layouts',
      icon: Square,
      action: () => router.push('/optimize'),
      keywords: ['optimize', 'slab', 'layout', 'cut'],
    },
    {
      id: 'pricing',
      label: 'Go to Pricing',
      description: 'Manage pricing settings',
      icon: Sliders,
      action: () => router.push('/admin/pricing'),
      keywords: ['pricing', 'rates', 'admin', 'price'],
    },
    {
      id: 'users',
      label: 'Go to Users',
      description: 'Manage user accounts',
      icon: Users,
      action: () => router.push('/admin/users'),
      keywords: ['users', 'admin', 'accounts', 'team'],
    },
    {
      id: 'settings',
      label: 'Go to Settings',
      description: 'Adjust your settings',
      icon: Settings,
      action: () => router.push('/settings'),
      keywords: ['preferences', 'config', 'configuration'],
    },
  ];

  // Filter commands based on query
  const filteredCommands = query
    ? commands.filter((cmd) => {
        const searchText = query.toLowerCase();
        return (
          cmd.label.toLowerCase().includes(searchText) ||
          cmd.description?.toLowerCase().includes(searchText) ||
          cmd.keywords?.some((kw) => kw.toLowerCase().includes(searchText))
        );
      })
    : commands;

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd+K or Ctrl+K to open/close
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
        setQuery('');
        setSelectedIndex(0);
        return;
      }

      // Escape to close
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        setIsOpen(false);
        setQuery('');
        setSelectedIndex(0);
        return;
      }

      // Arrow navigation
      if (isOpen) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((prev) =>
            prev < filteredCommands.length - 1 ? prev + 1 : prev
          );
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
        } else if (e.key === 'Enter') {
          e.preventDefault();
          const selected = filteredCommands[selectedIndex];
          if (selected) {
            selected.action();
            setIsOpen(false);
            setQuery('');
            setSelectedIndex(0);
          }
        }
      }
    },
    [isOpen, filteredCommands, selectedIndex]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-50 bg-zinc-900/50 backdrop-blur-sm"
        onClick={() => {
          setIsOpen(false);
          setQuery('');
          setSelectedIndex(0);
        }}
      />

      {/* Command Menu Modal */}
      <div className="fixed inset-x-4 top-20 z-50 mx-auto max-w-2xl">
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white shadow-linear-xl">
          {/* Search Input */}
          <div className="flex items-center border-b border-zinc-200 px-4">
            <Search className="h-5 w-5 text-zinc-500 shrink-0" />
            <input
              type="text"
              className="flex-1 bg-transparent px-3 py-4 text-sm text-zinc-900 placeholder:text-zinc-500 focus:outline-none"
              placeholder="Type a command or search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            <kbd className="hidden sm:inline-flex h-6 items-center gap-1 rounded border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-500">
              ESC
            </kbd>
          </div>

          {/* Command List */}
          <div className="max-h-[400px] overflow-y-auto p-2">
            {filteredCommands.length === 0 ? (
              <div className="px-3 py-8 text-center text-sm text-zinc-500">
                No commands found
              </div>
            ) : (
              <div className="space-y-1">
                {filteredCommands.map((cmd, index) => {
                  const Icon = cmd.icon;
                  const isSelected = index === selectedIndex;

                  return (
                    <button
                      key={cmd.id}
                      onClick={() => {
                        cmd.action();
                        setIsOpen(false);
                        setQuery('');
                        setSelectedIndex(0);
                      }}
                      onMouseEnter={() => setSelectedIndex(index)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-left transition-colors ${
                        isSelected
                          ? 'bg-zinc-100 text-zinc-900'
                          : 'text-zinc-700 hover:bg-zinc-50'
                      }`}
                    >
                      {Icon && (
                        <Icon
                          className={`h-5 w-5 shrink-0 ${
                            isSelected ? 'text-amber-600' : 'text-zinc-500'
                          }`}
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {cmd.label}
                        </div>
                        {cmd.description && (
                          <div className="text-xs text-zinc-500 truncate">
                            {cmd.description}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer with shortcut hint */}
          <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-2">
            <div className="flex items-center justify-between text-xs text-zinc-500">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center rounded border border-zinc-200 bg-white px-1.5 font-medium">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="inline-flex h-5 items-center rounded border border-zinc-200 bg-white px-1.5 font-medium">
                    ↵
                  </kbd>
                  <span>Select</span>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <kbd className="inline-flex h-5 items-center rounded border border-zinc-200 bg-white px-1.5 font-medium">
                  ⌘K
                </kbd>
                <span>to close</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
