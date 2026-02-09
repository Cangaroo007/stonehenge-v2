'use client';

import { useState, useCallback, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import EdgeSelector from './EdgeSelector';

interface EdgeType {
  id: string;
  name: string;
  description: string | null;
  category: string;
  baseRate: number;
  isActive: boolean;
  sortOrder: number;
}

interface EdgeSelections {
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
}

interface DrawingImportProps {
  quoteId: string;
  customerId: number;
  edgeTypes: EdgeType[];
  onImportComplete: (count: number) => void;
  onDrawingsSaved?: () => void;
  onClose: () => void;
}

type UploadProgress = 'idle' | 'uploading' | 'analyzing' | 'saving' | 'complete' | 'error';

interface UploadResult {
  storageKey: string;
  filename: string;
  mimeType: string;
  fileSize: number;
}

interface ExtractedPiece {
  id: string;
  pieceNumber: number;
  name: string;
  length: number;
  width: number;
  thickness: number;
  room: string;
  confidence: number;
  notes: string | null;
  cutouts: { type: string }[];
  isEditing: boolean;
  edgeSelections: EdgeSelections;
}

interface AnalysisResult {
  success: boolean;
  drawingType: string;
  metadata: {
    jobNumber: string | null;
    defaultThickness: number;
    defaultOverhang: number;
  };
  rooms: {
    name: string;
    pieces: {
      pieceNumber: number;
      name: string;
      pieceType: string;
      shape: string;
      length: number;
      width: number;
      thickness: number;
      cutouts: { type: string }[];
      notes: string | null;
      confidence: number;
    }[];
  }[];
  warnings: string[];
  questionsForUser: string[];
}

type Step = 'upload' | 'analyzing' | 'review';

const STANDARD_ROOMS = [
  'Kitchen',
  'Kitchen Island',
  'Bathroom',
  'Ensuite',
  'Laundry',
  'Outdoor Kitchen',
  'Bar',
  'Pantry',
  'TV Unit',
  'Other',
];

const NULL_EDGE_SELECTIONS: EdgeSelections = {
  edgeTop: null,
  edgeBottom: null,
  edgeLeft: null,
  edgeRight: null,
};

/**
 * Returns default edge selections using the first "polish" category edge type
 * (typically Pencil Round). Falls back to null if no edge types available.
 */
function getDefaultEdgeSelections(edgeTypes: EdgeType[]): EdgeSelections {
  const defaultEdge = edgeTypes.find(et => et.category === 'polish' && et.isActive);
  if (!defaultEdge) return NULL_EDGE_SELECTIONS;
  return {
    edgeTop: defaultEdge.id,
    edgeBottom: null,
    edgeLeft: defaultEdge.id,
    edgeRight: null,
  };
}

export default function DrawingImport({ quoteId, customerId, edgeTypes, onImportComplete, onDrawingsSaved, onClose }: DrawingImportProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [extractedPieces, setExtractedPieces] = useState<ExtractedPiece[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisSteps, setAnalysisSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Save as Template state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateUnitType, setTemplateUnitType] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);

  // R2 storage states
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>('idle');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  // Compress image if needed
  const compressImageIfNeeded = useCallback(async (file: File): Promise<File> => {
    // Only compress images, skip PDFs
    if (!file.type.startsWith('image/')) {
      console.log('[Compression] Skipping compression for non-image file:', file.type);
      return file;
    }

    // If file is already small enough (< 3MB), no need to compress
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB < 3) {
      console.log('[Compression] File is already small enough:', fileSizeMB.toFixed(2), 'MB');
      return file;
    }

    console.log('[Compression] Compressing image...', {
      originalSize: fileSizeMB.toFixed(2) + 'MB',
      fileName: file.name
    });

    try {
      const options = {
        maxSizeMB: 2, // Target max size
        maxWidthOrHeight: 3000, // Max dimension (good for technical drawings)
        useWebWorker: true,
        fileType: file.type,
      };

      const compressedFile = await imageCompression(file, options);
      const compressedSizeMB = compressedFile.size / (1024 * 1024);
      
      console.log('[Compression] Compression complete:', {
        originalSize: fileSizeMB.toFixed(2) + 'MB',
        compressedSize: compressedSizeMB.toFixed(2) + 'MB',
        reduction: ((1 - compressedFile.size / file.size) * 100).toFixed(0) + '%'
      });

      return compressedFile;
    } catch (error) {
      console.error('[Compression] Failed to compress, using original:', error);
      return file; // Fall back to original if compression fails
    }
  }, []);

  // Upload file to R2 storage
  const uploadToStorage = useCallback(async (fileToUpload: File): Promise<UploadResult> => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('>>> [UPLOAD-ENTRY] uploadToStorage FUNCTION CALLED');
    console.log('>>> File to upload:', { 
      fileName: fileToUpload.name, 
      fileSize: fileToUpload.size, 
      fileType: fileToUpload.type,
      customerId: customerId.toString(),
      quoteId: quoteId
    });

    console.log('>>> [UPLOAD-1] Creating FormData...');
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('customerId', customerId.toString());
    formData.append('quoteId', quoteId);
    console.log('>>> [UPLOAD-2] ✅ FormData created successfully');
    
    console.log('>>> [UPLOAD-3] About to call fetch(/api/upload/drawing)...');
    console.log('>>> [UPLOAD-3] THIS IS THE CRITICAL MOMENT - WATCH FOR THIS IN NETWORK TAB!');
    
    try {
      const response = await fetch('/api/upload/drawing', {
        method: 'POST',
        body: formData,
      });
      
      console.log('>>> [UPLOAD-4] ✅ fetch() returned', { 
        status: response.status, 
        ok: response.ok, 
        statusText: response.statusText,
        url: response.url
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('>>> [UPLOAD-ERROR] Server returned error:', errorData);
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const result = await response.json();
      console.log('>>> [UPLOAD-5] ✅✅ Upload COMPLETELY SUCCESSFUL:', result);
      console.log('═══════════════════════════════════════════════════════');
      return result;
    } catch (fetchError) {
      console.error('>>> [UPLOAD-FATAL] fetch() threw an exception:', fetchError);
      console.error('>>> Error details:', {
        name: (fetchError as Error).name,
        message: (fetchError as Error).message,
        stack: (fetchError as Error).stack
      });
      throw fetchError;
    }
  }, [customerId, quoteId]);

  // Save drawing record to database
  const saveDrawingRecord = useCallback(async (
    upload: UploadResult,
    analysisData?: Record<string, unknown>
  ) => {
    console.log('[SaveDrawing] 🔵 Starting database record creation...');
    console.log('[SaveDrawing] Upload data:', upload);
    console.log('[SaveDrawing] Quote ID:', quoteId);
    console.log('[SaveDrawing] API URL:', `/api/quotes/${quoteId}/drawings`);
    
    try {
      const response = await fetch(`/api/quotes/${quoteId}/drawings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...upload,
          analysisData,
        }),
      });

      console.log('[SaveDrawing] Response received:', {
        status: response.status,
        ok: response.ok,
        statusText: response.statusText,
      });

      if (!response.ok) {
        const errorData = await response.json();
        console.error('[SaveDrawing] ❌ API returned error:', errorData);
        throw new Error(errorData.error || 'Failed to save drawing record');
      }

      const result = await response.json();
      console.log('[SaveDrawing] ✅ Database record created successfully:', result);
      return result;
    } catch (error) {
      console.error('[SaveDrawing] ❌ FATAL ERROR:', error);
      throw error;
    }
  }, [quoteId]);

  // Handle file selection
  const handleFile = useCallback(async (selectedFile: File) => {
    console.log('═══════════════════════════════════════════════════════');
    console.log('>>> [DEBUG-START] handleFile CALLED');
    console.log('>>> File Details:', { 
      fileName: selectedFile.name, 
      fileSize: selectedFile.size, 
      fileType: selectedFile.type,
      quoteId,
      customerId
    });
    console.log('═══════════════════════════════════════════════════════');
    
    setFile(selectedFile);
    setError(null);
    setUploadProgress('uploading');
    setStep('analyzing');

    // Initialize progress steps
    setAnalysisSteps([
      { label: 'Optimizing image', done: false },
      { label: 'Uploading to storage', done: false },
      { label: 'Detecting pieces', done: false },
      { label: 'Extracting dimensions', done: false },
      { label: 'Saving drawing', done: false },
    ]);
    setAnalysisProgress(5);

    let storedUploadResult: UploadResult | null = null;
    let analysisResult: AnalysisResult | null = null;

    try {
      // Step 0: Compress image if needed
      console.log('>>> [STEP-0] Checking if compression needed...');
      const fileToUpload = await compressImageIfNeeded(selectedFile);
      setAnalysisSteps(prev => prev.map((s, i) => i === 0 ? { ...s, done: true } : s));
      setAnalysisProgress(10);
      
      // Step 1: Upload to R2 storage
      console.log('>>> [STEP-1] Starting R2 upload process');
      console.log('>>> [STEP-1] Calling uploadToStorage with file:', fileToUpload.name);
      
      if (!fileToUpload) {
        throw new Error('No file selected');
      }
      
      if (!quoteId || !customerId) {
        throw new Error(`Missing required IDs - quoteId: ${quoteId}, customerId: ${customerId}`);
      }
      
      console.log('>>> [STEP-1] All validations passed, calling uploadToStorage NOW...');
      storedUploadResult = await uploadToStorage(fileToUpload);
      console.log('>>> [STEP-1] ✅ uploadToStorage COMPLETED successfully:', storedUploadResult);
      setUploadResult(storedUploadResult);
      setAnalysisSteps(prev => prev.map((s, i) => i === 1 ? { ...s, done: true } : s));
      setAnalysisProgress(30);
      setUploadProgress('analyzing');

      // Simulate progress updates for analysis
      const progressInterval = setInterval(() => {
        setAnalysisProgress(prev => Math.min(prev + 10, 75));
      }, 500);

      setTimeout(() => {
        setAnalysisSteps(prev => prev.map((s, i) => i === 2 ? { ...s, done: true } : s));
      }, 800);

      setTimeout(() => {
        setAnalysisSteps(prev => prev.map((s, i) => i === 3 ? { ...s, done: true } : s));
      }, 1600);

      // Step 2: Call the analyze-drawing API (use compressed file for analysis too)
      console.log('>>> [6] About to call analyze-drawing API');
      const formData = new FormData();
      formData.append('file', fileToUpload);

      const response = await fetch('/api/analyze-drawing', {
        method: 'POST',
        body: formData,
      });
      console.log('>>> [7] analyze-drawing response', { status: response.status, ok: response.ok });

      clearInterval(progressInterval);

      if (!response.ok) {
        const errorData = await response.json();
        console.error('>>> [ANALYZE-ERROR] Analysis failed:', errorData);
        throw new Error(errorData.details || errorData.error || 'Analysis failed');
      }

      const data = await response.json();
      analysisResult = data.analysis as AnalysisResult;
      console.log('>>> [8] Analysis complete', { rooms: analysisResult?.rooms?.length, warnings: analysisResult?.warnings?.length });

      setAnalysisProgress(80);
      setUploadProgress('saving');

      // Step 3: Save drawing record with analysis data
      console.log('>>> [9] About to save drawing record');
      await saveDrawingRecord(storedUploadResult, analysisResult as unknown as Record<string, unknown>);
      console.log('>>> [10] Drawing saved successfully!');
      setAnalysisSteps(prev => prev.map((s, i) => i === 4 ? { ...s, done: true } : s));
      setAnalysisProgress(100);
      setUploadProgress('complete');

      // Notify parent that drawings have been saved
      onDrawingsSaved?.();

      // Transform analysis results to ExtractedPiece format
      const pieces: ExtractedPiece[] = [];
      let pieceIndex = 0;

      for (const room of analysisResult.rooms || []) {
        for (const piece of room.pieces || []) {
          const id = `extracted-${pieceIndex++}`;
          pieces.push({
            id,
            pieceNumber: piece.pieceNumber || pieceIndex,
            name: piece.name || `Piece ${pieceIndex}`,
            length: piece.length || 0,
            width: piece.width || 0,
            thickness: piece.thickness || analysisResult.metadata?.defaultThickness || 20,
            room: room.name || 'Kitchen',
            confidence: piece.confidence || 0.5,
            notes: piece.notes || null,
            cutouts: piece.cutouts || [],
            isEditing: false,
            edgeSelections: getDefaultEdgeSelections(edgeTypes),
          });
        }
      }

      if (pieces.length === 0) {
        throw new Error("Couldn't detect any pieces. Try a clearer image or add pieces manually.");
      }

      setExtractedPieces(pieces);
      setWarnings(analysisResult.warnings || []);

      // Auto-select high confidence pieces (>= 70%)
      const highConfidenceIds = new Set(
        pieces.filter(p => p.confidence >= 0.7).map(p => p.id)
      );
      setSelectedIds(highConfidenceIds);

      setStep('review');

    } catch (err) {
      console.error('>>> [ERROR] handleFile CAUGHT error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze drawing');
      setUploadProgress('error');

      // If upload succeeded but analysis failed, still save the drawing
      if (storedUploadResult && !analysisResult) {
        try {
          await saveDrawingRecord(storedUploadResult);
          onDrawingsSaved?.();
        } catch (saveErr) {
          console.error('>>> [ERROR] Failed to save drawing after analysis error:', saveErr);
        }
      }

      setStep('upload');
      setFile(null);
    }
  }, [uploadToStorage, saveDrawingRecord, onDrawingsSaved, compressImageIfNeeded, quoteId, customerId]);

  // Handle drag events
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Handle drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    console.log('>>> [DROP-EVENT] File dropped');

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const droppedFile = e.dataTransfer.files[0];
      console.log('>>> [DROP-EVENT] File detected:', droppedFile.name, droppedFile.type);
      
      if (isValidFileType(droppedFile)) {
        console.log('>>> [DROP-EVENT] File type valid, calling handleFile');
        handleFile(droppedFile);
      } else {
        console.error('>>> [DROP-EVENT] Invalid file type:', droppedFile.type);
        setError('Please upload a PDF, PNG, or JPG file.');
      }
    } else {
      console.error('>>> [DROP-EVENT] No file found in drop event');
    }
  }, [handleFile]);

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    console.log('>>> [FILE-INPUT] File input changed');
    
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      console.log('>>> [FILE-INPUT] File selected:', selectedFile.name, selectedFile.type);
      console.log('>>> [FILE-INPUT] Calling handleFile...');
      handleFile(selectedFile);
    } else {
      console.error('>>> [FILE-INPUT] No file selected');
    }
  }, [handleFile]);

  // Validate file type
  const isValidFileType = (file: File): boolean => {
    const validTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
    return validTypes.includes(file.type);
  };

  // Toggle piece selection
  const toggleSelection = useCallback((id: string) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  }, []);

  // Select/deselect all
  const selectAll = useCallback(() => {
    setSelectedIds(new Set(extractedPieces.map(p => p.id)));
  }, [extractedPieces]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Toggle piece editing
  const toggleEditing = useCallback((id: string) => {
    setExtractedPieces(prev =>
      prev.map(p => (p.id === id ? { ...p, isEditing: !p.isEditing } : { ...p, isEditing: false }))
    );
  }, []);

  // Update piece field
  const updatePiece = useCallback((id: string, field: keyof ExtractedPiece, value: string | number) => {
    setExtractedPieces(prev =>
      prev.map(p => (p.id === id ? { ...p, [field]: value } : p))
    );
  }, []);

  // Update piece edge selections
  const updatePieceEdges = useCallback((id: string, edges: EdgeSelections) => {
    setExtractedPieces(prev =>
      prev.map(p => (p.id === id ? { ...p, edgeSelections: edges } : p))
    );
  }, []);

  // Import selected pieces
  const handleImport = useCallback(async () => {
    const selectedPieces = extractedPieces.filter(p => selectedIds.has(p.id));

    if (selectedPieces.length === 0) {
      setError('Please select at least one piece to import.');
      return;
    }

    setIsImporting(true);
    setError(null);

    try {
      const response = await fetch(`/api/quotes/${quoteId}/import-pieces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pieces: selectedPieces.map(p => ({
            name: p.name,
            length: p.length,
            width: p.width,
            thickness: p.thickness,
            room: p.room,
            notes: p.notes,
            edgeTop: p.edgeSelections.edgeTop,
            edgeBottom: p.edgeSelections.edgeBottom,
            edgeLeft: p.edgeSelections.edgeLeft,
            edgeRight: p.edgeSelections.edgeRight,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import pieces');
      }

      const result = await response.json();
      onImportComplete(result.count);

    } catch (err) {
      console.error('Import error:', err);
      setError(err instanceof Error ? err.message : 'Failed to import pieces');
    } finally {
      setIsImporting(false);
    }
  }, [quoteId, extractedPieces, selectedIds, onImportComplete]);

  // Save as Template handler
  const handleSaveAsTemplate = useCallback(async () => {
    if (!templateName.trim() || !templateUnitType.trim()) return;

    setIsSavingTemplate(true);
    setError(null);

    try {
      // Build analysis data from extracted pieces
      const roomMap: Record<string, typeof extractedPieces> = {};
      for (const piece of extractedPieces) {
        const roomName = piece.room || 'Kitchen';
        if (!roomMap[roomName]) roomMap[roomName] = [];
        roomMap[roomName].push(piece);
      }

      const analysisData = {
        rooms: Object.entries(roomMap).map(([roomName, pieces]) => ({
          name: roomName,
          pieces: pieces.map(p => ({
            name: p.name,
            length: p.length,
            width: p.width,
            thickness: p.thickness,
            cutouts: p.cutouts || [],
            notes: p.notes,
          })),
        })),
        metadata: { defaultThickness: 20 },
      };

      const response = await fetch('/api/templates/from-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisData,
          name: templateName.trim(),
          unitTypeCode: templateUnitType.trim(),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      setTemplateSaveSuccess(true);
      setShowTemplateForm(false);
    } catch (err) {
      console.error('Save template error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save as template');
    } finally {
      setIsSavingTemplate(false);
    }
  }, [templateName, templateUnitType, extractedPieces]);

  // Get confidence indicator
  const getConfidenceIndicator = (confidence: number) => {
    if (confidence >= 0.9) {
      return { color: 'text-green-600', bg: 'bg-green-100', icon: '✓', label: 'High' };
    } else if (confidence >= 0.7) {
      return { color: 'text-yellow-600', bg: 'bg-yellow-100', icon: '!', label: 'Medium' };
    } else {
      return { color: 'text-red-600', bg: 'bg-red-100', icon: '?', label: 'Low' };
    }
  };

  // Check if piece has any edges selected
  const hasEdgesSelected = (piece: ExtractedPiece): boolean => {
    return !!(
      piece.edgeSelections.edgeTop ||
      piece.edgeSelections.edgeBottom ||
      piece.edgeSelections.edgeLeft ||
      piece.edgeSelections.edgeRight
    );
  };

  // Render upload step
  const renderUploadStep = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Import from Drawing</h2>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      <div
        className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
          dragActive
            ? 'border-primary-500 bg-primary-50'
            : 'border-gray-300 hover:border-primary-400 hover:bg-gray-50'
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

        <svg
          className="mx-auto h-12 w-12 text-gray-400 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>

        <p className="text-gray-600 mb-2">
          Drop drawing here or <span className="text-primary-600 font-medium">click to upload</span>
        </p>
        <p className="text-sm text-gray-500">PDF, PNG, JPG (max 10MB, images auto-compressed)</p>
      </div>

      <p className="mt-4 text-sm text-gray-500">
        Supported: CAD drawings, FileMaker job sheets, hand-drawn sketches with measurements
      </p>

      <div className="mt-6 flex justify-end">
        <button onClick={onClose} className="btn-secondary">
          Cancel
        </button>
      </div>
    </div>
  );

  // Render analyzing step
  const renderAnalyzingStep = () => {
    const getProgressTitle = () => {
      switch (uploadProgress) {
        case 'uploading':
          return 'Uploading Drawing...';
        case 'analyzing':
          return 'Analyzing Drawing...';
        case 'saving':
          return 'Saving Drawing...';
        case 'complete':
          return 'Processing Complete!';
        case 'error':
          return 'Processing Failed';
        default:
          return 'Processing Drawing...';
      }
    };

    return (
      <div className="p-6">
        <h2 className="text-lg font-semibold mb-4">{getProgressTitle()}</h2>

        <div className="mb-6">
          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                uploadProgress === 'error' ? 'bg-red-500' :
                uploadProgress === 'complete' ? 'bg-green-500' : 'bg-primary-600'
              }`}
              style={{ width: `${analysisProgress}%` }}
            />
          </div>
          <p className="text-right text-sm text-gray-500 mt-1">{analysisProgress}%</p>
        </div>

        <div className="space-y-3">
          {analysisSteps.map((stepItem, index) => (
            <div key={index} className="flex items-center gap-3">
              {stepItem.done ? (
                <svg className="h-5 w-5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <div className="h-5 w-5 rounded-full border-2 border-gray-300 border-dashed flex items-center justify-center">
                  <div className="h-2 w-2 rounded-full bg-gray-300 animate-pulse" />
                </div>
              )}
              <span className={stepItem.done ? 'text-gray-900' : 'text-gray-500'}>
                {stepItem.label}
              </span>
            </div>
          ))}
        </div>

        {file && (
          <p className="mt-4 text-sm text-gray-500">
            Processing: {file.name}
          </p>
        )}

        {uploadProgress === 'complete' && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-700 text-sm">Drawing saved successfully!</span>
          </div>
        )}
      </div>
    );
  };

  // Render review step
  const renderReviewStep = () => (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Review Extracted Pieces</h2>
        <button
          onClick={handleImport}
          disabled={isImporting || selectedIds.size === 0}
          className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isImporting ? 'Importing...' : `Import Selected (${selectedIds.size})`}
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {warnings.length > 0 && (
        <div className="mb-4 bg-yellow-50 border border-yellow-200 text-yellow-800 px-4 py-3 rounded-lg">
          <p className="font-medium mb-1">Warnings:</p>
          <ul className="list-disc list-inside text-sm">
            {warnings.map((warning, i) => (
              <li key={i}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-sm text-gray-600 mb-4">
        Found {extractedPieces.length} pieces in drawing. Click a piece name to edit details and set edge polishing.
      </p>

      {/* Selection controls and bulk edge assignment */}
      <div className="flex items-center gap-4 mb-4 flex-wrap">
        <div className="flex gap-2">
          <button onClick={selectAll} className="text-sm text-primary-600 hover:text-primary-700">
            Select All
          </button>
          <span className="text-gray-300">|</span>
          <button onClick={deselectAll} className="text-sm text-primary-600 hover:text-primary-700">
            Deselect All
          </button>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <label className="text-sm text-gray-600">Apply to all visible edges:</label>
          <select
            className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-primary-500 focus:border-primary-500"
            defaultValue=""
            onChange={(e) => {
              const edgeTypeId = e.target.value || null;
              setExtractedPieces(prev =>
                prev.map(p => ({
                  ...p,
                  edgeSelections: {
                    edgeTop: edgeTypeId,
                    edgeBottom: null,
                    edgeLeft: edgeTypeId,
                    edgeRight: null,
                  },
                }))
              );
              e.target.value = '';
            }}
          >
            <option value="">Bulk assign edge...</option>
            {edgeTypes.filter(et => et.isActive && et.category === 'polish').map(et => (
              <option key={et.id} value={et.id}>{et.name}</option>
            ))}
            <option value="">None (clear all)</option>
          </select>
        </div>
      </div>

      {/* Pieces list */}
      <div className="space-y-3">
        {extractedPieces.map(piece => {
          const confidence = getConfidenceIndicator(piece.confidence);
          const hasEdges = hasEdgesSelected(piece);

          return (
            <div key={piece.id} className="border rounded-lg overflow-hidden">
              {/* Piece header row */}
              <div
                className={`flex items-center gap-4 p-4 ${piece.isEditing ? 'bg-primary-50 border-b' : 'bg-white hover:bg-gray-50'}`}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(piece.id)}
                  onChange={() => toggleSelection(piece.id)}
                  className="h-4 w-4 text-primary-600 rounded border-gray-300 focus:ring-primary-500"
                />

                <button
                  onClick={() => toggleEditing(piece.id)}
                  className="flex-1 text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-gray-900">{piece.name}</span>
                    <span className="text-sm text-gray-500">
                      {piece.length} × {piece.width}mm
                    </span>
                    <span className="text-sm text-gray-500">{piece.room}</span>
                    {hasEdges && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                        Edges set
                      </span>
                    )}
                  </div>
                  {piece.notes && (
                    <p className="text-xs text-gray-500 mt-1">AI note: {piece.notes}</p>
                  )}
                </button>

                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${confidence.bg} ${confidence.color}`}
                  title={`${Math.round(piece.confidence * 100)}% confidence`}
                >
                  {Math.round(piece.confidence * 100)}%
                </span>

                <button
                  onClick={() => toggleEditing(piece.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg
                    className={`h-5 w-5 transition-transform ${piece.isEditing ? 'rotate-180' : ''}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {/* Expanded edit panel */}
              {piece.isEditing && (
                <div className="p-4 bg-white space-y-4 relative" onClick={(e) => e.stopPropagation()}>
                  {/* Basic info row */}
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                      <input
                        type="text"
                        value={piece.name}
                        onChange={(e) => updatePiece(piece.id, 'name', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Length (mm)</label>
                      <input
                        type="number"
                        value={piece.length}
                        onChange={(e) => updatePiece(piece.id, 'length', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Width (mm)</label>
                      <input
                        type="number"
                        value={piece.width}
                        onChange={(e) => updatePiece(piece.id, 'width', parseInt(e.target.value) || 0)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-500 focus:border-primary-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Room</label>
                      <select
                        value={piece.room}
                        onChange={(e) => updatePiece(piece.id, 'room', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-primary-500 focus:border-primary-500"
                      >
                        {STANDARD_ROOMS.map(room => (
                          <option key={room} value={room}>
                            {room}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Edge Selector */}
                  {piece.length > 0 && piece.width > 0 && (
                    <div
                      className="relative"
                      style={{ zIndex: 100, isolation: 'isolate' }}
                      onClick={(e) => e.stopPropagation()}
                      onMouseDown={(e) => e.stopPropagation()}
                    >
                      <EdgeSelector
                        lengthMm={piece.length}
                        widthMm={piece.width}
                        edgeSelections={piece.edgeSelections}
                        edgeTypes={edgeTypes}
                        onChange={(edges) => updatePieceEdges(piece.id, edges)}
                      />
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => toggleEditing(piece.id)}
                      className="btn-primary text-sm"
                    >
                      Done
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 flex items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-green-100"></span>
          High confidence (90%+)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-yellow-100"></span>
          Medium (70-89%)
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block w-3 h-3 rounded bg-red-100"></span>
          Low (&lt;70%) - review recommended
        </span>
      </div>

      {/* Save as Template form */}
      {showTemplateForm && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">Save as Unit Type Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-blue-800 mb-1">Template Name</label>
              <input
                type="text"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                placeholder="e.g. Type A — Kitchen & Wet Areas"
                className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-blue-800 mb-1">Unit Type Code</label>
              <input
                type="text"
                value={templateUnitType}
                onChange={(e) => setTemplateUnitType(e.target.value)}
                placeholder="e.g. A, B, C"
                className="w-full px-3 py-2 border border-blue-300 rounded text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
          <div className="mt-3 flex gap-2 justify-end">
            <button
              onClick={() => setShowTemplateForm(false)}
              className="btn-secondary text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveAsTemplate}
              disabled={isSavingTemplate || !templateName.trim() || !templateUnitType.trim()}
              className="btn-primary text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSavingTemplate ? 'Saving...' : 'Save Template'}
            </button>
          </div>
        </div>
      )}

      {templateSaveSuccess && (
        <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
          <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <span className="text-green-700 text-sm">Template saved successfully!</span>
        </div>
      )}

      {/* Footer actions */}
      <div className="mt-6 flex justify-between">
        <div className="flex gap-3">
          <button
            onClick={() => {
              setStep('upload');
              setFile(null);
              setExtractedPieces([]);
              setSelectedIds(new Set());
              setError(null);
            }}
            className="btn-secondary"
          >
            Upload Different Drawing
          </button>
          {!showTemplateForm && !templateSaveSuccess && (
            <button
              onClick={() => setShowTemplateForm(true)}
              className="btn-secondary text-sm"
              title="Save these pieces as a reusable unit type template"
            >
              Save as Template
            </button>
          )}
        </div>
        <div className="flex gap-3">
          <button onClick={onClose} className="btn-secondary">
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={isImporting || selectedIds.size === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? 'Importing...' : `Import ${selectedIds.size} Pieces`}
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-auto">
        {step === 'upload' && renderUploadStep()}
        {step === 'analyzing' && renderAnalyzingStep()}
        {step === 'review' && renderReviewStep()}
      </div>
    </div>
  );
}
