'use client';

import type { RelationshipSuggestion } from '@/lib/types/piece-relationship';
import { RELATIONSHIP_DISPLAY } from '@/lib/types/piece-relationship';

interface RelationshipSuggestionsProps {
  suggestions: RelationshipSuggestion[];
  pieceNames: Map<string, string>;
  onAccept: (suggestion: RelationshipSuggestion) => void;
  onDismiss: (suggestion: RelationshipSuggestion) => void;
}

const CONFIDENCE_STYLES: Record<
  RelationshipSuggestion['confidence'],
  { bg: string; text: string }
> = {
  HIGH: { bg: 'bg-green-100', text: 'text-green-800' },
  MEDIUM: { bg: 'bg-amber-100', text: 'text-amber-800' },
  LOW: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

export default function RelationshipSuggestions({
  suggestions,
  pieceNames,
  onAccept,
  onDismiss,
}: RelationshipSuggestionsProps) {
  if (suggestions.length === 0) return null;

  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        Suggested Relationships
      </h4>
      <div className="space-y-2">
        {suggestions.map((s) => {
          const display = RELATIONSHIP_DISPLAY[s.suggestedType];
          const conf = CONFIDENCE_STYLES[s.confidence];
          const parentName = pieceNames.get(s.parentPieceId) ?? 'Unknown';
          const childName = pieceNames.get(s.childPieceId) ?? 'Unknown';

          return (
            <div
              key={`${s.parentPieceId}-${s.childPieceId}-${s.suggestedType}`}
              className="flex items-start gap-2 border rounded-lg bg-white px-3 py-2"
              style={{ borderLeftWidth: 3, borderLeftColor: display.colour }}
            >
              {/* Icon + Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="inline-flex items-center justify-center w-5 h-5 rounded text-[10px] font-bold text-white flex-shrink-0"
                    style={{ backgroundColor: display.colour }}
                  >
                    {display.icon}
                  </span>
                  <span className="text-sm font-medium text-gray-800">
                    {display.label}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${conf.bg} ${conf.text}`}>
                    {s.confidence}
                  </span>
                </div>
                <div className="mt-0.5 ml-7 text-xs text-gray-600 truncate">
                  {parentName} → {childName}
                  {s.suggestedPosition && (
                    <span className="ml-1.5 text-gray-400">
                      ({s.suggestedPosition})
                    </span>
                  )}
                </div>
                <p className="mt-0.5 ml-7 text-[11px] text-gray-400 italic">
                  {s.reason}
                </p>
              </div>

              {/* Accept / Dismiss */}
              <div className="flex items-center gap-1 flex-shrink-0 pt-0.5">
                <button
                  onClick={() => onAccept(s)}
                  className="px-2 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700 transition-colors"
                  title="Accept suggestion"
                >
                  Accept
                </button>
                <button
                  onClick={() => onDismiss(s)}
                  className="px-2 py-1 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded hover:bg-gray-50 transition-colors"
                  title="Dismiss suggestion"
                >
                  Dismiss
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
