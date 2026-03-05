'use client';

import { useState, useCallback } from 'react';
import { ClarificationQuestion } from '@/lib/types/drawing-analysis';
import { logCorrection, CorrectionPayload } from '@/lib/services/correction-logger';

interface ClarificationPanelProps {
  questions: ClarificationQuestion[];
  onAnswersSubmit: (answers: Record<string, string>) => void;
  onSkip?: () => void;
  drawingId?: string;
  analysisId?: number;
  quoteId?: number;
}

const categoryToType: Record<string, CorrectionPayload['correctionType']> = {
  DIMENSION: 'DIMENSION',
  MATERIAL: 'MATERIAL',
  EDGE: 'EDGE_PROFILE',
  CUTOUT: 'CUTOUT_TYPE',
  ROOM: 'ROOM_ASSIGNMENT',
  QUANTITY: 'CUTOUT_QUANTITY',
};

function mapConfidence(conf: number | undefined): 'HIGH' | 'MEDIUM' | 'LOW' | undefined {
  if (conf === undefined) return undefined;
  if (conf >= 0.85) return 'HIGH';
  if (conf >= 0.50) return 'MEDIUM';
  return 'LOW';
}

export function ClarificationPanel({
  questions,
  onAnswersSubmit,
  onSkip,
  drawingId,
  analysisId,
  quoteId,
}: ClarificationPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const criticalQuestions = questions.filter(q => q.priority === 'CRITICAL');
  const answeredCount = Object.keys(answers).length;
  const criticalAnswered = criticalQuestions.filter(q => answers[q.id] !== undefined).length;
  const allCriticalAnswered = criticalAnswered === criticalQuestions.length;

  const fireCorrection = useCallback((question: ClarificationQuestion, value: string) => {
    try {
      logCorrection({
        drawingId,
        analysisId,
        quoteId,
        pieceId: question.pieceId ? parseInt(question.pieceId, 10) || undefined : undefined,
        correctionType: categoryToType[question.category] || 'DIMENSION',
        fieldName: question.fieldPath || question.category.toLowerCase(),
        originalValue: question.aiSuggestion,
        correctedValue: value,
        aiConfidence: mapConfidence(question.aiSuggestionConfidence),
      });
    } catch {
      // Never block UI for correction logging
    }
  }, [drawingId, analysisId, quoteId]);

  function handleAnswer(question: ClarificationQuestion, value: string) {
    setAnswers(prev => ({ ...prev, [question.id]: value }));
    fireCorrection(question, value);
  }

  function handleSubmit() {
    onAnswersSubmit(answers);
  }

  if (questions.length === 0) {
    return (
      <div className="rounded-md border border-green-300 bg-green-50 p-6">
        <div className="flex items-center gap-3">
          <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-green-800 font-medium">
            All information extracted successfully. No clarification needed.
          </p>
        </div>
      </div>
    );
  }

  const progressPercent = questions.length > 0 ? Math.round((answeredCount / questions.length) * 100) : 0;

  return (
    <div className="space-y-4">
      {/* Progress bar */}
      <div className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-zinc-700">
            {answeredCount} of {questions.length} questions answered
          </span>
          <div className="flex gap-2 text-xs">
            {criticalQuestions.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-red-100 text-red-800">
                {criticalQuestions.length} critical
              </span>
            )}
            {questions.filter(q => q.priority === 'IMPORTANT').length > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                {questions.filter(q => q.priority === 'IMPORTANT').length} important
              </span>
            )}
          </div>
        </div>
        <div className="h-2 bg-zinc-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-green-500 rounded-full transition-all duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      </div>

      {/* Question cards */}
      <div className="space-y-3">
        {questions.map((question) => (
          <QuestionCard
            key={question.id}
            question={question}
            answer={answers[question.id]}
            onAnswer={(value) => handleAnswer(question, value)}
          />
        ))}
      </div>

      {/* Continue button — sticky on mobile */}
      <div className="sticky bottom-0 bg-white border-t border-zinc-200 p-4 -mx-4 sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0 sm:static flex items-center justify-between">
        {onSkip && (
          <button
            onClick={onSkip}
            className="text-sm text-zinc-500 hover:text-zinc-700"
          >
            Skip all
          </button>
        )}
        <button
          onClick={handleSubmit}
          disabled={!allCriticalAnswered}
          className="ml-auto px-6 py-2.5 rounded-lg text-sm font-medium text-white bg-zinc-800 hover:bg-zinc-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          {allCriticalAnswered
            ? 'Continue \u2192'
            : `Continue (${answeredCount} of ${questions.length} answered)`
          }
        </button>
      </div>
    </div>
  );
}

