"use client";

// apps/web/src/components/canvas/ShortcutsOverlay.tsx
//
// Round 4 — keyboard shortcuts cheat sheet.
//
// Triggered by pressing `?`. Dismisses on any keystroke or click. A
// semi-transparent backdrop covers the full editor; the panel itself
// sits centred and uses the same dark-pill aesthetic as the canvas
// tooltips, so the visual feels native to the editor rather than an
// OS-style modal.

import { useEffect } from "react";

export interface ShortcutsOverlayProps {
  readonly open: boolean;
  readonly onClose: () => void;
}

interface ShortcutRow {
  readonly key: string;
  readonly label: string;
}

const ROWS: readonly ShortcutRow[] = [
  { key: "V", label: "Insert vertex mode" },
  { key: "R", label: "Edit corner radius (selected vertex)" },
  { key: "G", label: "Toggle grid" },
  { key: "F", label: "Full-screen canvas" },
  { key: "⌘Z", label: "Undo" },
  { key: "⌘⇧Z", label: "Redo" },
  { key: "Del", label: "Delete selected" },
  { key: "Esc", label: "Deselect / exit mode" },
  { key: "?", label: "This help" },
];

const MOUSE_ROWS: readonly ShortcutRow[] = [
  { key: "Double-click edge", label: "Insert vertex at click" },
  { key: "Click dimension", label: "Edit length in mm" },
  { key: "Scroll", label: "Zoom (cursor-anchored)" },
  { key: "Middle-drag", label: "Pan" },
];

export function ShortcutsOverlay(props: ShortcutsOverlayProps) {
  const { open, onClose } = props;

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      // Allow plain ? to dismiss as well — feels like a toggle.
      e.preventDefault();
      onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-stone-950/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard shortcuts"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col gap-4 rounded-xl border border-stone-700/60 bg-stone-900/95 p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-baseline justify-between">
          <h3 className="font-mono text-xs font-medium uppercase tracking-widest text-stone-300">
            Keyboard shortcuts
          </h3>
          <span className="font-mono text-[10px] uppercase tracking-wider text-stone-500">
            ? to dismiss
          </span>
        </div>

        <section className="flex flex-col gap-1.5">
          {ROWS.map((row) => (
            <ShortcutLine key={row.key} row={row} />
          ))}
        </section>

        <div className="h-px bg-stone-700/60" />

        <section className="flex flex-col gap-1.5">
          {MOUSE_ROWS.map((row) => (
            <ShortcutLine key={row.key} row={row} />
          ))}
        </section>
      </div>
    </div>
  );
}

function ShortcutLine({ row }: { readonly row: ShortcutRow }) {
  return (
    <div className="flex items-center justify-between gap-3 leading-none">
      <span className="font-sans text-[12px] text-stone-200">{row.label}</span>
      <kbd className="rounded border border-stone-700 bg-stone-800 px-2 py-0.5 font-mono text-[10px] text-stone-300">
        {row.key}
      </kbd>
    </div>
  );
}
