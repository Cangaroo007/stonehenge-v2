"use client";

// apps/web/src/components/canvas/ZoomControls.tsx
//
// Round 4 — floating zoom + viewport controls.
//
// Bottom-right pill with:
//   - "−" zoom-out
//   - current mm/px (IBM Plex Mono 11 px)
//   - "+" zoom-in
//   - Fit-to-piece button (resets viewport to fitViewport)
//   - Grid toggle (G shortcut equivalent) — optional, when wired
//   - Full-screen toggle (F shortcut equivalent) — optional, when wired
//
// Visual contract: stone-900 at 85 %, 8 px border-radius, IBM Plex Mono
// for numeric, 24 px round mini-buttons with stone-700 bg / stone-300
// text. Hover state lifts to stone-600 / white.

export const EDGE_HOVER_TOOLTIP_DELAY_MS = 400;

export interface ZoomControlsProps {
  readonly mmPerPx: number;
  readonly onZoomIn: () => void;
  readonly onZoomOut: () => void;
  readonly onFit: () => void;
  readonly onToggleFullScreen?: () => void;
  readonly fullScreen?: boolean;
  readonly onToggleGrid?: () => void;
  readonly gridVisible?: boolean;
  /**
   * Round 14 (Section B) — measurement mode toggle. Optional so
   * existing call sites compile without it. Keyboard equivalent: M.
   */
  readonly onToggleMeasurement?: () => void;
  readonly measurementVisible?: boolean;
  /**
   * Round 15 (Fix 5) — toggle for always-visible angle annotations.
   * Keyboard equivalent: A.
   */
  readonly onToggleAngles?: () => void;
  readonly anglesVisible?: boolean;
}

export function ZoomControls(props: ZoomControlsProps) {
  const {
    mmPerPx,
    onZoomIn,
    onZoomOut,
    onFit,
    onToggleFullScreen,
    fullScreen,
    onToggleGrid,
    gridVisible,
    onToggleMeasurement,
    measurementVisible,
    onToggleAngles,
    anglesVisible,
  } = props;

  return (
    <div className="pointer-events-auto absolute bottom-3 right-3 flex items-center gap-2">
      <div className="flex items-center gap-1.5 rounded-lg border border-stone-700/60 bg-stone-900/85 px-1.5 py-1 shadow-lg backdrop-blur-sm">
        <MiniButton ariaLabel="Zoom out" onClick={onZoomOut}>
          −
        </MiniButton>
        <div className="flex flex-col items-center px-2 leading-none">
          <span className="font-mono text-[11px] text-stone-200">
            {mmPerPx.toFixed(2)}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-wider text-stone-500">
            mm/px
          </span>
        </div>
        <MiniButton ariaLabel="Zoom in" onClick={onZoomIn}>
          +
        </MiniButton>
        <div className="mx-0.5 h-5 w-px bg-stone-700/60" />
        <button
          type="button"
          onClick={onFit}
          aria-label="Fit to piece"
          title="Fit (F)"
          className="rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider text-stone-300 transition-colors hover:bg-stone-700 hover:text-white"
        >
          Fit
        </button>
        {onToggleGrid && (
          <button
            type="button"
            onClick={onToggleGrid}
            aria-label={gridVisible ? "Hide grid" : "Show grid"}
            title="Grid (G)"
            className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors hover:bg-stone-700 hover:text-white ${
              gridVisible ? "text-stone-300" : "text-stone-500"
            }`}
          >
            Grid
          </button>
        )}
        {onToggleMeasurement && (
          <button
            type="button"
            onClick={onToggleMeasurement}
            aria-label={
              measurementVisible
                ? "Hide measurement overlay"
                : "Show measurement overlay"
            }
            title="Measurement mode (M)"
            className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors hover:bg-stone-700 hover:text-white ${
              measurementVisible ? "text-cinnabar-400" : "text-stone-500"
            }`}
          >
            Meas
          </button>
        )}
        {onToggleAngles && (
          <button
            type="button"
            onClick={onToggleAngles}
            aria-label={anglesVisible ? "Hide angles" : "Show angles"}
            title="Toggle angle annotations (A)"
            className={`rounded px-2 py-1 font-mono text-[10px] uppercase tracking-wider transition-colors hover:bg-stone-700 hover:text-white ${
              anglesVisible ? "text-cinnabar-400" : "text-stone-500"
            }`}
          >
            Angles
          </button>
        )}
      </div>

      {onToggleFullScreen && (
        <button
          type="button"
          onClick={onToggleFullScreen}
          aria-label={fullScreen ? "Exit full screen" : "Full screen"}
          title="Full screen (F)"
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-700/60 bg-stone-900/85 text-stone-300 shadow-lg backdrop-blur-sm transition-colors hover:bg-stone-800 hover:text-white"
        >
          {fullScreen ? (
            <ContractIcon />
          ) : (
            <ExpandIcon />
          )}
        </button>
      )}
    </div>
  );
}

interface MiniButtonProps {
  readonly ariaLabel: string;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}

function MiniButton(props: MiniButtonProps) {
  const { ariaLabel, onClick, children } = props;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className="flex h-6 w-6 items-center justify-center rounded-full bg-stone-700/80 text-[14px] leading-none text-stone-200 transition-colors hover:bg-stone-600 hover:text-white"
    >
      {children}
    </button>
  );
}

function ExpandIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 6V3h3" />
      <path d="M13 6V3h-3" />
      <path d="M3 10v3h3" />
      <path d="M13 10v3h-3" />
    </svg>
  );
}

function ContractIcon() {
  return (
    <svg
      viewBox="0 0 16 16"
      width={14}
      height={14}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M6 3v3H3" />
      <path d="M10 3v3h3" />
      <path d="M6 13v-3H3" />
      <path d="M10 13v-3h3" />
    </svg>
  );
}
