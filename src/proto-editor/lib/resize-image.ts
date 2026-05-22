// apps/web/src/lib/resize-image.ts
//
// Client-side image resize. iPhone photos commonly weigh 5–8 MB; the
// Anthropic Vision API caps single image attachments at 5 MB. We resize
// the image client-side before base64-encoding so the upload never hits
// that ceiling.
//
// The pure helpers `computeResizeDims` and `shouldSkipResize` are
// exported for unit testing under the project's `node` Vitest
// environment. The full pipe (`resizeImage`) uses browser APIs (Image,
// URL.createObjectURL, HTMLCanvasElement) and is exercised only in the
// browser.

const DEFAULT_MAX_DIMENSION = 2048;
const DEFAULT_QUALITY = 0.85;
const DEFAULT_MIME = "image/jpeg";
/** Max bytes an image can be before resize kicks in (~4 MB). Files at
 *  or below this size on the longest dimension pass through unchanged. */
const PASS_THROUGH_BYTES = 4 * 1024 * 1024;

export interface ResizeImageOptions {
  readonly maxDimension?: number;
  readonly quality?: number;
  readonly mimeType?: string;
}

export interface ResizeDims {
  readonly width: number;
  readonly height: number;
}

/**
 * Pure helper. Computes the target dimensions for a resize: the longest
 * side becomes `maxDimension`; the shorter side scales proportionally.
 * If both sides are already ≤ `maxDimension`, the source dimensions are
 * returned unchanged.
 */
export function computeResizeDims(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
): ResizeDims {
  if (srcWidth <= maxDimension && srcHeight <= maxDimension) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }
  const scale = maxDimension / Math.max(srcWidth, srcHeight);
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}

/**
 * Pure helper. `true` when the source image is small enough to skip the
 * canvas round-trip — both dimensions ≤ maxDimension AND file size is
 * below the pass-through byte ceiling.
 */
export function shouldSkipResize(
  srcWidth: number,
  srcHeight: number,
  sizeBytes: number,
  maxDimension: number,
): boolean {
  if (srcWidth > maxDimension || srcHeight > maxDimension) return false;
  if (sizeBytes > PASS_THROUGH_BYTES) return false;
  return true;
}

/**
 * Resizes an image File/Blob so its longest side fits within
 * `maxDimension` (default 2048). Returns a JPEG Blob at the requested
 * quality. If both source dimensions are already within the limit AND
 * the file is below ~4 MB, the source Blob is returned unchanged.
 */
export async function resizeImage(
  file: File | Blob,
  options: ResizeImageOptions = {},
): Promise<Blob> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const mimeType = options.mimeType ?? DEFAULT_MIME;

  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);

    if (shouldSkipResize(img.naturalWidth, img.naturalHeight, file.size, maxDimension)) {
      return file;
    }

    const dims = computeResizeDims(img.naturalWidth, img.naturalHeight, maxDimension);

    const canvas = document.createElement("canvas");
    canvas.width = dims.width;
    canvas.height = dims.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("resizeImage: 2D context unavailable");
    }
    ctx.drawImage(img, 0, 0, dims.width, dims.height);

    const blob = await canvasToBlob(canvas, mimeType, quality);
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("resizeImage: image failed to load"));
    img.src = url;
  });
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  mimeType: string,
  quality: number,
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("resizeImage: canvas.toBlob produced null"));
          return;
        }
        resolve(blob);
      },
      mimeType,
      quality,
    );
  });
}
