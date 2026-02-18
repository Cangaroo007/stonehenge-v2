'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import StreamlinedAnalysisView from './StreamlinedAnalysisView';
import ContactPicker from './ContactPicker';

interface Customer {
  id: number;
  name: string;
}

interface DrawingUploadStepProps {
  onBack: () => void;
  onQuoteCreated: (quoteId: number) => void;
  customerId?: number;
}

type AnalysisState = 'idle' | 'uploading' | 'analyzing' | 'creating' | 'results' | 'error';

export default function DrawingUploadStep({
  onBack,
  onQuoteCreated,
  customerId: preSelectedCustomerId,
}: DrawingUploadStepProps) {
  // ── ALL hooks at the TOP (Rule 45) ──
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [analysisState, setAnalysisState] = useState<AnalysisState>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | undefined>(preSelectedCustomerId);
  const [selectedContactId, setSelectedContactId] = useState<number | null>(null);
  const [projectName, setProjectName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // State for streamlined results view
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [draftQuoteId, setDraftQuoteId] = useState<number | null>(null);

  // Fetch customers for dropdown
  useEffect(() => {
    async function fetchCustomers() {
      try {
        const res = await fetch('/api/customers');
        if (res.ok) {
          setCustomers(await res.json());
        }
      } catch {
        // Non-critical
      }
    }
    fetchCustomers();
  }, []);

  const isValidFileType = (f: File): boolean => {
    return ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'].includes(f.type);
  };

  const handleFile = useCallback((selectedFile: File) => {
    if (!isValidFileType(selectedFile)) {
      setError('Please upload a PDF, PNG, or JPG file.');
      return;
    }
    setFile(selectedFile);
    setError(null);
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) {
      handleFile(e.dataTransfer.files[0]);
    }
  }, [handleFile]);

  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      handleFile(e.target.files[0]);
    }
  }, [handleFile]);

  const handleAnalyse = async () => {
    if (!file) return;

    if (!selectedCustomerId) {
      setError('Please select a customer before analysing the drawing.');
      return;
    }

    setAnalysisState('uploading');
    setError(null);
    setProgress(10);
    setProgressLabel('Creating draft quote...');

    try {
      // Step 1: Create a draft quote to attach the drawing to
      const params = new URLSearchParams();
      if (selectedCustomerId) params.set('customerId', String(selectedCustomerId));
      if (selectedContactId) params.set('contactId', String(selectedContactId));
      if (projectName) params.set('projectName', projectName);
      const draftRes = await fetch(`/api/quotes/create-draft?${params}`, { method: 'POST' });
      if (!draftRes.ok) throw new Error('Failed to create draft quote');
      const { quoteId } = await draftRes.json();

      setProgress(20);
      setProgressLabel('Uploading drawing...');

      // Step 2: Upload drawing to R2 storage
      const uploadFormData = new FormData();
      uploadFormData.append('file', file);
      uploadFormData.append('customerId', String(selectedCustomerId));
      uploadFormData.append('quoteId', String(quoteId));

      const uploadRes = await fetch('/api/upload/drawing', {
        method: 'POST',
        body: uploadFormData,
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json();
        throw new Error(errData.error || 'Failed to upload drawing');
      }

      const uploadResult = await uploadRes.json();

      setProgress(35);
      setProgressLabel('Analysing drawing with AI...');
      setAnalysisState('analyzing');

      // Step 3: Analyse drawing
      const analyseFormData = new FormData();
      analyseFormData.append('file', file);

      // Simulate progress during analysis
      const progressInterval = setInterval(() => {
        setProgress(prev => Math.min(prev + 5, 75));
      }, 1000);

      const analyseRes = await fetch('/api/analyze-drawing', {
        method: 'POST',
        body: analyseFormData,
      });

      clearInterval(progressInterval);

      if (!analyseRes.ok) {
        const errData = await analyseRes.json();
        throw new Error(errData.details || errData.error || 'Drawing analysis failed');
      }

      const analyseData = await analyseRes.json();
      const analysis = analyseData.analysis;

      setProgress(80);
      setProgressLabel('Saving drawing record...');

      // Step 4: Save drawing record
      await fetch(`/api/quotes/${quoteId}/drawings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...uploadResult,
          analysisData: analysis,
        }),
      });

      setProgress(100);
      setProgressLabel('Analysis complete!');

      // Show streamlined results view instead of immediately redirecting
      setAnalysisData(analysis);
      setDraftQuoteId(quoteId);
      setAnalysisState('results');
    } catch (err) {
      setAnalysisState('error');
      setError(err instanceof Error ? err.message : 'Drawing analysis failed');
    }
  };

  // Idle / file selection state
  if (analysisState === 'idle') {
    return (
      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Upload a Drawing</h1>
        </div>

        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Drag & drop zone */}
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors mb-6 ${
            dragActive
              ? 'border-amber-500 bg-amber-50'
              : file
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 hover:border-amber-400 hover:bg-gray-50'
          }`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.png,.jpg,.jpeg"
            onChange={handleFileChange}
            className="hidden"
          />

          {file ? (
            <>
              <svg className="mx-auto h-12 w-12 text-green-500 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-gray-900 font-medium mb-1">{file.name}</p>
              <p className="text-sm text-gray-500">
                {(file.size / (1024 * 1024)).toFixed(1)}MB &mdash; Click to change
              </p>
            </>
          ) : (
            <>
              <svg className="mx-auto h-12 w-12 text-gray-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-gray-600 mb-2">
                Drag &amp; drop a drawing here or <span className="text-amber-600 font-medium">click to browse</span>
              </p>
              <p className="text-sm text-gray-500">Supported: PDF, PNG, JPG drawings up to 10MB</p>
            </>
          )}
        </div>

        {/* Customer & project */}
        <div className="card p-4 mb-6">
          <h3 className="text-sm font-medium text-gray-700 mb-3">Customer &amp; Project Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                Customer <span className="text-red-500">*</span>
              </label>
              <select
                value={selectedCustomerId || ''}
                onChange={(e) => {
                  const newId = e.target.value ? Number(e.target.value) : undefined;
                  setSelectedCustomerId(newId);
                  setSelectedContactId(null);
                }}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
              >
                <option value="">Select customer...</option>
                {customers.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Project name</label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="e.g. 42 Smith St Kitchen"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-amber-500 focus:border-amber-500"
              />
            </div>
          </div>
          {selectedCustomerId && (
            <div className="mt-4">
              <ContactPicker
                customerId={selectedCustomerId}
                selectedContactId={selectedContactId}
                onContactChange={setSelectedContactId}
              />
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <button onClick={onBack} className="btn-secondary">Cancel</button>
          <button
            onClick={handleAnalyse}
            disabled={!file}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Analyse Drawing &rarr;
          </button>
        </div>
      </div>
    );
  }

  // Analysing / creating state
  if (analysisState === 'uploading' || analysisState === 'analyzing' || analysisState === 'creating') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <h1 className="text-2xl font-bold text-gray-900">
            {analysisState === 'analyzing' ? 'Analysing Drawing...' : analysisState === 'creating' ? 'Creating Quote...' : 'Uploading...'}
          </h1>
        </div>

        <div className="card p-8">
          {/* Progress bar */}
          <div className="mb-6">
            <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-amber-500 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-right text-sm text-gray-500 mt-1">{progress}%</p>
          </div>

          <div className="flex items-center gap-4">
            <div className="h-10 w-10 rounded-full border-2 border-amber-500 border-t-transparent animate-spin" />
            <div>
              <p className="text-gray-900 font-medium">{progressLabel}</p>
              {analysisState === 'analyzing' && (
                <p className="text-sm text-gray-500 mt-1">Claude is reading your drawing. This usually takes 15-30 seconds.</p>
              )}
            </div>
          </div>

          {file && (
            <p className="mt-6 text-sm text-gray-500">
              File: {file.name}
            </p>
          )}
        </div>
      </div>
    );
  }

  // Error state
  if (analysisState === 'error') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button onClick={onBack} className="text-gray-500 hover:text-gray-700">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Analysis Failed</h1>
        </div>

        <div className="card p-8 text-center">
          <svg className="mx-auto h-12 w-12 text-red-400 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
          </svg>

          {error && (
            <p className="text-red-700 mb-6">{error}</p>
          )}

          <div className="flex justify-center gap-3">
            <button
              onClick={() => {
                setAnalysisState('idle');
                setFile(null);
                setError(null);
                setProgress(0);
              }}
              className="btn-secondary"
            >
              Try Again
            </button>
            <button
              onClick={onBack}
              className="btn-primary"
            >
              Start Manually Instead
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Streamlined results view after analysis
  if (analysisState === 'results' && analysisData && draftQuoteId) {
    const importAndRedirect = async (mode?: string) => {
      // Import pieces from analysis into the draft quote
      const analysis = analysisData as { rooms?: Array<{ name: string; pieces: Array<{ name: string; length: number; width: number; thickness: number; notes?: string | null }>}>; metadata?: { defaultThickness?: number } };
      const pieces: { name: string; length: number; width: number; thickness: number; room: string; notes: string | null }[] = [];
      for (const room of analysis.rooms || []) {
        for (const piece of room.pieces || []) {
          pieces.push({
            name: piece.name || 'Piece',
            length: piece.length || 0,
            width: piece.width || 0,
            thickness: piece.thickness || analysis.metadata?.defaultThickness || 20,
            room: room.name || 'Kitchen',
            notes: piece.notes || null,
          });
        }
      }

      if (pieces.length > 0) {
        await fetch(`/api/quotes/${draftQuoteId}/import-pieces`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pieces }),
        });
      }

      onQuoteCreated(draftQuoteId);
    };

    return (
      <StreamlinedAnalysisView
        analysisResult={analysisData}
        drawingName={file?.name || 'Drawing'}
        projectName={projectName || 'Untitled'}
        onCreateQuote={importAndRedirect}
        onEditQuickView={importAndRedirect}
        onEditDetailedBuilder={importAndRedirect}
      />
    );
  }

  return null;
}
