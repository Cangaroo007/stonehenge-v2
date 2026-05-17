type ClarityValue = string | number | boolean | null | undefined;

declare global {
  interface Window {
    clarity?: (...args: unknown[]) => void;
  }
}

function safeValue(value: ClarityValue): string {
  if (value == null) return '';
  return String(value).slice(0, 255);
}

export function trackClarityEvent(name: string, tags?: Record<string, ClarityValue>) {
  if (typeof window === 'undefined' || typeof window.clarity !== 'function') return;

  try {
    window.clarity('event', name);
    if (!tags) return;

    for (const [key, value] of Object.entries(tags)) {
      if (value == null) continue;
      window.clarity('set', key, safeValue(value));
    }
  } catch {
    // Analytics must never affect quote entry.
  }
}

