/**
 * Cloudflare R2 Storage Module
 *
 * This module handles file uploads and downloads to/from Cloudflare R2.
 * Uses AWS S3 SDK with R2 endpoint configuration.
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { logger } from '@/lib/logger';

// Build R2 endpoint from either R2_ENDPOINT or R2_ACCOUNT_ID
function getR2Endpoint(): string | null {
  if (process.env.R2_ENDPOINT) {
    return process.env.R2_ENDPOINT;
  }
  if (process.env.R2_ACCOUNT_ID) {
    return `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
  }
  return null;
}

// Initialize S3 client for R2 (only if credentials are configured)
function getR2Client(): S3Client | null {
  const endpoint = getR2Endpoint();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    logger.warn('[R2] Missing R2 credentials. Storage operations will be mocked.');
    return null;
  }

  return new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
  });
}

const BUCKET_NAME = process.env.R2_BUCKET_NAME || 'stonehenge-drawings';

// In-memory storage for development/testing when R2 is not configured
const memoryStorage = new Map<string, { data: Buffer; contentType: string }>();

/**
 * Check whether R2 storage is properly configured.
 * Returns true if real R2 will be used, false if falling back to mock.
 */
export function isR2Configured(): boolean {
  const endpoint = getR2Endpoint();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  return !!(endpoint && accessKeyId && secretAccessKey);
}

/**
 * Upload a file to R2 storage
 * @param key - The R2 object key (path in bucket)
 * @param data - The file data as Buffer
 * @param contentType - MIME type of the file
 */
export async function uploadToR2(
  key: string,
  data: Buffer,
  contentType: string
): Promise<void> {
  const client = getR2Client();

  if (!client) {
    // In production, missing R2 credentials is an error - don't silently mock
    if (process.env.NODE_ENV === 'production') {
      logger.error('[R2] R2 credentials not configured in production');
      throw new Error('R2 storage not configured. File upload unavailable.');
    }
    // Mock upload for development only
    logger.warn(`[R2] Mock upload (dev only): ${key} (${data.length} bytes)`);
    memoryStorage.set(key, { data, contentType });
    return;
  }

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
    logger.info(`[R2] Uploaded: ${key} (${data.length} bytes)`);
  } catch (error) {
    logger.error(`[R2] Upload failed for ${key}:`, error);
    throw error;
  }
}

/**
 * Get a file from R2 storage
 * @param key - The R2 object key
 * @returns The file data as Buffer, or null if not found
 */
export async function getFromR2(key: string): Promise<Buffer | null> {
  const client = getR2Client();

  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[R2] Cannot retrieve file - R2 not configured in production');
      return null;
    }
    // Mock retrieval for development
    const stored = memoryStorage.get(key);
    if (stored) {
      logger.debug(`[R2] Mock retrieval: ${key}`);
      return stored.data;
    }
    return null;
  }

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: key,
      })
    );

    if (response.Body) {
      const chunks: Uint8Array[] = [];
      // @ts-expect-error - Body is a readable stream in Node.js
      for await (const chunk of response.Body) {
        chunks.push(chunk);
      }
      return Buffer.concat(chunks);
    }
    return null;
  } catch (error) {
    logger.error(`[R2] Error getting ${key}:`, error);
    return null;
  }
}

/**
 * Delete a file from R2 storage
 * @param storageKey - The R2 object key (path in bucket)
 */
export async function deleteFromR2(storageKey: string): Promise<void> {
  const client = getR2Client();

  if (!client) {
    if (process.env.NODE_ENV === 'production') {
      logger.error('[R2] Cannot delete file - R2 not configured in production');
      return;
    }
    // Mock deletion for development
    logger.debug(`[R2] Mock delete: ${storageKey}`);
    memoryStorage.delete(storageKey);
    return;
  }

  await client.send(
    new DeleteObjectCommand({
      Bucket: BUCKET_NAME,
      Key: storageKey,
    })
  );
  logger.info(`[R2] Deleted: ${storageKey}`);
}

/**
 * Generate a presigned URL for uploading to R2
 * @param key - The R2 object key
 * @param contentType - MIME type of the file
 * @param expiresIn - URL expiration time in seconds (default: 3600)
 */
export async function getUploadUrl(
  key: string,
  contentType: string,
  expiresIn: number = 3600
): Promise<string> {
  const client = getR2Client();

  if (!client) {
    // Return a mock URL for development
    logger.debug(`[R2] Mock upload URL for: ${key}`);
    return `/api/mock-upload?key=${encodeURIComponent(key)}`;
  }

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: key,
    ContentType: contentType,
  });

  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generate a presigned URL for downloading from R2
 * @param key - The R2 object key
 * @param expiresIn - URL expiration time in seconds (default: 3600)
 */
export async function getDownloadUrl(
  key: string,
  expiresIn: number = 3600
): Promise<string> {
  const client = getR2Client();

  if (!client) {
    // Return a mock URL for development (via our API)
    logger.warn('[R2] No R2 client available, returning mock URL');
    return `/api/drawings/file?key=${encodeURIComponent(key)}`;
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });

    const url = await getSignedUrl(client, command, { expiresIn });
    logger.debug('[R2] Presigned URL generated successfully');
    return url;
  } catch (error) {
    logger.error('[R2] Failed to generate presigned URL:', error);
    throw error;
  }
}

/**
 * Get the content type stored with a file
 * @param key - The R2 object key
 * @returns The content type, or null if not found
 */
export function getStoredContentType(key: string): string | null {
  const stored = memoryStorage.get(key);
  return stored?.contentType || null;
}
