'use client';

import { useState } from 'react';
import { ClarificationQuestion } from '@/lib/types/drawing-analysis';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';

interface ClarificationPanelProps {
  questions: ClarificationQuestion[];
  onAnswersSubmit: (answers: Record<string, string>) => void;
  onSkip?: () => void;
}

export function ClarificationPanel({ 
  questions, 
  onAnswersSubmit,
  onSkip 
}: ClarificationPanelProps) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  
  const criticalCount = questions.filter(q => q.priority === 'CRITICAL').length;
  const importantCount = questions.filter(q => q.priority === 'IMPORTANT').length;
  
  function handleAnswerChange(questionId: string, value: string) {
    setAnswers(prev => ({ ...prev, [questionId]: value }));
  }
  
  function handleSubmit() {
    onAnswersSubmit(answers);
  }
  
  function getPriorityStyles(priority: ClarificationQuestion['priority']) {
    switch (priority) {
      case 'CRITICAL':
        return {
          border: 'border-red-300 bg-red-50',
          icon: (
            <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
            </svg>
          ),
          badge: 'bg-red-100 text-red-800',
        };
      case 'IMPORTANT':
        return {
          border: 'border-amber-300 bg-amber-50',
          icon: (
            <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          ),
          badge: 'bg-amber-100 text-amber-800',
        };
      case 'NICE_TO_KNOW':
        return {
          border: 'border-blue-300 bg-blue-50',
          icon: (
            <svg className="w-5 h-5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          ),
          badge: 'bg-blue-100 text-blue-800',
        };
    }
  }
  
  if (questions.length === 0) {
    return (
      <Card className="border-green-300 bg-green-50">
        <CardContent className="py-6">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p className="text-green-800 font-medium">
              All information extracted successfully. No clarification needed.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Summary Header */}
      <Card>
        <CardHeader className="py-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <circle cx="12" cy="12" r="10" strokeWidth="2" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01" />
            </svg>
            Clarification Needed
          </CardTitle>
          <p className="text-sm text-zinc-600">
            We found some areas that need your input to ensure accurate quoting.
          </p>
        </CardHeader>
        <CardContent className="py-2">
          <div className="flex gap-4 text-sm">
            {criticalCount > 0 && (
              <span className="px-2 py-1 rounded bg-red-100 text-red-800">
                {criticalCount} critical
              </span>
            )}
            {importantCount > 0 && (
              <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">
                {importantCount} important
              </span>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Questions */}
      <div className="space-y-3">
        {questions.map((question) => {
          const styles = getPriorityStyles(question.priority);
          const isAnswered = !!answers[question.id];
          
          return (
            <Card 
              key={question.id} 
              className={`${styles.border} ${isAnswered ? 'opacity-75' : ''}`}
            >
              <CardContent className="py-4">
                <div className="flex items-start gap-3">
                  {styles.icon}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs px-2 py-0.5 rounded ${styles.badge}`}>
                        {question.priority.replace(/_/g, ' ')}
                      </span>
                      <span className="text-xs text-zinc-500">
                        {question.category}
                      </span>
                    </div>
                    
                    <Label className="text-sm font-medium">
                      {question.question}
                    </Label>
                    
                    {question.options ? (
                      <RadioGroup
                        value={answers[question.id] || question.defaultValue || ''}
                        onValueChange={(value) => handleAnswerChange(question.id, value)}
                      >
                        {question.options.map((option) => (
                          <div key={option} className="flex items-center space-x-2">
                            <RadioGroupItem value={option} id={`${question.id}-${option}`} />
                            <Label 
                              htmlFor={`${question.id}-${option}`}
                              className="text-sm font-normal cursor-pointer"
                            >
                              {option}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    ) : (
                      <Input
                        placeholder="Enter value..."
                        value={answers[question.id] || ''}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
      
      {/* Actions */}
      <div className="flex justify-between pt-4">
        {onSkip && (
          <Button variant="outline" onClick={onSkip}>
            Skip for now
          </Button>
        )}
        <Button 
          onClick={handleSubmit}
          disabled={criticalCount > 0 && Object.keys(answers).length < criticalCount}
        >
          Continue with {Object.keys(answers).length} answers
        </Button>
      </div>
    </div>
  );
}
