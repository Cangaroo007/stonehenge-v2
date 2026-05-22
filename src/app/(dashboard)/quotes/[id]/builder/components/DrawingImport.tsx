'use client';

import { useState, useCallback, useRef } from 'react';
import imageCompression from 'browser-image-compression';
import PieceVisualEditor from '@/components/quotes/PieceVisualEditor';
import { ClarificationPanel } from '@/components/drawing-analysis/ClarificationPanel';
import { DrawingReviewStage } from '@/components/drawing-analysis/DrawingReviewStage';
import { ClarificationQuestion } from '@/lib/types/drawing-analysis';
import { DrawingCatalogue } from '@/lib/types/drawing-catalogue';
import { VerbalTakeoffInput } from '@/components/drawing-analysis/VerbalTakeoffInput';
import { logger } from '@/lib/logger';
import { trackClarityEvent } from '@/lib/clarity';
import { DRAWING_FILE_ACCEPT, DRAWING_FILE_LABEL, isAllowedDrawingFile } from '@/lib/drawing-file-types';

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
  onImportComplete: (count: number) => void | Promise<void>;
  onDrawingsSaved?: () => void;
  onClose: () => void;
  /** Pre-fill projectId when used within a unit block project context */
  projectId?: number;
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
  pieceType?: string;
  materialId?: number | null;
  materialName?: string | null;
  shape?: string;
  shapeConfig?: Record<string, unknown> | null;
  edgeArcConfig?: Record<string, string | null> | null;
  length: number;
  width: number;
  thickness: number;
  room: string;
  confidence: number;
  notes: string | null;
  cutouts: { type: string; quantity?: number }[];
  relatedTo?: {
    pieceName?: string | null;
    relationshipType?: string | null;
    joinPosition?: string | null;
  } | null;
  edgeBuildups?: Record<string, { depth: number; exposed?: boolean; chargeCut?: boolean; chargePolish?: boolean } | number | boolean | null>;
  noStripEdges?: string[];
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
      cutouts: { type: string; quantity?: number }[];
      edges?: {
        top?: string | null;
        bottom?: string | null;
        left?: string | null;
        right?: string | null;
      };
      edgeTop?: string | null;
      edgeBottom?: string | null;
      edgeLeft?: string | null;
      edgeRight?: string | null;
      shapeConfig?: Record<string, unknown> | null;
      edgeArcConfig?: Record<string, string | null> | null;
      edgeBuildups?: Record<string, { depth: number; exposed?: boolean; chargeCut?: boolean; chargePolish?: boolean } | number | boolean | null>;
      noStripEdges?: string[];
      materialId?: number | null;
      material?: string | null;
      materialName?: string | null;
      relatedTo?: {
        pieceName?: string | null;
        relationshipType?: string | null;
        joinPosition?: string | null;
      } | null;
      notes: string | null;
      confidence: number;
    }[];
  }[];
  warnings: string[];
  questionsForUser: string[];
}

type Step = 'upload' | 'analyzing' | 'clarification' | 'review';

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

