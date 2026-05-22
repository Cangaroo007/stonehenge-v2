export const DRAWING_FILE_ACCEPT =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.bmp,.tif,.tiff,.heic,.heif';

export const DRAWING_FILE_LABEL =
  'PDF, JPG, PNG, GIF, WebP, BMP, TIFF, HEIC';

export const ALLOWED_DRAWING_MIME_TYPES = [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/x-ms-bmp',
  'image/tiff',
  'image/heic',
  'image/heif',
] as const;

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  heic: 'image/heic',
  heif: 'image/heif',
};

export function getDrawingFileExtension(filename: string): string {
  return filename.split('.').pop()?.toLowerCase() ?? '';
}

export function resolveDrawingMimeType(filename: string, mimeType?: string | null): string {
  const normalisedMimeType = mimeType?.trim().toLowerCase();
  if (normalisedMimeType) return normalisedMimeType;
  return MIME_TYPE_BY_EXTENSION[getDrawingFileExtension(filename)] ?? '';
}

export function isAllowedDrawingFile(filename: string, mimeType?: string | null): boolean {
  const resolvedMimeType = resolveDrawingMimeType(filename, mimeType);
  if (ALLOWED_DRAWING_MIME_TYPES.includes(resolvedMimeType as typeof ALLOWED_DRAWING_MIME_TYPES[number])) {
    return true;
  }
  return getDrawingFileExtension(filename) in MIME_TYPE_BY_EXTENSION;
}
