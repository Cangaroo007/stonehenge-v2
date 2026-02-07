'use client';

import { useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import imageCompression from 'browser-image-compression';
import { formatCurrency, calculateArea } from '@/lib/utils';
import { useUnits } from '@/lib/contexts/UnitContext';
import { getDimensionUnitLabel, formatAreaFromSqm } from '@/lib/utils/units';
import EdgeSelector from '@/app/(dashboard)/quotes/[id]/builder/components/EdgeSelector';
import DistanceCalculator from '@/components/DistanceCalculator';

interface Customer {
  id: number;
  name: string;
  company: string | null;
  clientTier?: { id: number; name: string } | null;
  clientType?: { id: number; name: string } | null;
}

interface Material {
  id: number;
  name: string;
  collection: string | null;
  pricePerSqm: string | number;
}

interface PricingRule {
  id: number;
  category: string;
  name: string;
  price: string | number;
  priceType: string;
}

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

interface QuoteRoom {
  id: string;
  name: string;
  pieces: QuotePiece[];
}

interface QuotePiece {
  id: string;
  description: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  piece_features: PieceFeature[];
  edgeTop: string | null;
  edgeBottom: string | null;
  edgeLeft: string | null;
  edgeRight: string | null;
  showEdgeSelector?: boolean;
}

interface PieceFeature {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

// Type for piece data from initialData
interface PieceData {
  id: number;
  description: string | null;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  materialId: number | null;
  piece_features: Array<{
    id: number;
    name: string;
    quantity: number;
    unitPrice: string | number;
  }>;
}

// Drawing Analysis Types
interface AnalysisPiece {
  pieceNumber?: number;
  name: string;
  shape?: string;
  length: number;
  width: number;
  thickness: number;
  cutouts?: Array<{ type: string; notes?: string }>;
  notes?: string;
  confidence: number;
}

interface AnalysisRoom {
  name: string;
  pieces: AnalysisPiece[];
}

interface AnalysisMetadata {
  jobNumber?: string | null;
  defaultThickness?: number;
  defaultOverhang?: number;
}

interface AnalysisResult {
  success: boolean;
  drawingType?: 'cad_professional' | 'job_sheet' | 'hand_drawn' | 'architectural';
  metadata?: AnalysisMetadata;
  rooms: AnalysisRoom[];
  warnings?: string[];
  questionsForUser?: string[];
}

interface ExtractedPiece {
  roomName: string;
  description: string;
  lengthMm: number;
  widthMm: number;
  thicknessMm: number;
  shape?: string;
  cutouts?: string;
  notes?: string;
  confidence: number;
  selected: boolean;
  expanded: boolean;
  edgeSelections: EdgeSelections;
}

interface DrawingAnalysisData {
  filename: string;
  analyzedAt: string;
  drawingType: string;
  rawResults: AnalysisResult;
  metadata: AnalysisMetadata | null;
}

interface QuoteFormProps {
  customers: Customer[];
  materials: Material[];
  pricingRules: PricingRule[];
  edgeTypes: EdgeType[];
  nextQuoteNumber: string;
  userId?: number;
  initialData?: {
    id: number;
    quoteNumber: string;
    customerId: number | null;
    projectName: string | null;
    projectAddress: string | null;
    notes: string | null;
    rooms: Array<{
      id: number;
      name: string;
      pieces: Array<{
        id: number;
        description: string | null;
        lengthMm: number;
        widthMm: number;
        thicknessMm: number;
        materialId: number | null;
        piece_features: Array<{
          id: number;
          name: string;
          quantity: number;
          unitPrice: string | number;
        }>;
      }>;
    }>;
    drawingAnalysis?: {
      id: number;
      filename: string;
      analyzedAt: string;
      drawingType: string;
      rawResults: AnalysisResult;
      metadata: AnalysisMetadata | null;
    } | null;
  };
}

const ROOM_TYPES = [
  'Kitchen',
  'Bathroom',
  'Ensuite',
  'Laundry',
  'Pantry',
  "Butler's Pantry",
  'Powder Room',
  'Island',
  'TV Unit',
  'Other',
];

function getConfidenceColor(confidence: number): string {
  if (confidence >= 0.7) return 'text-green-600';
  if (confidence >= 0.5) return 'text-yellow-600';
  return 'text-red-600';
}

function getConfidenceBgColor(confidence: number): string {
  if (confidence >= 0.7) return 'bg-green-100';
  if (confidence >= 0.5) return 'bg-yellow-100';
  return 'bg-red-100';
}

export default function QuoteForm({
  customers,
  materials,
  pricingRules,
  edgeTypes,
  nextQuoteNumber,
  userId,
  initialData,
}: QuoteFormProps) {
  const router = useRouter();
  const { unitSystem } = useUnits();
  const unitLabel = getDimensionUnitLabel(unitSystem);
  const [saving, setSaving] = useState(false);
  const piecesSectionRef = useRef<HTMLDivElement>(null);

  // Form state
  const [customerId, setCustomerId] = useState<number | null>(initialData?.customerId || null);
  const [selectedCustomerTier, setSelectedCustomerTier] = useState<string | null>(() => {
    if (initialData?.customerId) {
      const customer = customers.find(c => c.id === initialData.customerId);
      return customer?.client_tiers?.name || null;
    }
    return null;
  });
  const [selectedCustomerType, setSelectedCustomerType] = useState<string | null>(() => {
    if (initialData?.customerId) {
      const customer = customers.find(c => c.id === initialData.customerId);
      return customer?.client_types?.name || null;
    }
    return null;
  });
  const [projectName, setProjectName] = useState(initialData?.projectName || '');
  const [projectAddress, setProjectAddress] = useState(initialData?.projectAddress || '');
  const [notes, setNotes] = useState(initialData?.notes || '');
  
  // Delivery & Templating state
  const [deliveryExpanded, setDeliveryExpanded] = useState(false);
  const [deliveryData, setDeliveryData] = useState({
    deliveryAddress: initialData?.projectAddress || '',
    deliveryDistanceKm: null as number | null,
    deliveryZoneId: null as number | null,
    deliveryCost: null as number | null,
    deliveryRequired: true,
    templatingRequired: false,
    templatingDistanceKm: null as number | null,
    templatingCost: null as number | null,
    overrideDeliveryCost: null as number | null,
    overrideTemplatingCost: null as number | null,
  });
  
  const [rooms, setRooms] = useState<QuoteRoom[]>(
    initialData?.rooms.map((r) => ({
      id: String(r.id),
      name: r.name,
      pieces: r.pieces.map((p: PieceData & { edgeTop?: string | null; edgeBottom?: string | null; edgeLeft?: string | null; edgeRight?: string | null }) => ({
        id: String(p.id),
        description: p.description || '',
        lengthMm: p.lengthMm,
        widthMm: p.widthMm,
        thicknessMm: p.thicknessMm,
        materialId: p.materialId,
        piece_features: p.features.map((f) => ({
          id: String(f.id),
          name: f.name,
          quantity: f.quantity,
          unitPrice: Number(f.unitPrice),
        })),
        edgeTop: p.edgeTop || null,
        edgeBottom: p.edgeBottom || null,
        edgeLeft: p.edgeLeft || null,
        edgeRight: p.edgeRight || null,
        showEdgeSelector: false,
      })),
    })) || []
  );

  // Drawing Analysis State
  const [analysisExpanded, setAnalysisExpanded] = useState(!initialData || rooms.length === 0);
  const [dragActive, setDragActive] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isPdfFile, setIsPdfFile] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(
    initialData?.drawingAnalysis?.rawResults || null
  );
  const [extractedPieces, setExtractedPieces] = useState<ExtractedPiece[]>([]);
  const [analysisData, setAnalysisData] = useState<DrawingAnalysisData | null>(
    initialData?.drawingAnalysis ? {
      filename: initialData.drawingAnalysis.filename,
      analyzedAt: initialData.drawingAnalysis.analyzedAt,
      drawingType: initialData.drawingAnalysis.drawingType,
      rawResults: initialData.drawingAnalysis.rawResults,
      metadata: initialData.drawingAnalysis.metadata,
    } : null
  );
  // Store the actual file for R2 upload after quote creation
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  // Also keep a ref to avoid stale closure issues in handleSave
  const uploadFileRef = useRef<File | null>(null);

  // Modal states
  const [showRoomSelector, setShowRoomSelector] = useState(false);

  const taxRate = 10;

  // Group pricing rules by category
  const featureOptions = pricingRules.filter(
    (r) => r.category === 'cutout' || r.category === 'feature'
  );

  // Calculate totals
  function calculatePieceCost(piece: QuotePiece): { materialCost: number; featuresCost: number; total: number } {
    const material = materials.find((m) => m.id === piece.materialId);
    const areaSqm = calculateArea(piece.lengthMm, piece.widthMm);
    const pricePerSqm = material ? Number(material.pricePerSqm) : 0;

    // Thickness multiplier
    let thicknessMultiplier = 1;
    if (piece.thicknessMm === 30) thicknessMultiplier = 1.3;
    if (piece.thicknessMm === 40) thicknessMultiplier = 1.5;

    const materialCost = areaSqm * pricePerSqm * thicknessMultiplier;
    const featuresCost = piece.features.reduce((sum, f) => sum + f.unitPrice * f.quantity, 0);

    return {
      materialCost,
      featuresCost,
      total: materialCost + featuresCost,
    };
  }

  function calculateTotals() {
    let subtotal = 0;
    rooms.forEach((room) => {
      quote_rooms.pieces.forEach((piece) => {
        subtotal += calculatePieceCost(piece).total;
      });
    });
    
    // Add delivery and templating to subtotal
    const deliveryCost = deliveryData.deliveryRequired ? (deliveryData.deliveryCost || 0) : 0;
    const templatingCost = deliveryData.templatingRequired ? (deliveryData.templatingCost || 0) : 0;
    subtotal += deliveryCost + templatingCost;
    
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;
    return { 
      subtotal, 
      taxAmount, 
      total,
      deliveryCost,
      templatingCost,
    };
  }

  const totals = calculateTotals();

  // Room management
  const roomTypes = ['Kitchen', 'Bathroom', 'Ensuite', 'Laundry', 'Pantry', 'Butler\'s Pantry', 'Powder Room', 'Other'];

  function addRoom() {
    setShowRoomSelector(true);
  }

  function addRoomWithType(roomType: string) {
    const usedNames = rooms.map((r) => r.name);
    let newName = roomType;

    // Handle duplicate names
    if (usedNames.includes(newName)) {
      let counter = 2;
      while (usedNames.includes(`${roomType} ${counter}`)) {
        counter++;
      }
      newName = `${roomType} ${counter}`;
    }

    setRooms([
      ...rooms,
      {
        id: `new-${Date.now()}`,
        name: newName,
        pieces: [],
      },
    ]);
    setShowRoomSelector(false);
  }

  function removeRoom(roomId: string) {
    setRooms(rooms.filter((r) => r.id !== roomId));
  }

  function updateRoomName(roomId: string, name: string) {
    setRooms(rooms.map((r) => (r.id === roomId ? { ...r, name } : r)));
  }

  // Piece management
  function addPiece(roomId: string) {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              pieces: [
                ...r.pieces,
                {
                  id: `new-${Date.now()}`,
                  description: '',
                  lengthMm: 1000,
                  widthMm: 600,
                  thicknessMm: 20,
                  materialId: materials[0]?.id || null,
                  piece_features: [],
                  edgeTop: null,
                  edgeBottom: null,
                  edgeLeft: null,
                  edgeRight: null,
                  showEdgeSelector: false,
                },
              ],
            }
          : r
      )
    );
  }

  function removePiece(roomId: string, pieceId: string) {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? { ...r, pieces: r.pieces.filter((p) => p.id !== pieceId) }
          : r
      )
    );
  }

  function updatePiece(roomId: string, pieceId: string, updates: Partial<QuotePiece>) {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              pieces: r.pieces.map((p) => (p.id === pieceId ? { ...p, ...updates } : p)),
            }
          : r
      )
    );
  }

  // Feature management
  function addFeature(roomId: string, pieceId: string) {
    const defaultFeature = featureOptions[0];
    if (!defaultFeature) return;

    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              pieces: r.pieces.map((p) =>
                p.id === pieceId
                  ? {
                      ...p,
                      piece_features: [
                        ...p.features,
                        {
                          id: `new-${Date.now()}`,
                          name: defaultFeature.name,
                          quantity: 1,
                          unitPrice: Number(defaultFeature.price),
                        },
                      ],
                    }
                  : p
              ),
            }
          : r
      )
    );
  }

  function removeFeature(roomId: string, pieceId: string, featureId: string) {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              pieces: r.pieces.map((p) =>
                p.id === pieceId
                  ? { ...p, piece_features: p.features.filter((f) => f.id !== featureId) }
                  : p
              ),
            }
          : r
      )
    );
  }

  function updateFeature(
    roomId: string,
    pieceId: string,
    featureId: string,
    updates: Partial<PieceFeature>
  ) {
    setRooms(
      rooms.map((r) =>
        r.id === roomId
          ? {
              ...r,
              pieces: r.pieces.map((p) =>
                p.id === pieceId
                  ? {
                      ...p,
                      piece_features: p.features.map((f) =>
                        f.id === featureId ? { ...f, ...updates } : f
                      ),
                    }
                  : p
              ),
            }
          : r
      )
    );
  }

  function handleFeatureChange(roomId: string, pieceId: string, featureId: string, ruleName: string) {
    const rule = featureOptions.find((r) => r.name === ruleName);
    if (!rule) return;

    updateFeature(roomId, pieceId, featureId, {
      name: rule.name,
      unitPrice: Number(rule.price),
    });
  }

  // Drawing Analysis Functions
  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  }, []);

  // Compress image if needed (same as DrawingImport)
  const compressImageIfNeeded = useCallback(async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) {
      console.log('[QuoteForm Compression] Skipping compression for non-image file:', file.type);
      return file;
    }

    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB < 3) {
      console.log('[QuoteForm Compression] File is already small enough:', fileSizeMB.toFixed(2), 'MB');
      return file;
    }

    console.log('[QuoteForm Compression] Compressing image...', {
      originalSize: fileSizeMB.toFixed(2) + 'MB',
      fileName: file.name
    });

    try {
      const options = {
        maxSizeMB: 2,
        maxWidthOrHeight: 3000,
        useWebWorker: true,
        fileType: file.type,
      };

      const compressedFile = await imageCompression(file, options);
      const compressedSizeMB = compressedFile.size / (1024 * 1024);
      
      console.log('[QuoteForm Compression] Compression complete:', {
        originalSize: fileSizeMB.toFixed(2) + 'MB',
        compressedSize: compressedSizeMB.toFixed(2) + 'MB',
        reduction: ((1 - compressedFile.size / file.size) * 100).toFixed(0) + '%'
      });

      return compressedFile;
    } catch (error) {
      console.error('[QuoteForm Compression] Failed to compress, using original:', error);
      return file;
    }
  }, []);

  const processFile = useCallback(async (file: File) => {
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf';

    if (!isImage && !isPdf) {
      setAnalysisError('Please upload an image file (JPEG, PNG, GIF, WebP) or PDF');
      return;
    }

    setIsPdfFile(isPdf);
    setAnalysisError(null);
    setAnalyzing(true);
    setAnalysisResult(null);
    setExtractedPieces([]);

    try {
      // Compress image if needed
      console.log('[QuoteForm] Processing file:', file.name, file.size);
      const fileToUse = await compressImageIfNeeded(file);
      
      // Store the compressed file for R2 upload after quote creation
      setUploadFile(fileToUse);
      uploadFileRef.current = fileToUse;
      console.log('[QuoteForm] ✅ File stored in uploadFile state + ref:', {
        name: fileToUse.name,
        size: fileToUse.size,
        type: fileToUse.type
      });

      // Create preview from the compressed file
      if (isImage) {
        const url = URL.createObjectURL(fileToUse);
        setPreviewUrl(url);
      } else {
        setPreviewUrl(null);
      }

      const formData = new FormData();
      formData.append('file', fileToUse);

      const response = await fetch('/api/analyze-drawing', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to analyze drawing');
      }

      if (data.success && data.analysis) {
        const analysisData = data.analysis as AnalysisResult;
        setAnalysisResult(analysisData);

        // Store analysis data for saving
        setAnalysisData({
          filename: file.name,
          analyzedAt: new Date().toISOString(),
          drawingType: analysisData.drawingType || 'unknown',
          rawResults: analysisData,
          metadata: analysisData.metadata || null,
        });

        // Flatten rooms into editable pieces
        const pieces: ExtractedPiece[] = [];
        if (analysisData.rooms && Array.isArray(analysisData.rooms)) {
          for (const room of analysisData.rooms) {
            for (const piece of quote_rooms.pieces) {
              const cutoutsStr = piece.cutouts?.map(c => c.type).join(', ') || '';
              pieces.push({
                roomName: quote_rooms.name,
                description: piece.name || `Piece ${piece.pieceNumber || pieces.length + 1}`,
                lengthMm: piece.length,
                widthMm: piece.width,
                thicknessMm: piece.thickness || analysisData.metadata?.defaultThickness || 20,
                shape: piece.shape,
                cutouts: cutoutsStr,
                notes: piece.notes,
                confidence: piece.confidence,
                selected: true,
                expanded: false,
                edgeSelections: {
                  edgeTop: null,
                  edgeBottom: null,
                  edgeLeft: null,
                  edgeRight: null,
                },
              });
            }
          }
        }

        setExtractedPieces(pieces);
      } else {
        throw new Error('Invalid response from server');
      }
    } catch (err) {
      console.error('Analysis error:', err);
      setAnalysisError(err instanceof Error ? err.message : 'Failed to analyze drawing');
    } finally {
      setAnalyzing(false);
    }
  }, [compressImageIfNeeded]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);

      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        processFile(e.dataTransfer.files[0]);
      }
    },
    [processFile]
  );

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files[0]) {
        processFile(e.target.files[0]);
      }
    },
    [processFile]
  );

  const togglePieceSelection = (index: number) => {
    setExtractedPieces((prev) =>
      prev.map((p, i) => (i === index ? { ...p, selected: !p.selected } : p))
    );
  };

  const togglePieceExpanded = (index: number) => {
    setExtractedPieces((prev) =>
      prev.map((p, i) => (i === index ? { ...p, expanded: !p.expanded } : { ...p, expanded: false }))
    );
  };

  const updatePieceEdges = (index: number, edges: EdgeSelections) => {
    setExtractedPieces((prev) =>
      prev.map((p, i) => (i === index ? { ...p, edgeSelections: edges } : p))
    );
  };

  const updateExtractedPiece = (index: number, updates: Partial<ExtractedPiece>) => {
    setExtractedPieces((prev) =>
      prev.map((p, i) => (i === index ? { ...p, ...updates } : p))
    );
  };

  const handleImportSelectedPieces = () => {
    const selectedPieces = extractedPieces.filter((p) => p.selected);
    if (selectedPieces.length === 0) {
      toast.error('Please select at least one piece to import');
      return;
    }

    // Group pieces by room name
    const piecesByRoom: Record<string, ExtractedPiece[]> = {};
    for (const piece of selectedPieces) {
      const roomName = piece.roomName || 'Room';
      if (!piecesByRoom[roomName]) {
        piecesByRoom[roomName] = [];
      }
      piecesByRoom[roomName].push(piece);
    }

    const existingRoomNames = rooms.map((r) => r.name);
    const newRooms: QuoteRoom[] = [];
    let totalPiecesImported = 0;

    // Create rooms and pieces
    for (const [baseName, roomPieces] of Object.entries(piecesByRoom)) {
      let roomName = baseName;

      // Handle duplicate room names
      if (existingRoomNames.includes(roomName)) {
        let counter = 2;
        while (existingRoomNames.includes(`${baseName} ${counter}`)) {
          counter++;
        }
        roomName = `${baseName} ${counter}`;
      }
      existingRoomNames.push(roomName);

      const newRoom: QuoteRoom = {
        id: `new-${Date.now()}-${roomName}`,
        name: roomName,
        pieces: roomPieces.map((p, index) => ({
          id: `new-${Date.now()}-${index}`,
          description: p.description,
          lengthMm: p.lengthMm,
          widthMm: p.widthMm,
          thicknessMm: p.thicknessMm,
          materialId: materials[0]?.id || null,
          piece_features: [],
          edgeTop: p.edgeSelections.edgeTop,
          edgeBottom: p.edgeSelections.edgeBottom,
          edgeLeft: p.edgeSelections.edgeLeft,
          edgeRight: p.edgeSelections.edgeRight,
          showEdgeSelector: false,
        })),
      };
      newRooms.push(newRoom);
      totalPiecesImported += roomPieces.length;
    }

    setRooms([...rooms, ...newRooms]);
    setExtractedPieces([]);
    setAnalysisResult(null);
    setAnalysisExpanded(false);
    toast.success(`Imported ${totalPiecesImported} pieces from drawing analysis`);

    // Scroll to pieces section
    setTimeout(() => {
      piecesSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  const resetAnalysis = () => {
    setPreviewUrl(null);
    setIsPdfFile(false);
    setAnalysisResult(null);
    setExtractedPieces([]);
    setAnalysisError(null);
    setAnalysisData(null);
  };

  // Customer selection handler
  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCustomerId = e.target.value ? Number(e.target.value) : null;
    setCustomerId(newCustomerId);

    if (newCustomerId) {
      const customer = customers.find(c => c.id === newCustomerId);
      setSelectedCustomerTier(customer?.client_tiers?.name || null);
      setSelectedCustomerType(customer?.client_types?.name || null);
    } else {
      setSelectedCustomerTier(null);
      setSelectedCustomerType(null);
    }
  };

  // Get unique room names from extracted pieces
  const extractedRoomNames = Array.from(new Set(extractedPieces.map((p) => p.roomName)));

  // Save quote
  async function handleSave(status: string = 'draft') {
    console.log('[QuoteForm] ═══════════════════════════════════════');
    console.log('[QuoteForm] handleSave CALLED');
    console.log('[QuoteForm] State at save time:', {
      customerId,
      hasUploadFile: !!uploadFile,
      uploadFileName: uploadFile?.name,
      uploadFileSize: uploadFile?.size,
      isInitialData: !!initialData,
      status
    });
    console.log('[QuoteForm] ═══════════════════════════════════════');
    
    setSaving(true);
    try {
      const payload = {
        quoteNumber: initialData?.quoteNumber || nextQuoteNumber,
        customerId,
        projectName,
        projectAddress,
        notes,
        status,
        // Delivery & Templating data
        deliveryAddress: deliveryData.deliveryAddress || projectAddress,
        deliveryDistanceKm: deliveryData.deliveryDistanceKm,
        deliveryZoneId: deliveryData.deliveryZoneId,
        deliveryCost: deliveryData.deliveryRequired ? deliveryData.deliveryCost : 0,
        overrideDeliveryCost: deliveryData.overrideDeliveryCost,
        templatingRequired: deliveryData.templatingRequired,
        templatingDistanceKm: deliveryData.templatingDistanceKm,
        templatingCost: deliveryData.templatingCost,
        overrideTemplatingCost: deliveryData.overrideTemplatingCost,
        rooms: rooms.map((r, ri) => ({
          name: r.name,
          sortOrder: ri,
          pieces: r.pieces.map((p, pi) => {
            const costs = calculatePieceCost(p);
            const material = materials.find((m) => m.id === p.materialId);
            return {
              description: p.description,
              lengthMm: p.lengthMm,
              widthMm: p.widthMm,
              thicknessMm: p.thicknessMm,
              materialId: p.materialId,
              materialName: material?.name || null,
              areaSqm: calculateArea(p.lengthMm, p.widthMm),
              materialCost: costs.materialCost,
              featuresCost: costs.featuresCost,
              totalCost: costs.total,
              sortOrder: pi,
              edgeTop: p.edgeTop,
              edgeBottom: p.edgeBottom,
              edgeLeft: p.edgeLeft,
              edgeRight: p.edgeRight,
              piece_features: p.features.map((f) => ({
                name: f.name,
                quantity: f.quantity,
                unitPrice: f.unitPrice,
                totalPrice: f.unitPrice * f.quantity,
              })),
            };
          }),
        })),
        subtotal: totals.subtotal,
        taxRate,
        taxAmount: totals.taxAmount,
        total: totals.total,
        createdBy: userId,
        quote_drawing_analyses: analysisData,
      };

      const url = initialData ? `/api/quotes/${initialData.id}` : '/api/quotes';
      const method = initialData ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const data = await res.json();
        
        // Use ref as fallback in case React state closure is stale
        const fileToUpload = uploadFile || uploadFileRef.current;

        // DEBUG: Check all conditions for R2 upload
        console.log('[QuoteForm] Quote save successful, checking R2 upload conditions:', {
          hasUploadFile: !!uploadFile,
          hasUploadFileRef: !!uploadFileRef.current,
          uploadFileName: fileToUpload?.name,
          uploadFileSize: fileToUpload?.size,
          hasCustomerId: !!customerId,
          customerIdValue: customerId,
          isInitialData: !!initialData,
          quoteId: data.id,
          shouldUpload: !!(fileToUpload && customerId && !initialData)
        });

        // If we have a file to upload and a customerId, upload it to R2 now that we have the quoteId
        if (fileToUpload && customerId && !initialData) {
          console.log('[QuoteForm] ✅ All conditions met, uploading drawing to R2...', {
            quoteId: data.id,
            customerId,
            filename: fileToUpload.name
          });

          try {
            // Step 1: Upload to R2 storage
            const formData = new FormData();
            formData.append('file', fileToUpload);
            formData.append('customerId', customerId.toString());
            formData.append('quoteId', data.id.toString());
            
            console.log('[QuoteForm] Calling /api/upload/drawing...');
            const uploadResponse = await fetch('/api/upload/drawing', {
              method: 'POST',
              body: formData,
            });
            
            if (!uploadResponse.ok) {
              const uploadError = await uploadResponse.json();
              console.error('[QuoteForm] R2 upload failed:', uploadError);
              throw new Error(uploadError.error || 'Failed to upload drawing to storage');
            }
            
            const uploadResult = await uploadResponse.json();
            console.log('[QuoteForm] R2 upload successful:', uploadResult);
            
            // Step 2: Create drawing database record
            console.log('[QuoteForm] Creating drawing database record...');
            const drawingResponse = await fetch(`/api/quotes/${data.id}/drawings`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                ...uploadResult,
                analysisData: analysisData?.rawResults,
              }),
            });
            
            if (!drawingResponse.ok) {
              const drawingError = await drawingResponse.json();
              console.error('[QuoteForm] Drawing record creation failed:', drawingError);
              throw new Error(drawingError.error || 'Failed to save drawing record');
            }
            
            console.log('[QuoteForm] ✅✅ Drawing saved successfully to R2 and database!');
          } catch (uploadErr) {
            console.error('[QuoteForm] ❌ Error uploading drawing after quote creation:', uploadErr);
            // Don't fail the whole operation, but warn the user
            toast.error('Quote created but drawing upload failed. You can upload it again from the Quote Builder.');
          }
        } else {
          console.log('[QuoteForm] ⚠️ R2 upload SKIPPED. Reason:', {
            noUploadFile: !fileToUpload,
            noUploadFileState: !uploadFile,
            noUploadFileRef: !uploadFileRef.current,
            noCustomerId: !customerId,
            isEditMode: !!initialData
          });
        }
        
        toast.success(initialData ? 'Quote updated!' : 'Quote created!');
        router.push(`/quotes/${data.id}`);
        router.refresh();
      } else {
        const error = await res.json();
        toast.error(error.error || 'Failed to save quote');
      }
    } catch (error) {
      console.error('Save error:', error);
      toast.error('An error occurred');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Info */}
      <div className="card p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="label">Quote Number</label>
            <input
              type="text"
              className="input bg-gray-50"
              value={initialData?.quoteNumber || nextQuoteNumber}
              disabled
            />
          </div>
          <div>
            <label className="label">Customer</label>
            <select
              className="input"
              value={customerId || ''}
              onChange={handleCustomerChange}
            >
              <option value="">Select customer...</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company ? `(${c.company})` : ''}
                </option>
              ))}
            </select>
            {/* Pricing Status Indicator */}
            <div className="mt-2">
              {!customerId ? (
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span>Using base prices (no customer selected)</span>
                </div>
              ) : selectedCustomerTier ? (
                <div className="flex items-center gap-2">
                  <span className={`
                    inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium
                    ${selectedCustomerTier === 'Tier 1' ? 'bg-green-100 text-green-800' :
                      selectedCustomerTier === 'Tier 2' ? 'bg-blue-100 text-blue-800' :
                      'bg-gray-100 text-gray-800'}
                  `}>
                    {selectedCustomerTier}
                  </span>
                  {selectedCustomerType && (
                    <span className="text-sm text-gray-600">{selectedCustomerType}</span>
                  )}
                  <span className="text-sm text-green-600">✓ Tier pricing will apply</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <span>No pricing tier assigned - using base prices</span>
                </div>
              )}
            </div>
          </div>
          <div>
            <label className="label">Project Name</label>
            <input
              type="text"
              className="input"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="e.g., Villa 48 - Kitchen & Bathrooms"
            />
          </div>
          <div>
            <label className="label">Project Address</label>
            <input
              type="text"
              className="input"
              value={projectAddress}
              onChange={(e) => setProjectAddress(e.target.value)}
              placeholder="Site address"
            />
          </div>
        </div>
      </div>

      {/* Delivery & Templating Section */}
      <div className="card">
        <button
          type="button"
          onClick={() => setDeliveryExpanded(!deliveryExpanded)}
          className="w-full p-4 flex items-center justify-between bg-gray-50 rounded-t-xl hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-lg font-semibold text-gray-900">Delivery & Templating</span>
            {!deliveryExpanded && deliveryData.deliveryCost !== null && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Calculated
              </span>
            )}
          </div>
          <svg
            className={`h-5 w-5 text-gray-500 transition-transform ${deliveryExpanded ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {deliveryExpanded && (
          <div className="p-6 border-t border-gray-200">
            <DistanceCalculator
              initialAddress={projectAddress || deliveryData.deliveryAddress}
              initialDeliveryRequired={deliveryData.deliveryRequired}
              initialDeliveryCost={deliveryData.deliveryCost}
              initialTemplatingRequired={deliveryData.templatingRequired}
              initialTemplatingCost={deliveryData.templatingCost}
              initialDistanceKm={deliveryData.deliveryDistanceKm}
              initialZoneId={deliveryData.deliveryZoneId}
              onChange={(data) => {
                setDeliveryData(data);
                // Auto-sync delivery address to project address if not set
                if (!projectAddress && data.deliveryAddress) {
                  setProjectAddress(data.deliveryAddress);
                }
              }}
            />
          </div>
        )}
      </div>

      {/* Drawing Analysis Section */}
      <div className="card">
        <button
          type="button"
          onClick={() => setAnalysisExpanded(!analysisExpanded)}
          className="w-full p-4 flex items-center justify-between bg-gray-50 rounded-t-xl hover:bg-gray-100 transition-colors"
        >
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            <span className="text-lg font-semibold text-gray-900">Drawing Analysis</span>
            <span className="text-sm text-gray-500">(Optional)</span>
            {!customerId && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-100 text-yellow-800">
                ⚠️ Select customer first
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {analysisData && !analysisResult && (
              <span className="text-sm text-green-600 flex items-center gap-1">
                <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                Analysis stored
              </span>
            )}
            <svg
              className={`h-5 w-5 text-gray-500 transition-transform ${analysisExpanded ? 'rotate-180' : ''}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </button>

        {analysisExpanded && (
          <div className="p-6 border-t border-gray-200">
            {/* Customer Required Warning */}
            {!customerId && (
              <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start gap-3">
                  <svg className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  <div className="flex-1">
                    <p className="font-medium text-yellow-800">Customer Required</p>
                    <p className="text-sm text-yellow-700 mt-1">
                      Please select a customer from the dropdown above before uploading a drawing. This ensures the drawing is properly saved and linked to the quote.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error message */}
            {analysisError && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm flex items-start gap-2">
                <svg className="h-5 w-5 flex-shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
                <div>
                  <p>{analysisError}</p>
                  <button
                    type="button"
                    onClick={resetAnalysis}
                    className="mt-2 text-red-800 underline hover:no-underline"
                  >
                    Try again
                  </button>
                </div>
              </div>
            )}

            {/* Upload Zone - Show when no analysis */}
            {!analyzing && !analysisResult && (
              <div
                className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                  !customerId
                    ? 'border-gray-200 bg-gray-50 opacity-50 cursor-not-allowed'
                    : dragActive
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={customerId ? handleDrag : undefined}
                onDragLeave={customerId ? handleDrag : undefined}
                onDragOver={customerId ? handleDrag : undefined}
                onDrop={customerId ? handleDrop : undefined}
              >
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <p className="mt-4 text-sm text-gray-600">
                  {customerId ? (
                    <>
                      Drop drawing here or{' '}
                      <label className="text-primary-600 hover:text-primary-700 cursor-pointer font-medium">
                        click to browse
                        <input
                          type="file"
                          className="hidden"
                          accept="image/*,.pdf,application/pdf"
                          onChange={handleFileSelect}
                        />
                      </label>
                    </>
                  ) : (
                    <span className="text-gray-400">
                      Select a customer above to enable drawing upload
                    </span>
                  )}
                </p>
                {customerId && (
                  <p className="mt-2 text-xs text-gray-500">
                    Supports: PNG, JPG, PDF (max 10MB, images auto-compressed)
                  </p>
                )}
              </div>
            )}

            {/* Analyzing State */}
            {analyzing && (
              <div className="text-center py-8">
                <div className="mb-6">
                  {previewUrl ? (
                    <img
                      src={previewUrl}
                      alt="Uploaded drawing"
                      className="max-h-48 mx-auto rounded-lg shadow-md"
                    />
                  ) : isPdfFile ? (
                    <div className="mx-auto w-24 h-32 bg-red-50 border border-red-200 rounded-lg flex items-center justify-center">
                      <svg className="w-12 h-12 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z"/>
                      </svg>
                    </div>
                  ) : null}
                </div>
                <div className="flex items-center justify-center gap-3">
                  <svg
                    className="animate-spin h-6 w-6 text-primary-600"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  <span className="text-gray-600">Analyzing drawing...</span>
                </div>
                <p className="mt-2 text-sm text-gray-500">
                  This may take a few seconds
                </p>
              </div>
            )}

            {/* Analysis Results */}
            {analysisResult && extractedPieces.length > 0 && (
              <div className="space-y-6">
                {/* Header with actions */}
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900">Analysis Results</h3>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={resetAnalysis}
                      className="btn-secondary text-sm"
                    >
                      Re-analyze
                    </button>
                    <button
                      type="button"
                      onClick={resetAnalysis}
                      className="text-gray-400 hover:text-gray-500"
                    >
                      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Drawing Preview */}
                {previewUrl && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex-shrink-0">
                      <img
                        src={previewUrl}
                        alt="Drawing preview"
                        className="w-20 h-20 object-cover rounded border border-blue-300"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">Drawing Uploaded</p>
                      <p className="text-xs text-blue-700">
                        {uploadFile?.name || 'Drawing file'} 
                        {uploadFile && ` (${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB)`}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        ✓ Will be saved to cloud storage when quote is created
                      </p>
                    </div>
                  </div>
                )}
                {isPdfFile && !previewUrl && (
                  <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="flex-shrink-0">
                      <div className="w-20 h-20 bg-red-100 border border-red-300 rounded flex items-center justify-center">
                        <svg className="w-10 h-10 text-red-500" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zm-1 2l5 5h-5V4z"/>
                        </svg>
                      </div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-blue-900">PDF Drawing Uploaded</p>
                      <p className="text-xs text-blue-700">
                        {uploadFile?.name || 'Drawing file'}
                        {uploadFile && ` (${(uploadFile.size / (1024 * 1024)).toFixed(2)} MB)`}
                      </p>
                      <p className="text-xs text-blue-600 mt-1">
                        ✓ Will be saved to cloud storage when quote is created
                      </p>
                    </div>
                  </div>
                )}

                {/* Metadata row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-lg">
                  {analysisResult.drawingType && (
                    <div>
                      <span className="text-xs text-gray-500 block">Drawing Type</span>
                      <span className="font-medium text-gray-900">
                        {analysisResult.drawingType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                      </span>
                    </div>
                  )}
                  {analysisResult.metadata?.jobNumber && (
                    <div>
                      <span className="text-xs text-gray-500 block">Job #</span>
                      <span className="font-medium text-gray-900">{analysisResult.metadata.jobNumber}</span>
                    </div>
                  )}
                  <div>
                    <span className="text-xs text-gray-500 block">Thickness</span>
                    <span className="font-medium text-gray-900">
                      {analysisResult.metadata?.defaultThickness || 20}mm
                    </span>
                  </div>
                  <div>
                    <span className="text-xs text-gray-500 block">Detected</span>
                    <span className="font-medium text-gray-900">
                      {extractedRoomNames.length} room{extractedRoomNames.length !== 1 ? 's' : ''}, {extractedPieces.length} piece{extractedPieces.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                </div>

                {/* Warnings */}
                {analysisResult.warnings && analysisResult.warnings.length > 0 && (
                  <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
                    <div className="flex items-start gap-2">
                      <svg className="h-5 w-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                      <ul className="list-disc list-inside">
                        {analysisResult.warnings.map((warning, i) => (
                          <li key={i}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}

                {/* Detected Pieces by Room */}
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-3">
                    Detected Pieces ({extractedPieces.filter((p) => p.selected).length} of {extractedPieces.length} selected)
                  </h4>

                  {extractedRoomNames.map((roomName) => {
                    const roomPieces = extractedPieces.filter((p) => p.roomName === roomName);
                    const roomPiecesWithIndices = roomPieces.map((p) => ({
                      piece: p,
                      index: extractedPieces.indexOf(p),
                    }));

                    return (
                      <div key={roomName} className="mb-4">
                        <div className="flex items-center gap-2 mb-2">
                          <input
                            type="checkbox"
                            checked={roomPieces.every((p) => p.selected)}
                            onChange={(e) => {
                              roomPiecesWithIndices.forEach(({ index }) => {
                                updateExtractedPiece(index, { selected: e.target.checked });
                              });
                            }}
                            className="h-4 w-4 text-primary-600 rounded"
                          />
                          <h5 className="text-sm font-medium text-gray-600">{roomName}</h5>
                          <span className="text-xs text-gray-400">
                            ({roomPieces.filter((p) => p.selected).length} of {roomPieces.length})
                          </span>
                          <select
                            className="ml-auto text-xs border-gray-200 rounded py-1 px-2"
                            value={roomPieces[0]?.roomName || roomName}
                            onChange={(e) => {
                              roomPiecesWithIndices.forEach(({ index }) => {
                                updateExtractedPiece(index, { roomName: e.target.value });
                              });
                            }}
                          >
                            {ROOM_TYPES.map((type) => (
                              <option key={type} value={type}>
                                {type}
                              </option>
                            ))}
                            {!ROOM_TYPES.includes(roomName) && (
                              <option value={roomName}>{roomName}</option>
                            )}
                          </select>
                        </div>

                        <div className="space-y-2">
                          {roomPiecesWithIndices.map(({ piece, index }) => {
                            const hasEdges = !!(piece.edgeSelections.edgeTop || piece.edgeSelections.edgeBottom || piece.edgeSelections.edgeLeft || piece.edgeSelections.edgeRight);
                            return (
                            <div
                              key={index}
                              className={`border rounded-lg overflow-hidden transition-colors ${
                                piece.selected
                                  ? 'border-primary-300 bg-primary-50'
                                  : 'border-gray-200 bg-gray-50'
                              } ${piece.confidence < 0.5 ? 'border-orange-300' : ''}`}
                            >
                              <div className="p-3">
                                <div className="flex items-start gap-3">
                                  <input
                                    type="checkbox"
                                    checked={piece.selected}
                                    onChange={() => togglePieceSelection(index)}
                                    className="mt-1 h-4 w-4 text-primary-600 rounded"
                                  />
                                  <div className="flex-1 grid grid-cols-1 md:grid-cols-5 gap-2">
                                    <div className="md:col-span-2">
                                      <label className="block text-xs text-gray-500 mb-1">
                                        Description
                                      </label>
                                      <input
                                        type="text"
                                        className="input w-full text-sm py-1"
                                        value={piece.description}
                                        onChange={(e) =>
                                          updateExtractedPiece(index, { description: e.target.value })
                                        }
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">
                                        Length ({unitLabel})
                                      </label>
                                      <input
                                        type="number"
                                        className="input w-full text-sm py-1"
                                        value={piece.lengthMm}
                                        onChange={(e) =>
                                          updateExtractedPiece(index, { lengthMm: Number(e.target.value) })
                                        }
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">
                                        Width ({unitLabel})
                                      </label>
                                      <input
                                        type="number"
                                        className="input w-full text-sm py-1"
                                        value={piece.widthMm}
                                        onChange={(e) =>
                                          updateExtractedPiece(index, { widthMm: Number(e.target.value) })
                                        }
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-xs text-gray-500 mb-1">
                                        Thick ({unitLabel})
                                      </label>
                                      <input
                                        type="number"
                                        className="input w-full text-sm py-1"
                                        value={piece.thicknessMm}
                                        onChange={(e) =>
                                          updateExtractedPiece(index, { thicknessMm: Number(e.target.value) })
                                        }
                                      />
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {hasEdges && (
                                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                                        Edges
                                      </span>
                                    )}
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getConfidenceColor(piece.confidence)} ${getConfidenceBgColor(piece.confidence)}`}
                                      title={piece.confidence < 0.5 ? 'Low confidence - verify dimensions' : ''}
                                    >
                                      {Math.round(piece.confidence * 100)}%
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => togglePieceExpanded(index)}
                                      className="text-gray-400 hover:text-gray-600"
                                      title="Edit edge polishing"
                                    >
                                      <svg
                                        className={`h-5 w-5 transition-transform ${piece.expanded ? 'rotate-180' : ''}`}
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                      >
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                      </svg>
                                    </button>
                                  </div>
                                </div>
                                {/* Additional info */}
                                {(piece.shape || piece.cutouts || piece.notes) && (
                                  <div className="mt-2 ml-7 text-xs text-gray-500 flex flex-wrap gap-3">
                                    {piece.shape && (
                                      <span>
                                        <strong>Shape:</strong> {piece.shape}
                                      </span>
                                    )}
                                    {piece.cutouts && (
                                      <span>
                                        <strong>Cutouts:</strong> {piece.cutouts}
                                      </span>
                                    )}
                                    {piece.notes && (
                                      <span className="italic">{piece.notes}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              {/* Edge Selector - Expanded */}
                              {piece.expanded && piece.lengthMm > 0 && piece.widthMm > 0 && (
                                <div
                                  className="p-4 bg-white border-t border-gray-200 relative"
                                  style={{ zIndex: 100 }}
                                  onClick={(e) => e.stopPropagation()}
                                  onMouseDown={(e) => e.stopPropagation()}
                                >
                                  <EdgeSelector
                                    lengthMm={piece.lengthMm}
                                    widthMm={piece.widthMm}
                                    edgeSelections={piece.edgeSelections}
                                    edgeTypes={edgeTypes}
                                    onChange={(edges) => updatePieceEdges(index, edges)}
                                  />
                                  <div className="mt-3 flex justify-end">
                                    <button
                                      type="button"
                                      onClick={() => togglePieceExpanded(index)}
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
                      </div>
                    );
                  })}
                </div>

                {/* Import Button */}
                <button
                  type="button"
                  onClick={handleImportSelectedPieces}
                  className="btn-primary w-full"
                  disabled={extractedPieces.filter((p) => p.selected).length === 0}
                >
                  Import {extractedPieces.filter((p) => p.selected).length} Selected Piece
                  {extractedPieces.filter((p) => p.selected).length !== 1 ? 's' : ''} to Quote
                </button>
              </div>
            )}

            {/* No pieces detected */}
            {analysisResult && extractedPieces.length === 0 && (
              <div className="text-center py-8">
                <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h3 className="mt-2 text-sm font-medium text-gray-900">No pieces detected</h3>
                <p className="mt-1 text-sm text-gray-500">
                  Try uploading a clearer image or add pieces manually.
                </p>
                <button
                  type="button"
                  onClick={resetAnalysis}
                  className="mt-4 btn-secondary"
                >
                  Try another image
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Rooms and Pieces */}
      <div className="space-y-4" ref={piecesSectionRef}>
        {rooms.map((room) => (
          <div key={quote_rooms.id} className="card">
            <div className="p-4 border-b border-gray-200 flex items-center justify-between bg-gray-50 rounded-t-xl">
              <input
                type="text"
                className="text-lg font-semibold bg-transparent border-none focus:outline-none focus:ring-0 p-0"
                value={quote_rooms.name}
                onChange={(e) => updateRoomName(quote_rooms.id, e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => addPiece(quote_rooms.id)}
                  className="btn-secondary text-sm"
                >
                  + Add Piece
                </button>
                <button
                  type="button"
                  onClick={() => removeRoom(quote_rooms.id)}
                  className="text-red-600 hover:text-red-700 text-sm"
                >
                  Remove Room
                </button>
              </div>
            </div>

            <div className="p-4 space-y-4">
              {quote_rooms.pieces.length === 0 ? (
                <p className="text-gray-500 text-center py-4">
                  No pieces yet.{' '}
                  <button
                    type="button"
                    onClick={() => addPiece(quote_rooms.id)}
                    className="text-primary-600 hover:text-primary-700"
                  >
                    Add a piece
                  </button>
                </p>
              ) : (
                quote_rooms.pieces.map((piece) => {
                  const costs = calculatePieceCost(piece);
                  return (
                    <div key={piece.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-4 mb-4">
                        <div className="md:col-span-2">
                          <label className="label">Description</label>
                          <input
                            type="text"
                            className="input"
                            value={piece.description}
                            onChange={(e) =>
                              updatePiece(quote_rooms.id, piece.id, { description: e.target.value })
                            }
                            placeholder="e.g., Island Bench"
                          />
                        </div>
                        <div>
                          <label className="label">Length ({unitLabel})</label>
                          <input
                            type="number"
                            className="input"
                            value={piece.lengthMm}
                            onChange={(e) =>
                              updatePiece(quote_rooms.id, piece.id, { lengthMm: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div>
                          <label className="label">Width ({unitLabel})</label>
                          <input
                            type="number"
                            className="input"
                            value={piece.widthMm}
                            onChange={(e) =>
                              updatePiece(quote_rooms.id, piece.id, { widthMm: Number(e.target.value) })
                            }
                          />
                        </div>
                        <div>
                          <label className="label">Thickness</label>
                          <select
                            className="input"
                            value={piece.thicknessMm}
                            onChange={(e) =>
                              updatePiece(quote_rooms.id, piece.id, { thicknessMm: Number(e.target.value) })
                            }
                          >
                            <option value={20}>20mm</option>
                            <option value={30}>30mm</option>
                            <option value={40}>40mm</option>
                          </select>
                        </div>
                        <div>
                          <label className="label">Material</label>
                          <select
                            className="input"
                            value={piece.materialId || ''}
                            onChange={(e) =>
                              updatePiece(quote_rooms.id, piece.id, {
                                materialId: e.target.value ? Number(e.target.value) : null,
                              })
                            }
                          >
                            <option value="">Select...</option>
                            {materials.map((m) => (
                              <option key={m.id} value={m.id}>
                                {m.name}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/* Features */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Features & Cutouts</span>
                          <button
                            type="button"
                            onClick={() => addFeature(quote_rooms.id, piece.id)}
                            className="text-sm text-primary-600 hover:text-primary-700"
                          >
                            + Add Feature
                          </button>
                        </div>
                        {piece.features.length > 0 && (
                          <div className="space-y-2">
                            {piece.features.map((feature) => (
                              <div key={feature.id} className="flex items-center gap-2">
                                <select
                                  className="input flex-1"
                                  value={feature.name}
                                  onChange={(e) =>
                                    handleFeatureChange(quote_rooms.id, piece.id, feature.id, e.target.value)
                                  }
                                >
                                  {featureOptions.map((opt) => (
                                    <option key={opt.id} value={opt.name}>
                                      {opt.name} ({formatCurrency(Number(opt.price))})
                                    </option>
                                  ))}
                                </select>
                                <input
                                  type="number"
                                  className="input w-20"
                                  value={feature.quantity}
                                  min={1}
                                  onChange={(e) =>
                                    updateFeature(quote_rooms.id, piece.id, feature.id, {
                                      quantity: Number(e.target.value),
                                    })
                                  }
                                />
                                <span className="text-sm text-gray-600 w-24 text-right">
                                  {formatCurrency(feature.unitPrice * feature.quantity)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => removeFeature(quote_rooms.id, piece.id, feature.id)}
                                  className="text-red-600 hover:text-red-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Edge Polish Selection */}
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-gray-700">Edge Polish</span>
                          <button
                            type="button"
                            onClick={() => updatePiece(quote_rooms.id, piece.id, { showEdgeSelector: !piece.showEdgeSelector })}
                            className="text-sm text-primary-600 hover:text-primary-700 flex items-center gap-1"
                          >
                            {piece.showEdgeSelector ? (
                              <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                                Hide
                              </>
                            ) : (
                              <>
                                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                                {(piece.edgeTop || piece.edgeBottom || piece.edgeLeft || piece.edgeRight) ? 'Edit Edges' : 'Add Edges'}
                              </>
                            )}
                          </button>
                        </div>
                        {!piece.showEdgeSelector && (piece.edgeTop || piece.edgeBottom || piece.edgeLeft || piece.edgeRight) && (
                          <div className="text-sm text-gray-500">
                            Edges: {[
                              piece.edgeTop && 'Top',
                              piece.edgeRight && 'Right',
                              piece.edgeBottom && 'Bottom',
                              piece.edgeLeft && 'Left'
                            ].filter(Boolean).join(', ') || 'None'}
                          </div>
                        )}
                        {piece.showEdgeSelector && piece.lengthMm > 0 && piece.widthMm > 0 && (
                          <div
                            className="relative"
                            style={{ zIndex: 100 }}
                            onClick={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                          >
                            <EdgeSelector
                              lengthMm={piece.lengthMm}
                              widthMm={piece.widthMm}
                              edgeSelections={{
                                edgeTop: piece.edgeTop,
                                edgeBottom: piece.edgeBottom,
                                edgeLeft: piece.edgeLeft,
                                edgeRight: piece.edgeRight,
                              }}
                              edgeTypes={edgeTypes}
                              onChange={(edges) => updatePiece(quote_rooms.id, piece.id, {
                                edgeTop: edges.edgeTop,
                                edgeBottom: edges.edgeBottom,
                                edgeLeft: edges.edgeLeft,
                                edgeRight: edges.edgeRight,
                              })}
                            />
                          </div>
                        )}
                      </div>

                      {/* Piece Summary */}
                      <div className="mt-4 pt-4 border-t border-gray-200 flex items-center justify-between">
                        <div className="text-sm text-gray-500">
                          {formatAreaFromSqm(calculateArea(piece.lengthMm, piece.widthMm), unitSystem)} ×{' '}
                          {piece.thicknessMm}{unitLabel}
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-sm text-gray-600">
                            Material: {formatCurrency(costs.materialCost)} | Features:{' '}
                            {formatCurrency(costs.featuresCost)}
                          </span>
                          <span className="font-semibold">{formatCurrency(costs.total)}</span>
                          <button
                            type="button"
                            onClick={() => removePiece(quote_rooms.id, piece.id)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ))}

        <button type="button" onClick={addRoom} className="btn-secondary w-full">
          + Add Room
        </button>

        {/* Room Type Selector Modal */}
        {showRoomSelector && (
          <div className="fixed inset-0 z-50 overflow-y-auto">
            <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setShowRoomSelector(false)} />
            <div className="flex min-h-full items-center justify-center p-4">
              <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full p-6">
                <h3 className="text-lg font-semibold mb-4">Select Room Type</h3>
                <div className="grid grid-cols-2 gap-2">
                  {roomTypes.map((type) => (
                    <button
                      key={type}
                      onClick={() => addRoomWithType(type)}
                      className="btn-secondary text-left"
                    >
                      {type}
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setShowRoomSelector(false)}
                  className="mt-4 w-full btn-secondary"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="card p-6">
        <label className="label">Notes (visible on quote)</label>
        <textarea
          className="input"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Any special notes for this quote..."
        />
      </div>

      {/* Totals and Actions */}
      <div className="card p-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex justify-between gap-8">
              <span className="text-gray-600">Pieces Subtotal:</span>
              <span className="font-medium">{formatCurrency(totals.subtotal - totals.deliveryCost - totals.templatingCost)}</span>
            </div>
            {totals.deliveryCost > 0 && (
              <div className="flex justify-between gap-8">
                <span className="text-gray-600">Delivery:</span>
                <span className="font-medium">{formatCurrency(totals.deliveryCost)}</span>
              </div>
            )}
            {totals.templatingCost > 0 && (
              <div className="flex justify-between gap-8">
                <span className="text-gray-600">Templating:</span>
                <span className="font-medium">{formatCurrency(totals.templatingCost)}</span>
              </div>
            )}
            <div className="flex justify-between gap-8 pt-2 border-t border-gray-200">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">{formatCurrency(totals.subtotal)}</span>
            </div>
            <div className="flex justify-between gap-8">
              <span className="text-gray-600">GST ({taxRate}%):</span>
              <span className="font-medium">{formatCurrency(totals.taxAmount)}</span>
            </div>
            <div className="flex justify-between gap-8 text-lg">
              <span className="font-semibold">Total:</span>
              <span className="font-bold text-primary-600">{formatCurrency(totals.total)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="btn-secondary"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => handleSave('draft')}
              className="btn-secondary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              type="button"
              onClick={() => handleSave('sent')}
              className="btn-primary"
              disabled={saving}
            >
              {saving ? 'Saving...' : 'Save & Mark as Sent'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
