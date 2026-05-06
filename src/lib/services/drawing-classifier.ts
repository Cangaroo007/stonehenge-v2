import { DrawingClass, DrawingFormat } from '@prisma/client';

export interface ClassificationInput {
  filename: string;
  mimeType: string;
  fileSize: number;
  pageCount: number | null;
  hasTextLayer: boolean | null;
  pdfProducer: string | null;
}

export interface ClassificationResult {
  drawingClass: DrawingClass;
  drawingFormat: DrawingFormat;
  confidence: number;
  signals: string[];
}

// Case-insensitive substring matches against PDF producer string.
const CAD_PRODUCERS = [
  'microstation',
  'autocad',
  'illustrator',
  'libreoffice',
  'revit',
  'vectorworks',
  'sketchup',
  'archicad',
  'bentley',
] as const;

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return '';
  return filename.slice(dot + 1).toLowerCase();
}

function detectFormat(mimeType: string, filename: string): DrawingFormat | null {
  const mime = mimeType.toLowerCase();
  const ext = getExtension(filename);

  if (mime === 'application/pdf') return 'PDF';
  if (mime === 'image/jpeg') return 'JPEG';
  if (mime === 'image/png') return 'PNG';
  if (mime === 'image/heic') return 'HEIC';
  if (mime === 'application/dxf') return 'DXF';

  // Fall back to filename extension for generic / missing mime types.
  if (ext === 'pdf') return 'PDF';
  if (ext === 'jpg' || ext === 'jpeg') return 'JPEG';
  if (ext === 'png') return 'PNG';
  if (ext === 'heic') return 'HEIC';
  if (ext === 'dxf') return 'DXF';
  if (ext === 'dwg') return 'DWG';
  if (ext === 'ifc') return 'IFC';

  return null;
}

function findCadProducer(producer: string | null): string | null {
  if (!producer) return null;
  const lower = producer.toLowerCase();
  for (const name of CAD_PRODUCERS) {
    if (lower.includes(name)) return name;
  }
  return null;
}

export function classifyDrawing(input: ClassificationInput): ClassificationResult {
  const format = detectFormat(input.mimeType, input.filename);
  if (format === null) {
    // Contract: callers must validate file type before calling the classifier.
    // The upload route enforces an allow-list, so this branch should never fire
    // in production — fail loudly if it does.
    throw new Error(
      `classifyDrawing: unrecognised format for "${input.filename}" (mimeType="${input.mimeType}")`,
    );
  }

  const fileSizeKb = Math.round(input.fileSize / 1024);
  const sizeSignal = `File size: ${fileSizeKb}KB`;

  if (format === 'DXF') {
    return {
      drawingClass: 'C_CAD_BENCHTOP',
      drawingFormat: format,
      confidence: 0.95,
      signals: ['DXF vector file', sizeSignal],
    };
  }
  if (format === 'DWG') {
    return {
      drawingClass: 'C_CAD_BENCHTOP',
      drawingFormat: format,
      confidence: 0.95,
      signals: ['DWG CAD file', sizeSignal],
    };
  }
  if (format === 'IFC') {
    return {
      drawingClass: 'E_CONSTRUCTION_PLAN',
      drawingFormat: format,
      confidence: 0.95,
      signals: ['IFC BIM file', sizeSignal],
    };
  }
  if (format === 'JPEG' || format === 'PNG' || format === 'HEIC') {
    return {
      drawingClass: 'A_PENCIL_SKETCH',
      drawingFormat: format,
      confidence: 0.7,
      signals: ['Image file — likely photo/sketch', sizeSignal],
    };
  }

  // PDF branch — precedence matters and matches the spec's rule ordering:
  // 1. >=10 pages wins over CAD-producer detection (multi-page packs are packs
  //    regardless of authoring tool).
  // 2. CAD producer cascade — text-layer + page-count branches.
  // 3. No text layer → scanned sketch.
  // 4. Few pages with text layer → shop drawing.
  // 5. Default to shop drawing at low confidence.
  const { pageCount, hasTextLayer } = input;
  const cadProducer = findCadProducer(input.pdfProducer);

  if (pageCount !== null && pageCount >= 10) {
    return {
      drawingClass: 'D_CABINETRY_PACK',
      drawingFormat: format,
      confidence: 0.85,
      signals: [`${pageCount} pages — multi-page pack`, sizeSignal],
    };
  }

  if (cadProducer !== null) {
    const producerLabel = input.pdfProducer ?? cadProducer;
    if (hasTextLayer === true && pageCount !== null && pageCount <= 3) {
      return {
        drawingClass: 'C_CAD_BENCHTOP',
        drawingFormat: format,
        confidence: 0.9,
        signals: [`Vector PDF from ${producerLabel}, text layer present`, sizeSignal],
      };
    }
    if (pageCount !== null && pageCount >= 4 && pageCount <= 9) {
      return {
        drawingClass: 'E_CONSTRUCTION_PLAN',
        drawingFormat: format,
        confidence: 0.75,
        signals: [`Multi-page vector PDF from ${producerLabel}`, sizeSignal],
      };
    }
    return {
      drawingClass: 'C_CAD_BENCHTOP',
      drawingFormat: format,
      confidence: 0.8,
      signals: [`Vector PDF from ${producerLabel}`, sizeSignal],
    };
  }

  if (hasTextLayer === false) {
    return {
      drawingClass: 'A_PENCIL_SKETCH',
      drawingFormat: format,
      confidence: 0.6,
      signals: ['PDF with no text layer — likely scanned sketch', sizeSignal],
    };
  }

  if (pageCount !== null && pageCount <= 3 && hasTextLayer === true) {
    return {
      drawingClass: 'B_SHOP_DRAWING',
      drawingFormat: format,
      confidence: 0.7,
      signals: ['Few-page PDF with text layer', sizeSignal],
    };
  }

  return {
    drawingClass: 'B_SHOP_DRAWING',
    drawingFormat: format,
    confidence: 0.5,
    signals: ['Unclassified PDF — defaulting to shop drawing', sizeSignal],
  };
}