// ── Individual question card ──

interface QuestionCardProps {
  question: ClarificationQuestion;
  answer?: string;
  onAnswer: (value: string) => void;
}

const borderByPriority: Record<string, string> = {
  CRITICAL: 'border-l-4 border-l-red-500',
  IMPORTANT: 'border-l-4 border-l-amber-400',
  NICE_TO_KNOW: 'border-l-4 border-l-blue-300',
};

function QuestionCard({ question, answer, onAnswer }: QuestionCardProps) {
  const isAnswered = answer !== undefined;
  const borderClass = borderByPriority[question.priority] || '';

  return (
    <div className={`rounded-md border border-zinc-200 bg-white ${borderClass} ${isAnswered ? 'opacity-75' : ''}`}>
      <div className="p-4 space-y-3">
        {/* Question text */}
        <p className="font-semibold text-zinc-900 text-sm">{question.question}</p>

        {/* Piece context */}
        {question.pieceId && (
          <p className="text-xs text-zinc-400">
            {question.fieldPath ? `${question.pieceId} \u00b7 ${question.fieldPath}` : question.pieceId}
          </p>
        )}

        {/* Answer input */}
        {question.allowFreeText ? (
          <DimensionInput
            question={question}
            value={answer || ''}
            onChange={onAnswer}
          />
        ) : question.options && question.options.length > 0 ? (
          <ChipSelector
            options={question.options}
            aiSuggestion={question.aiSuggestion}
            selected={answer}
            onSelect={onAnswer}
          />
        ) : (
          <FallbackTextInput
            value={answer || ''}
            onChange={onAnswer}
            placeholder={question.aiSuggestion ? `e.g. ${question.aiSuggestion}` : 'Enter value...'}
          />
        )}

        {/* Skip link — only for non-CRITICAL */}
        {question.priority !== 'CRITICAL' && !isAnswered && (
          <button
            onClick={() => onAnswer('__skipped__')}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            Skip
          </button>
        )}
      </div>
    </div>
  );
}

// ── Dimension number input ──

function DimensionInput({
  question,
  value,
  onChange,
}: {
  question: ClarificationQuestion;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min="0"
        max="9999"
        value={value}
        onChange={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        onBlur={(e) => {
          if (e.target.value) onChange(e.target.value);
        }}
        placeholder={question.aiSuggestion ? `e.g. ${question.aiSuggestion}` : ''}
        className="w-32 px-3 py-2 text-lg border border-zinc-300 rounded-lg focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 outline-none"
      />
      {question.unit && (
        <span className="text-sm text-zinc-500 font-medium">{question.unit}</span>
      )}
    </div>
  );
}

// ── Chip selector for options ──

function ChipSelector({
  options,
  aiSuggestion,
  selected,
  onSelect,
}: {
  options: string[];
  aiSuggestion?: string;
  selected: string | undefined;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const isSelected = selected === option;
        const isAiPick = aiSuggestion !== undefined && option === aiSuggestion;

        return (
          <button
            key={option}
            onClick={() => onSelect(option)}
            className={`relative px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
              isSelected
                ? 'bg-zinc-800 text-white border-zinc-800'
                : 'bg-white text-zinc-700 border-zinc-300 hover:border-zinc-400'
            }`}
          >
            {option}
            {isAiPick && (
              <span className="absolute -top-2 -right-2 flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-semibold leading-none">
                <svg className="w-2.5 h-2.5" viewBox="0 0 16 16" fill="currentColor">
                  <path d="M8 0l2.1 5.3L16 6.2l-4.2 3.5L13.2 16 8 12.5 2.8 16l1.4-6.3L0 6.2l5.9-.9z" />
                </svg>
                AI
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── Fallback text input ──

function FallbackTextInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-3 py-2 border border-zinc-300 rounded-lg text-sm focus:ring-2 focus:ring-zinc-400 focus:border-zinc-400 outline-none"
    />
  );
}