export default function DrawingImport({ quoteId, customerId, edgeTypes, onImportComplete, onDrawingsSaved, onClose, projectId }: DrawingImportProps) {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [extractedPieces, setExtractedPieces] = useState<ExtractedPiece[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisSteps, setAnalysisSteps] = useState<{ label: string; done: boolean }[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Clarification state
  const [clarificationQuestions, setClarificationQuestions] = useState<ClarificationQuestion[]>([]);
  const [clarificationDrawingId, setClarificationDrawingId] = useState<string | undefined>();
  const [reviewDrawingId, setReviewDrawingId] = useState<string | undefined>();
  const [clarificationAnalysisId, setClarificationAnalysisId] = useState<number | undefined>();
  const [catalogue, setCatalogue] = useState<DrawingCatalogue>({ materials: [], edgeTypes: [], cutoutTypes: [] });

  // Rough drawing state
  const [isRoughDrawing, setIsRoughDrawing] = useState(false);
  const [roughDrawingMessage, setRoughDrawingMessage] = useState<string | null>(null);

  // Upload tab state (upload step only)
  const [uploadTab, setUploadTab] = useState<'upload' | 'verbal'>('upload');

  // Save as Template state
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateUnitType, setTemplateUnitType] = useState('');
  const [isSavingTemplate, setIsSavingTemplate] = useState(false);
  const [templateSaveSuccess, setTemplateSaveSuccess] = useState(false);
  const [templateSaveResult, setTemplateSaveResult] = useState<{
    templateId: number;
    piecesConverted: number;
    piecesSkipped: number;
    warnings: string[];
  } | null>(null);

  // R2 storage states
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>('idle');
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const resolveCatalogueMaterial = useCallback((materialName?: string | null) => {
    if (!materialName) return null;
    const normalise = (value: string) => value
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const wanted = normalise(materialName);
    if (!wanted) return null;
    return catalogue.materials.find(material => {
      const full = material.collection ? `${material.name} ${material.collection}` : material.name;
      const materialKey = normalise(full);
      const nameKey = normalise(material.name);
      return materialKey === wanted || nameKey === wanted || wanted.includes(nameKey) || materialKey.includes(wanted);
    }) ?? null;
  }, [catalogue.materials]);

  // Compress image if needed
  const compressImageIfNeeded = useCallback(async (file: File): Promise<File> => {
    // Only compress images, skip PDFs
    if (!file.type.startsWith('image/')) {
      return file;
    }

    // If file is already small enough (< 3MB), no need to compress
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB < 3) {
      return file;
    }

    try {
      const options = {
        maxSizeMB: 2, // Target max size
        maxWidthOrHeight: 3000, // Max dimension (good for technical drawings)
        useWebWorker: true,
        fileType: file.type,
      };

      const compressedFile = await imageCompression(file, options);

      return compressedFile;
    } catch (error) {
      logger.error('[Compression] Failed to compress, using original:', error);
      return file; // Fall back to original if compression fails
    }
  }, []);

  // Upload file to R2 storage
  const uploadToStorage = useCallback(async (fileToUpload: File): Promise<UploadResult> => {
    const formData = new FormData();
    formData.append('file', fileToUpload);
    formData.append('customerId', customerId.toString());
    formData.append('quoteId', quoteId);

    try {
      const response = await fetch('/api/upload/drawing', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('[DrawingImport] Upload error:', errorData);
        throw new Error(errorData.error || 'Failed to upload file');
      }

      const result = await response.json();
      return result;
    } catch (fetchError) {
      logger.error('[DrawingImport] Upload failed:', fetchError);
      throw fetchError;
    }
  }, [customerId, quoteId]);

  // Save drawing record to database
  const saveDrawingRecord = useCallback(async (
    upload: UploadResult,
    analysisData?: Record<string, unknown>
  ) => {
    try {
      const response = await fetch(`/api/quotes/${quoteId}/drawings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...upload,
          analysisData,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        logger.error('[DrawingImport] Save drawing error:', errorData);
        throw new Error(errorData.error || 'Failed to save drawing record');
      }

      const result = await response.json();
      return result;
    } catch (error) {
      logger.error('[DrawingImport] Save drawing failed:', error);
      throw error;
    }
  }, [quoteId]);

  // Handle one or more file selections
  const handleFiles = useCallback(async (selectedFiles: File[]) => {
    const validSelectedFiles = selectedFiles.filter(Boolean);
    if (validSelectedFiles.length === 0) {
      logger.error('[DrawingImport] No file selected');
      setError('Please choose at least one drawing file.');
      return;
    }

    const invalidFiles = validSelectedFiles.filter(selectedFile => !isAllowedDrawingFile(selectedFile.name, selectedFile.type));
    if (invalidFiles.length > 0) {
      logger.error('[DrawingImport] Invalid file types:', invalidFiles.map(f => `${f.name} (${f.type})`));
      setError(`Please upload ${DRAWING_FILE_LABEL} files only.`);
      return;
    }

    const isMultiFile = validSelectedFiles.length > 1;
    setFiles(validSelectedFiles);
    setFile(validSelectedFiles[0]);
    setError(null);
    setUploadProgress('uploading');
    setStep('analyzing');
    setExtractedPieces([]);
    setSelectedIds(new Set());
    setWarnings([]);
    setClarificationQuestions([]);
    setClarificationDrawingId(undefined);
    setReviewDrawingId(undefined);
    setClarificationAnalysisId(undefined);
    setIsRoughDrawing(false);
    setRoughDrawingMessage(null);

    // Initialize progress steps
    setAnalysisSteps([
      { label: 'Optimising image', done: false },
      { label: 'Uploading to storage', done: false },
      { label: 'Detecting pieces', done: false },
      { label: 'Extracting dimensions', done: false },
      { label: 'Saving drawing', done: false },
    ]);
    setAnalysisProgress(5);

    const allPieces: ExtractedPiece[] = [];
    const allWarnings: string[] = [];
    let pieceIndex = 0;
    let lastClarificationQuestions: ClarificationQuestion[] = [];
    let lastClarificationDrawingId: string | undefined;
    let lastClarificationAnalysisId: number | undefined;
    let firstSavedDrawingId: string | undefined;
    let shouldShowClarification = false;

    try {
      for (let fileIndex = 0; fileIndex < validSelectedFiles.length; fileIndex++) {
        const selectedFile = validSelectedFiles[fileIndex];
        const fileLabel = isMultiFile ? `File ${fileIndex + 1}/${validSelectedFiles.length}: ` : '';
        let storedUploadResult: UploadResult | null = null;
        let analysisResult: AnalysisResult | null = null;
        let progressInterval: ReturnType<typeof setInterval> | null = null;

        setFile(selectedFile);
        setUploadProgress('uploading');
        setAnalysisProgress(Math.max(5, Math.round((fileIndex / validSelectedFiles.length) * 100)));
        setAnalysisSteps([
          { label: `${fileLabel}Optimising image`, done: false },
          { label: `${fileLabel}Uploading to storage`, done: false },
          { label: `${fileLabel}Detecting pieces`, done: false },
          { label: `${fileLabel}Extracting dimensions`, done: false },
          { label: `${fileLabel}Saving drawing`, done: false },
        ]);

        try {
          // Step 0: Compress image if needed
          const fileToUpload = await compressImageIfNeeded(selectedFile);
          setAnalysisSteps(prev => prev.map((s, i) => i === 0 ? { ...s, done: true } : s));
          setAnalysisProgress(Math.max(10, Math.round(((fileIndex + 0.1) / validSelectedFiles.length) * 100)));

          // Step 1: Upload to R2 storage
          if (!fileToUpload) {
            throw new Error('No file selected');
          }

          if (!quoteId || !customerId) {
            throw new Error(`Missing required IDs - quoteId: ${quoteId}, customerId: ${customerId}`);
          }

          storedUploadResult = await uploadToStorage(fileToUpload);
          setUploadResult(storedUploadResult);
          setAnalysisSteps(prev => prev.map((s, i) => i === 1 ? { ...s, done: true } : s));
          setAnalysisProgress(Math.max(30, Math.round(((fileIndex + 0.3) / validSelectedFiles.length) * 100)));
          setUploadProgress('analyzing');

          // Simulate progress updates for analysis
          progressInterval = setInterval(() => {
            const fileBaseProgress = (fileIndex / validSelectedFiles.length) * 100;
            const fileMaxProgress = ((fileIndex + 0.75) / validSelectedFiles.length) * 100;
            setAnalysisProgress(prev => Math.min(prev + 5, Math.round(fileMaxProgress || fileBaseProgress + 75)));
          }, 500);

          setTimeout(() => {
            setAnalysisSteps(prev => prev.map((s, i) => i === 2 ? { ...s, done: true } : s));
          }, 800);

          setTimeout(() => {
            setAnalysisSteps(prev => prev.map((s, i) => i === 3 ? { ...s, done: true } : s));
          }, 1600);

          // Step 2: Call the analyze-drawing API (use compressed file for analysis too)
          const formData = new FormData();
          formData.append('file', fileToUpload);

          const response = await fetch('/api/analyze-drawing', {
            method: 'POST',
            body: formData,
          });

          if (progressInterval) {
            clearInterval(progressInterval);
            progressInterval = null;
          }

          if (!response.ok) {
            const errorData = await response.json();
            logger.error('[DrawingImport] Analysis failed:', errorData);
            throw new Error(errorData.details || errorData.error || 'Analysis failed');
          }

          const data = await response.json();
          analysisResult = data.analysis as AnalysisResult;

          setAnalysisProgress(Math.max(80, Math.round(((fileIndex + 0.8) / validSelectedFiles.length) * 100)));
          setUploadProgress('saving');

          // Step 3: Save drawing record with analysis data
          const savedDrawing = await saveDrawingRecord(storedUploadResult, analysisResult as unknown as Record<string, unknown>);
          const savedDrawingId = typeof savedDrawing?.id === 'string' ? savedDrawing.id : undefined;
          if (savedDrawingId && !firstSavedDrawingId) {
            firstSavedDrawingId = savedDrawingId;
          }
          setAnalysisSteps(prev => prev.map((s, i) => i === 4 ? { ...s, done: true } : s));
          setAnalysisProgress(Math.round(((fileIndex + 1) / validSelectedFiles.length) * 100));
          setUploadProgress('complete');

          // Notify parent that drawings have been saved
          onDrawingsSaved?.();

          // Store rough drawing flag from DR-5 response
          if (data.isRoughDrawing) {
            setIsRoughDrawing(true);
            setRoughDrawingMessage(data.roughDrawingMessage ?? null);
          }

          // Store clarification data from DR-1 response. The guided clarification
          // panel is intentionally single-document; multi-file imports go to review
          // with warnings so users can correct everything in one place.
          const cQuestions = (data.clarificationQuestions ?? []) as ClarificationQuestion[];
          const requiresReview = data.requiresReview === true && cQuestions.length > 0;
          if (requiresReview) {
            if (isMultiFile) {
              allWarnings.push(`${selectedFile.name}: AI returned ${cQuestions.length} clarification question${cQuestions.length === 1 ? '' : 's'}; review the highlighted pieces before importing.`);
            } else {
              lastClarificationQuestions = cQuestions;
              lastClarificationDrawingId = savedDrawingId;
              lastClarificationAnalysisId =
                typeof data.analysis?.analysisId === 'number' ? data.analysis.analysisId
                : typeof data.analysis?.id === 'number' ? data.analysis.id
                : undefined;
              shouldShowClarification = true;
            }
          }

          // Store catalogue from DR-1 route response
          if (data.catalogue) {
            setCatalogue(data.catalogue as DrawingCatalogue);
          }

          // Transform analysis results to ExtractedPiece format
          for (const room of analysisResult.rooms || []) {
            for (const piece of room.pieces || []) {
              const currentPieceIndex = pieceIndex++;
              const id = `extracted-${fileIndex}-${currentPieceIndex}`;
              const matchedMaterial = resolveCatalogueMaterial(piece.materialName ?? piece.material);
              const importedEdges: EdgeSelections = {
                edgeTop: piece.edgeTop ?? piece.edges?.top ?? null,
                edgeBottom: piece.edgeBottom ?? piece.edges?.bottom ?? null,
                edgeLeft: piece.edgeLeft ?? piece.edges?.left ?? null,
                edgeRight: piece.edgeRight ?? piece.edges?.right ?? null,
              };
              allPieces.push({
                id,
                pieceNumber: piece.pieceNumber || currentPieceIndex + 1,
                name: piece.name || `Piece ${currentPieceIndex + 1}`,
                pieceType: piece.pieceType || undefined,
                materialId: piece.materialId ?? matchedMaterial?.id ?? null,
                materialName: piece.materialName ?? piece.material ?? matchedMaterial?.name ?? null,
                shape: piece.shape || undefined,
                shapeConfig: piece.shapeConfig ?? null,
                edgeArcConfig: piece.edgeArcConfig ?? null,
                length: piece.length || 0,
                width: piece.width || 0,
                thickness: piece.thickness || analysisResult.metadata?.defaultThickness || 20,
                room: room.name || 'Unassigned',
                confidence: piece.confidence || 0.5,
                notes: piece.notes || null,
                cutouts: piece.cutouts || [],
                relatedTo: piece.relatedTo ?? null,
                edgeBuildups: piece.edgeBuildups,
                noStripEdges: piece.noStripEdges,
                isEditing: false,
                edgeSelections: importedEdges,
              });
            }
          }

          allWarnings.push(...(analysisResult.warnings || []).map(warning =>
            isMultiFile ? `${selectedFile.name}: ${warning}` : warning
          ));
        } catch (fileError) {
          if (progressInterval) {
            clearInterval(progressInterval);
          }
          logger.error('[DrawingImport] File processing error:', fileError);

          // If upload succeeded but analysis failed, still save the drawing.
          if (storedUploadResult && !analysisResult) {
            try {
              const savedDrawing = await saveDrawingRecord(storedUploadResult);
              const savedDrawingId = typeof savedDrawing?.id === 'string' ? savedDrawing.id : undefined;
              if (savedDrawingId && !firstSavedDrawingId) {
                firstSavedDrawingId = savedDrawingId;
              }
              onDrawingsSaved?.();
            } catch (saveErr) {
              logger.error('[DrawingImport] Failed to save drawing after analysis error:', saveErr);
            }
          }

          const message = fileError instanceof Error ? fileError.message : 'Failed to analyze drawing';
          throw new Error(`${selectedFile.name}: ${message}`);
        }
      }

      if (allPieces.length === 0) {
        throw new Error("Couldn't detect any pieces. Try a clearer image or add pieces manually.");
      }

      setExtractedPieces(allPieces);
      setWarnings(allWarnings);

      // Auto-select high confidence pieces (>= 70%)
      const highConfidenceIds = new Set(
        allPieces.filter(p => p.confidence >= 0.7).map(p => p.id)
      );
      setSelectedIds(highConfidenceIds);

      // Gate: show clarification step if requiresReview, otherwise straight to review
      if (shouldShowClarification) {
        setClarificationQuestions(lastClarificationQuestions);
        setClarificationDrawingId(lastClarificationDrawingId);
        setReviewDrawingId(lastClarificationDrawingId ?? firstSavedDrawingId);
        setClarificationAnalysisId(lastClarificationAnalysisId);
        setStep('clarification');
      } else {
        setReviewDrawingId(firstSavedDrawingId);
        setStep('review');
      }

    } catch (err) {
      logger.error('[DrawingImport] handleFile error:', err);
      setError(err instanceof Error ? err.message : 'Failed to analyze drawing');
      setUploadProgress('error');
      setStep('upload');
      setFile(null);
      setFiles([]);
    }
  }, [uploadToStorage, saveDrawingRecord, onDrawingsSaved, compressImageIfNeeded, quoteId, customerId, resolveCatalogueMaterial]);

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

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(Array.from(e.dataTransfer.files));
    } else {
      logger.error('[DrawingImport] No file found in drop event');
    }
  }, [handleFiles]);

  // Handle file input change
  const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
    } else {
      logger.error('[DrawingImport] No file selected');
    }
  }, [handleFiles]);

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

  // Import selected pieces — accepts optional direct pieces array (used by DrawingReviewStage)
  const handleImport = useCallback(async (directPieces?: ExtractedPiece[]) => {
    const selectedPieces = directPieces
      ? directPieces
      : extractedPieces.filter(p => selectedIds.has(p.id));

    if (selectedPieces.length === 0) {
      setError('Please select at least one piece to import.');
      return;
    }

    setIsImporting(true);
    setError(null);
    trackClarityEvent('drawing_import_started', {
      quoteId,
      selectedPieces: selectedPieces.length,
    });

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
            shape: p.shape,
            shapeConfig: p.shapeConfig ?? null,
            edgeArcConfig: p.edgeArcConfig ?? null,
            room: p.room,
            notes: p.notes,
            edgeTop: p.edgeSelections.edgeTop,
            edgeBottom: p.edgeSelections.edgeBottom,
            edgeLeft: p.edgeSelections.edgeLeft,
            edgeRight: p.edgeSelections.edgeRight,
            edgeBuildups: p.edgeBuildups,
            noStripEdges: p.noStripEdges,
            pieceType: p.pieceType,
            materialId: p.materialId ?? null,
            material: p.materialName ?? null,
            cutouts: p.cutouts.map(c => ({
              type: c.type,
              quantity: c.quantity ?? 1,
            })),
            relatedTo: p.relatedTo ?? null,
          })),
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to import pieces');
      }

      const result = await response.json();
      await onImportComplete(result.count);

    } catch (err) {
      logger.error('[DrawingImport] Import error:', err);
      trackClarityEvent('quote_error', {
        quoteId,
        area: 'drawing_import',
        message: err instanceof Error ? err.message : 'Failed to import pieces',
      });
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
        const roomName = piece.room || 'Unassigned';
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
          projectId: projectId || undefined,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save template');
      }

      const result = await response.json();
      setTemplateSaveResult({
        templateId: result.templateId,
        piecesConverted: result.piecesConverted,
        piecesSkipped: result.piecesSkipped,
        warnings: result.warnings || [],
      });
      setTemplateSaveSuccess(true);
      setShowTemplateForm(false);
    } catch (err) {
      logger.error('[DrawingImport] Save template error:', err);
      setError(err instanceof Error ? err.message : 'Failed to save as template');
    } finally {
      setIsSavingTemplate(false);
    }
  }, [templateName, templateUnitType, extractedPieces, projectId]);

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
  const handleVerbalPiecesExtracted = useCallback((pieces: ExtractedPiece[]) => {
    setExtractedPieces(pieces);
    setSelectedIds(new Set(pieces.map(p => p.id)));
    setStep('review');
  }, []);

  const renderUploadStep = () => (
    <div className="p-6">
      <h2 className="text-lg font-semibold mb-4">Import from Drawing</h2>

      {/* Tab toggle */}
      <div className="flex rounded-lg border border-gray-200 mb-4 overflow-hidden">
        <button
          onClick={() => setUploadTab('upload')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            uploadTab === 'upload'
              ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          📎 Upload Drawing
        </button>
        <button
          onClick={() => setUploadTab('verbal')}
          className={`flex-1 px-4 py-2 text-sm font-medium transition-colors ${
            uploadTab === 'verbal'
              ? 'bg-primary-50 text-primary-700 border-b-2 border-primary-600'
              : 'text-gray-600 hover:bg-gray-50'
          }`}
        >
          ✏️ Describe Job
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
          {error}
        </div>
      )}

      {uploadTab === 'upload' ? (
        <>
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
              accept={DRAWING_FILE_ACCEPT}
              multiple
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
              Drop drawings here or <span className="text-primary-600 font-medium">click to upload</span>
            </p>
            <p className="text-sm text-gray-500">{DRAWING_FILE_LABEL} (max 10MB each, images auto-compressed)</p>
          </div>

          <p className="mt-4 text-sm text-gray-500">
            Supported: CAD drawings, FileMaker job sheets, hand-drawn sketches with measurements. Select multiple pages/files to review them together.
          </p>
        </>
      ) : (
        <VerbalTakeoffInput
          catalogue={catalogue}
          onPiecesExtracted={handleVerbalPiecesExtracted}
          onCancel={() => setUploadTab('upload')}
        />
      )}

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

        {files.length > 1 ? (
          <p className="mt-4 text-sm text-gray-500">
            Processing {files.indexOf(file as File) + 1} of {files.length}: {file?.name}
          </p>
        ) : file && (
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
          onClick={() => handleImport()}
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

                  {/* Edge Profiles — PieceVisualEditor SVG (Rule 44: no banned edge components) */}
                  {piece.length > 0 && piece.width > 0 && (
                    <PieceVisualEditor
                      lengthMm={piece.length}
                      widthMm={piece.width}
                      edgeTop={piece.edgeSelections.edgeTop}
                      edgeBottom={piece.edgeSelections.edgeBottom}
                      edgeLeft={piece.edgeSelections.edgeLeft}
                      edgeRight={piece.edgeSelections.edgeRight}
                      edgeTypes={edgeTypes.filter((e: { isActive?: boolean }) => e.isActive !== false).map((e: { id: string; name: string }) => ({ id: e.id, name: e.name }))}
                      cutouts={[]}
                      isEditMode={true}
                      onEdgeChange={(side, profileId) => {
                        const keyMap = { top: 'edgeTop', right: 'edgeRight', bottom: 'edgeBottom', left: 'edgeLeft' } as const;
                        updatePieceEdges(piece.id, { ...piece.edgeSelections, [keyMap[side]]: profileId });
                      }}
                    />
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

      {templateSaveSuccess && templateSaveResult && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg space-y-2">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-green-700 text-sm font-medium">
              Template saved — {templateSaveResult.piecesConverted} piece{templateSaveResult.piecesConverted !== 1 ? 's' : ''} converted
              {templateSaveResult.piecesSkipped > 0 && (
                <span className="text-yellow-700">
                  {' '}({templateSaveResult.piecesSkipped} skipped)
                </span>
              )}
            </span>
          </div>
          {templateSaveResult.warnings.length > 0 && (
            <div className="text-xs text-yellow-700 ml-7">
              <ul className="list-disc list-inside space-y-0.5">
                {templateSaveResult.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="ml-7">
            <a
              href={`/quotes/unit-block`}
              className="text-sm text-primary-600 hover:text-primary-700 underline"
            >
              View templates in Unit Block Projects
            </a>
          </div>
        </div>
      )}

      {templateSaveSuccess && !templateSaveResult && (
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
            onClick={() => handleImport()}
            disabled={isImporting || selectedIds.size === 0}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? 'Importing...' : `Import ${selectedIds.size} Pieces`}
          </button>
        </div>
      </div>
    </div>
  );

  // Handle clarification answers — merge into analysis and advance to review
  const handleClarificationSubmit = useCallback((answers: Record<string, string>) => {
    logger.info('[DrawingImport] Clarification answers received:', Object.keys(answers).length);
    // Answers are already logged to corrections by ClarificationPanel.
    setExtractedPieces(prev => {
      let next = prev;
      for (const question of clarificationQuestions) {
        const answer = answers[question.id];
        if (answer === undefined || answer === '' || answer === '__skipped__') continue;

        const applyToPiece = (piece: ExtractedPiece): ExtractedPiece => {
          const fieldPath = (question.fieldPath ?? '').toLowerCase();
          if (question.category === 'DIMENSION') {
            const numericAnswer = Number(answer);
            if (!Number.isFinite(numericAnswer) || numericAnswer <= 0) return piece;
            if (fieldPath.includes('width')) return { ...piece, width: numericAnswer, confidence: Math.max(piece.confidence, 0.85) };
            if (fieldPath.includes('thickness')) return { ...piece, thickness: numericAnswer, confidence: Math.max(piece.confidence, 0.85) };
            return { ...piece, length: numericAnswer, confidence: Math.max(piece.confidence, 0.85) };
          }

          if (question.category === 'MATERIAL') {
            const materialId = /^\d+$/.test(answer) ? Number(answer) : null;
            const material = materialId != null
              ? catalogue.materials.find(candidate => candidate.id === materialId)
              : catalogue.materials.find(candidate => {
                const label = candidate.collection ? `${candidate.name} (${candidate.collection})` : candidate.name;
                return label === answer || candidate.name === answer;
              });
            return {
              ...piece,
              materialId: material?.id ?? piece.materialId ?? null,
              materialName: material?.name ?? answer,
              confidence: Math.max(piece.confidence, 0.85),
            };
          }

          return piece;
        };

        const questionPieceNumber = question.pieceId?.match(/\d+/)?.[0];
        const targetPieceNumber = questionPieceNumber ? Number(questionPieceNumber) : null;
        const questionText = question.question.toLowerCase();
        const targetRoom = STANDARD_ROOMS.find(room => questionText.includes(room.toLowerCase()));
        const appliesToAll = /\ball\b/.test(questionText);

        next = next.map(piece => {
          const pieceNumberMatch = targetPieceNumber != null && piece.pieceNumber === targetPieceNumber;
          const roomMatch = targetRoom ? piece.room.toLowerCase().includes(targetRoom.toLowerCase()) : false;
          if (pieceNumberMatch || (appliesToAll && (!targetRoom || roomMatch))) {
            return applyToPiece(piece);
          }
          return piece;
        });
      }
      return next;
    });
    setStep('review');
  }, [catalogue.materials, clarificationQuestions]);

  const handleClarificationSkip = useCallback(() => {
    logger.info('[DrawingImport] Clarification skipped');
    setStep('review');
  }, []);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-[96vw] w-full max-h-[90vh] overflow-auto">
        {step === 'upload' && renderUploadStep()}
        {step === 'analyzing' && renderAnalyzingStep()}
        {step === 'clarification' && (
          <div className="p-6">
            <h2 className="text-lg font-semibold mb-4">Quick Questions</h2>
            <p className="text-sm text-zinc-600 mb-4">
              We need a few details to ensure accurate quoting. Tap to answer.
            </p>
            {isRoughDrawing && roughDrawingMessage && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4 flex items-start justify-between gap-2">
                <p className="text-sm text-amber-800">
                  ✏️ {roughDrawingMessage}
                </p>
                <button
                  onClick={() => setRoughDrawingMessage(null)}
                  className="text-amber-400 hover:text-amber-600 flex-shrink-0 text-lg leading-none"
                  aria-label="Dismiss"
                >
                  ×
                </button>
              </div>
            )}
            <ClarificationPanel
              questions={clarificationQuestions}
              onAnswersSubmit={handleClarificationSubmit}
              onSkip={handleClarificationSkip}
              drawingId={clarificationDrawingId}
              analysisId={clarificationAnalysisId}
              quoteId={quoteId ? parseInt(quoteId, 10) || undefined : undefined}
              catalogue={catalogue}
            />
          </div>
        )}
        {step === 'review' && extractedPieces.length > 0 && (
          <DrawingReviewStage
            pieces={extractedPieces}
            catalogue={catalogue}
            onConfirm={(confirmedPieces) => {
              // Update extractedPieces state with edits made in review
              setExtractedPieces(confirmedPieces);
              setSelectedIds(new Set(confirmedPieces.map(p => p.id)));
              // Pass confirmed pieces directly to avoid stale state
              handleImport(confirmedPieces);
            }}
            onBack={() => setStep('clarification')}
            onCancel={onClose}
            quoteId={quoteId ? parseInt(quoteId, 10) || undefined : undefined}
            drawingId={reviewDrawingId ?? clarificationDrawingId}
            analysisId={clarificationAnalysisId}
            clarificationQuestions={clarificationQuestions}
            isImporting={isImporting}
            importError={error}
          />
        )}
      </div>
    </div>
  );
}
