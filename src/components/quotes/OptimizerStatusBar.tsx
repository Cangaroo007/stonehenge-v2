'use client'

interface OptimizerStatusBarProps {
  isOptimising: boolean
  optimiserError: string | null
  onRetry: () => void
}

export function OptimizerStatusBar({
  isOptimising,
  optimiserError,
  onRetry,
}: OptimizerStatusBarProps) {
  if (!isOptimising && !optimiserError) return null

  if (isOptimising) {
    return (
      <div className="w-full bg-blue-50 border-b border-blue-200 px-4 py-2
                      flex items-center gap-2 text-sm text-blue-700">
        <svg
          className="animate-spin h-4 w-4 text-blue-600 shrink-0"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
        >
          <circle
            className="opacity-25"
            cx="12" cy="12" r="10"
            stroke="currentColor" strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v8z"
          />
        </svg>
        Optimising...
      </div>
    )
  }

  return (
    <div className="w-full bg-red-50 border-b border-red-200 px-4 py-2
                    flex items-center justify-between text-sm text-red-700">
      <span>
        Optimiser error — recalculating
        {optimiserError && (
          <span className="text-red-500 ml-1 text-xs">({optimiserError})</span>
        )}
      </span>
      <button
        onClick={onRetry}
        className="ml-4 text-red-700 underline hover:text-red-900 text-xs"
      >
        Retry
      </button>
    </div>
  )
}
