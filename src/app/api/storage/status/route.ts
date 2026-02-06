import { NextResponse } from 'next/server';
import { isR2Configured } from '@/lib/storage/r2';
import { S3Client, HeadBucketCommand } from '@aws-sdk/client-s3';

/**
 * GET /api/storage/status
 * Check R2 storage configuration status (no auth required for diagnostics)
 */
export async function GET() {
  const configured = isR2Configured();
  
  const status = {
    configured,
    environment: process.env.NODE_ENV,
    hasAccountId: !!process.env.R2_ACCOUNT_ID || !!process.env.R2_ENDPOINT,
    hasAccessKey: !!process.env.R2_ACCESS_KEY_ID,
    hasSecretKey: !!process.env.R2_SECRET_ACCESS_KEY,
    bucketName: process.env.R2_BUCKET_NAME || 'stonehenge-drawings (default)',
    canConnectToR2: false,
    r2Error: null as string | null,
  };

  // Try to actually connect to R2 if configured
  if (configured) {
    try {
      const endpoint = process.env.R2_ENDPOINT || 
        `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
      
      const client = new S3Client({
        region: 'auto',
        endpoint,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID!,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
        },
      });

      await client.send(new HeadBucketCommand({
        Bucket: process.env.R2_BUCKET_NAME || 'stonehenge-drawings',
      }));

      status.canConnectToR2 = true;
    } catch (error) {
      status.r2Error = error instanceof Error ? error.message : String(error);
    }
  }
  
  return NextResponse.json(status);
}

export const dynamic = 'force-dynamic';
