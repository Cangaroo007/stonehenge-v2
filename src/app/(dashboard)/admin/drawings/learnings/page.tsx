'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';

interface Stats {
  totalCorrections: number;
  byType: Record<string, number>;
  byConfidence: Record<string, number>;
  correctionsByField: { fieldName: string; count: number }[];
  mostCorrectedFields: {
    fieldName: string;
    count: number;
    topCorrection: string;
  }[];
  recentCorrectionsList: {
    id: number;
    correctionType: string;
    fieldName: string;
    originalValue: string | null;
    correctedValue: string;
    aiConfidence: string | null;
    createdAt: string;
  }[];
  activeRules: number;
}

interface Pattern {
  id: string;
  correctionType: string;
  fieldName: string;
  originalValue: string | null;
  correctedValue: string;
  correctionCount: number;
  avgAiConfidence: string;
  suggestion: string;
  hasRule: boolean;
}

interface LearningRule {
  id: number;
  field_name: string;
  drawing_type: string | null;
  correct_value: string;
  description: string;
  correction_count: number;
  confidence: number;
  is_active: boolean;
  approved_by: string | null;
  created_at: string;
}

export default function LearningsPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [patterns, setPatterns] = useState<Pattern[]>([]);
  const [rules, setRules] = useState<LearningRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [dismissedPatterns, setDismissedPatterns] = useState<Set<string>>(
    new Set()
  );

  const fetchAll = useCallback(async () => {
    try {
      const [statsRes, patternsRes, rulesRes] = await Promise.all([
        fetch('/api/drawing-corrections/stats'),
        fetch('/api/drawing-corrections/patterns'),
        fetch('/api/drawing-learning-rules'),
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      if (patternsRes.ok) {
        const data = await patternsRes.json();
        setPatterns(data.patterns ?? []);
      }
      if (rulesRes.ok) {
        const data = await rulesRes.json();
        setRules(data.rules ?? []);
      }
    } catch (error) {
      console.error('Failed to load learnings data:', error);
      toast.error('Failed to load learnings data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleApprovePattern = async (pattern: Pattern) => {
    try {
      const res = await fetch('/api/drawing-corrections/patterns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_name: pattern.fieldName,
          correction_type: pattern.correctionType,
          correct_value: pattern.correctedValue,
          description: `${pattern.fieldName} should default to "${pattern.correctedValue}" (based on ${pattern.correctionCount} corrections)`,
          correction_count: pattern.correctionCount,
        }),
      });

      if (!res.ok) throw new Error('Failed to create rule');

      toast.success('Learning rule created');
      fetchAll();
    } catch (error) {
      console.error(error);
      toast.error('Failed to approve pattern');
    }
  };

  const handleDismiss = (patternId: string) => {
    setDismissedPatterns((prev) => new Set(prev).add(patternId));
  };

  const handleToggleRule = async (ruleId: number, isActive: boolean) => {
    try {
      const res = await fetch('/api/drawing-learning-rules', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: ruleId, is_active: !isActive }),
      });

      if (!res.ok) throw new Error('Failed to update rule');

      toast.success(`Rule ${isActive ? 'deactivated' : 'activated'}`);
      fetchAll();
    } catch (error) {
      console.error(error);
      toast.error('Failed to update rule');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  const mostCorrectedField = stats?.mostCorrectedFields?.[0];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">AI Learnings</h1>
        <p className="text-gray-500 mt-1">
          Track AI extraction accuracy and manage learning rules
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="card p-4">
          <div className="text-sm text-gray-500">Total Corrections</div>
          <div className="text-2xl font-bold text-gray-900">
            {stats?.totalCorrections ?? 0}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Most Corrected Field</div>
          <div className="text-lg font-bold text-orange-600 truncate">
            {mostCorrectedField
              ? `${mostCorrectedField.fieldName} (${mostCorrectedField.count})`
              : '—'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">AI Confidence Split</div>
          <div className="text-sm font-medium text-gray-700 mt-1">
            {stats?.byConfidence
              ? `H:${stats.byConfidence.HIGH ?? 0} M:${stats.byConfidence.MEDIUM ?? 0} L:${stats.byConfidence.LOW ?? 0}`
              : '—'}
          </div>
        </div>
        <div className="card p-4">
          <div className="text-sm text-gray-500">Active Learning Rules</div>
          <div className="text-2xl font-bold text-green-600">
            {stats?.activeRules ?? 0}
          </div>
        </div>
      </div>

      {/* Corrections by Type */}
      {stats?.byType && Object.keys(stats.byType).length > 0 && (
        <div className="card p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">
            Corrections by Type
          </h2>
          <div className="space-y-3">
            {Object.entries(stats.byType)
              .sort(([, a], [, b]) => b - a)
              .map(([type, count]) => {
                const pct =
                  stats.totalCorrections > 0
                    ? Math.round((count / stats.totalCorrections) * 100)
                    : 0;
                return (
                  <div key={type} className="flex items-center gap-3">
                    <div className="w-40 text-sm font-medium text-gray-700 truncate">
                      {type}
                    </div>
                    <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                      <div
                        className="bg-blue-500 h-5 rounded-full transition-all"
                        style={{ width: `${Math.max(pct, 2)}%` }}
                      />
                    </div>
                    <div className="w-20 text-sm text-gray-500 text-right">
                      {count} ({pct}%)
                    </div>
                  </div>
                );
              })}
          </div>
        </div>
      )}

      {/* Most Corrected Fields */}
      {stats?.mostCorrectedFields && stats.mostCorrectedFields.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="px-6 py-4 border-b">
            <h2 className="text-lg font-semibold text-gray-900">
              Most Corrected Fields
            </h2>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Field</th>
                <th className="table-header">Correction Count</th>
                <th className="table-header">Most Common Fix</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {stats.mostCorrectedFields.map((field) => (
                <tr key={field.fieldName} className="hover:bg-gray-50">
                  <td className="table-cell font-medium text-gray-900">
                    {field.fieldName}
                  </td>
                  <td className="table-cell">{field.count}</td>
                  <td className="table-cell text-gray-600">
                    {field.topCorrection || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pattern Suggestions */}
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Pattern Suggestions
        </h2>
        {patterns.filter((p) => !dismissedPatterns.has(p.id)).length === 0 ? (
          <div className="card p-6 text-center text-gray-500">
            No patterns detected yet. Patterns appear when the same correction
            is made 3+ times with 70%+ agreement.
          </div>
        ) : (
          <div className="space-y-4">
            {patterns
              .filter((p) => !dismissedPatterns.has(p.id))
              .map((pattern) => (
                <div key={pattern.id} className="card p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          {pattern.correctionType}
                        </span>
                        <span className="text-sm font-medium text-gray-700">
                          {pattern.fieldName}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 mb-2">
                        Users correct to:{' '}
                        <span className="font-semibold text-gray-900">
                          {pattern.correctedValue}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        Corrected {pattern.correctionCount} times · AI was{' '}
                        {pattern.avgAiConfidence} confidence
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {pattern.hasRule ? (
                        <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Rule active
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => handleApprovePattern(pattern)}
                            className="btn-primary text-sm"
                          >
                            Approve &amp; Add Rule
                          </button>
                          <button
                            onClick={() => handleDismiss(pattern.id)}
                            className="btn-secondary text-sm"
                          >
                            Dismiss
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>

      {/* Recent Corrections */}
      {stats?.recentCorrectionsList &&
        stats.recentCorrectionsList.length > 0 && (
          <div className="card overflow-hidden mb-6">
            <div className="px-6 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-900">
                Recent Corrections
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="table-header">Field</th>
                    <th className="table-header">AI Said</th>
                    <th className="table-header">User Changed To</th>
                    <th className="table-header">Confidence</th>
                    <th className="table-header">Time</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {stats.recentCorrectionsList.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50">
                      <td className="table-cell font-medium text-gray-900">
                        {c.fieldName}
                      </td>
                      <td className="table-cell text-gray-500">
                        {c.originalValue ?? '—'}
                      </td>
                      <td className="table-cell text-gray-900">
                        {c.correctedValue}
                      </td>
                      <td className="table-cell">
                        {c.aiConfidence ? (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.aiConfidence === 'HIGH'
                                ? 'bg-green-100 text-green-800'
                                : c.aiConfidence === 'MEDIUM'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {c.aiConfidence}
                          </span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="table-cell text-sm text-gray-500">
                        {new Date(c.createdAt).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

      {/* Active Rules */}
      <div className="card overflow-hidden">
        <div className="px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-900">
            Learning Rules
          </h2>
        </div>
        {rules.length === 0 ? (
          <div className="p-6 text-center text-gray-500">
            No learning rules yet. Approve patterns above to create rules.
          </div>
        ) : (
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="table-header">Field</th>
                <th className="table-header">Drawing Type</th>
                <th className="table-header">Correct Value</th>
                <th className="table-header">Corrections Behind It</th>
                <th className="table-header">Status</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="table-cell font-medium text-gray-900">
                    {rule.field_name}
                  </td>
                  <td className="table-cell text-gray-600">
                    {rule.drawing_type ?? 'All'}
                  </td>
                  <td className="table-cell text-gray-900">
                    {rule.correct_value}
                  </td>
                  <td className="table-cell">{rule.correction_count}</td>
                  <td className="table-cell">
                    <span
                      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        rule.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {rule.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="table-cell text-right">
                    <button
                      onClick={() => handleToggleRule(rule.id, rule.is_active)}
                      className={`text-sm font-medium ${
                        rule.is_active
                          ? 'text-red-600 hover:text-red-700'
                          : 'text-green-600 hover:text-green-700'
                      }`}
                    >
                      {rule.is_active ? 'Deactivate' : 'Activate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
