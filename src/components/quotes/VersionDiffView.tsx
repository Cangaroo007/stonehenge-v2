'use client';

import type { ChangeSummary } from '@/lib/quote-version-diff';

interface VersionDiffViewProps {
  summary: ChangeSummary;
}

function formatCurrency(value: number): string {
  return `$${Math.abs(value).toFixed(2)}`;
}

function diffBadge(diff: number): string {
  if (diff > 0) return `+${formatCurrency(diff)}`;
  if (diff < 0) return `-${formatCurrency(diff)}`;
  return '$0.00';
}

function diffColor(diff: number): string {
  if (diff > 0) return 'text-red-600'; // costs went up
  if (diff < 0) return 'text-green-600'; // costs went down
  return 'text-gray-500';
}

export default function VersionDiffView({ summary }: VersionDiffViewProps) {
  const { fieldChanges, piecesAdded, piecesRemoved, piecesModified, costImpact } = summary;

  const hasChanges =
    fieldChanges.length > 0 ||
    piecesAdded.length > 0 ||
    piecesRemoved.length > 0 ||
    piecesModified.length > 0;

  if (!hasChanges) {
    return (
      <p className="text-sm text-gray-500 italic py-2">
        No significant changes detected
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {/* Cost Impact Banner */}
      {costImpact && costImpact.diff !== 0 && (
        <div className={`rounded-lg p-4 ${costImpact.diff > 0 ? 'bg-red-50 border border-red-200' : 'bg-green-50 border border-green-200'}`}>
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-800">Cost Impact</span>
            <span className={`text-lg font-bold ${diffColor(costImpact.diff)}`}>
              {diffBadge(costImpact.diff)}
            </span>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Previous Total</span>
              <div className="font-medium text-gray-800">{formatCurrency(costImpact.oldTotal)}</div>
            </div>
            <div>
              <span className="text-gray-500">New Total</span>
              <div className="font-medium text-gray-800">{formatCurrency(costImpact.newTotal)}</div>
            </div>
          </div>
        </div>
      )}

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {fieldChanges.length > 0 && (
          <span className="px-2 py-1 text-xs rounded-full bg-blue-100 text-blue-700">
            {fieldChanges.length} field change{fieldChanges.length !== 1 ? 's' : ''}
          </span>
        )}
        {piecesAdded.length > 0 && (
          <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">
            +{piecesAdded.length} piece{piecesAdded.length !== 1 ? 's' : ''} added
          </span>
        )}
        {piecesRemoved.length > 0 && (
          <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
            -{piecesRemoved.length} piece{piecesRemoved.length !== 1 ? 's' : ''} removed
          </span>
        )}
        {piecesModified.length > 0 && (
          <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-700">
            {piecesModified.length} piece{piecesModified.length !== 1 ? 's' : ''} modified
          </span>
        )}
      </div>

      {/* Field Changes */}
      {fieldChanges.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Quote Changes</h4>
          <div className="bg-gray-50 rounded-lg divide-y divide-gray-200">
            {fieldChanges.map((change, i) => (
              <div key={i} className="flex justify-between items-center px-3 py-2 text-sm">
                <span className="text-gray-600 font-medium">{change.label}</span>
                <span className="flex items-center gap-2">
                  <span className="text-red-600 line-through">
                    {formatValue(change.oldValue)}
                  </span>
                  <span className="text-gray-400">&rarr;</span>
                  <span className="text-green-600 font-medium">
                    {formatValue(change.newValue)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pieces Added */}
      {piecesAdded.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Pieces Added</h4>
          <div className="space-y-2">
            {piecesAdded.map((piece, i) => (
              <div
                key={i}
                className="bg-green-50 border border-green-200 rounded-lg px-4 py-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-green-800">{piece.name}</span>
                    <span className="text-green-600 text-sm ml-2">{piece.quote_rooms}</span>
                  </div>
                  {piece.cost > 0 && (
                    <span className="text-green-700 font-semibold text-sm">+{formatCurrency(piece.cost)}</span>
                  )}
                </div>
                <div className="mt-1 text-sm text-green-700 space-y-0.5">
                  <div>{piece.dimensions} &middot; {piece.thickness}mm thick{piece.materials ? ` &middot; ${piece.materials}` : ''}</div>
                  {piece.edges.length > 0 && (
                    <div className="text-green-600">Edges: {piece.edges.join(', ')}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pieces Removed */}
      {piecesRemoved.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Pieces Removed</h4>
          <div className="space-y-2">
            {piecesRemoved.map((piece, i) => (
              <div
                key={i}
                className="bg-red-50 border border-red-200 rounded-lg px-4 py-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-red-800 line-through">{piece.name}</span>
                    <span className="text-red-600 text-sm ml-2 line-through">{piece.quote_rooms}</span>
                  </div>
                  {piece.cost > 0 && (
                    <span className="text-red-700 font-semibold text-sm">-{formatCurrency(piece.cost)}</span>
                  )}
                </div>
                <div className="mt-1 text-sm text-red-700 line-through">
                  {piece.dimensions} &middot; {piece.thickness}mm thick{piece.materials ? ` &middot; ${piece.materials}` : ''}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pieces Modified */}
      {piecesModified.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold text-gray-700 mb-2">Pieces Modified</h4>
          <div className="space-y-2">
            {piecesModified.map((piece, i) => (
              <div
                key={i}
                className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="font-semibold text-amber-800">{piece.name}</span>
                    <span className="text-amber-600 text-sm ml-2">{piece.quote_rooms}</span>
                  </div>
                  {piece.costDiff !== 0 && (
                    <span className={`font-semibold text-sm ${piece.costDiff > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {diffBadge(piece.costDiff)}
                    </span>
                  )}
                </div>
                <ul className="mt-2 space-y-1 text-sm text-amber-800">
                  {piece.changes.map((change, j) => (
                    <li key={j} className="flex items-start gap-1.5">
                      <span className="text-amber-500 mt-0.5">&#8226;</span>
                      <span>{change}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '(none)';
  if (typeof value === 'number') {
    if (value % 1 !== 0 || value > 100) {
      return `$${value.toFixed(2)}`;
    }
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}
