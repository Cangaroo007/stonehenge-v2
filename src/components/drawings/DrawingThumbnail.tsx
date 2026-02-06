'use client';

import { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import PDF thumbnail as fallback for SSR-safe rendering
const PdfThumbnail = dynamic(
  () => import('./PdfThumbnail').then((mod) => mod.PdfThumbnail),
  { ssr: false }
);

interface DrawingThumbnailProps {
  drawingId: string;
  filename: string;
  onClick?: () => void;
  className?: string;
}

export function DrawingThumbnail({
  drawingId,
  filename,
  onClick,
  className = '',
}: DrawingThumbnailProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [thumbnailUrl, setThumbnailUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [thumbnailError, setThumbnailError] = useState(false);

  // Check if file is a PDF based on filename or mime type
  const isPdf = filename.toLowerCase().endsWith('.pdf') || mimeType === 'application/pdf';

  useEffect(() => {
    let cancelled = false;

    async function fetchUrls() {
      try {
        // Fetch both the original URL and thumbnail URL in parallel
        const [urlRes, thumbRes] = await Promise.allSettled([
          fetch(`/api/drawings/${drawingId}/url`),
          fetch(`/api/drawings/${drawingId}/thumbnail`),
        ]);

        if (cancelled) return;

        // Handle original URL
        if (urlRes.status === 'fulfilled' && urlRes.value.ok) {
          const data = await urlRes.value.json();
          if (!cancelled && data.url && !data.placeholder) {
            setImageUrl(data.url);
            setMimeType(data.mimeType);
          }
        }

        // Handle thumbnail URL (for PDFs)
        if (thumbRes.status === 'fulfilled' && thumbRes.value.ok) {
          const data = await thumbRes.value.json();
          if (!cancelled && data.url) {
            setThumbnailUrl(data.url);
          }
        }

        // If neither worked, set error
        if (
          !cancelled &&
          (urlRes.status === 'rejected' || !urlRes.value.ok) &&
          (thumbRes.status === 'rejected' || !thumbRes.value.ok)
        ) {
          setImageError(true);
        }
      } catch {
        if (!cancelled) setImageError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchUrls();
    return () => { cancelled = true; };
  }, [drawingId]);

  if (loading) {
    return (
      <div className={`bg-gray-100 rounded-lg animate-pulse ${className}`} />
    );
  }

  if (imageError || (!imageUrl && !thumbnailUrl)) {
    return (
      <div className={`bg-gray-100 rounded-lg flex flex-col items-center justify-center text-gray-400 ${className}`}>
        <svg className="h-8 w-8 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
        </svg>
        <span className="text-xs">Failed to load</span>
      </div>
    );
  }

  // PDF with server-generated thumbnail available
  if (isPdf && thumbnailUrl && !thumbnailError) {
    return (
      <div
        className={`relative rounded-lg overflow-hidden cursor-pointer group bg-gray-100 ${className}`}
        onClick={onClick}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={thumbnailUrl}
          alt={filename}
          className="absolute inset-0 w-full h-full object-contain bg-white"
          onError={() => setThumbnailError(true)}
        />

        {/* PDF badge */}
        <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">
          PDF
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
          <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2">
            <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          </div>
        </div>
      </div>
    );
  }

  // PDF without server thumbnail - fall back to client-side react-pdf renderer
  if (isPdf && imageUrl) {
    return <PdfThumbnail url={imageUrl} filename={filename} onClick={onClick} className={className} />;
  }

  // Image Thumbnail - display normally
  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer group ${className}`}
      onClick={onClick}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl!}
        alt={filename}
        className="absolute inset-0 w-full h-full object-contain bg-gray-50"
        onError={() => setImageError(true)}
      />
      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center">
        <div className="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 rounded-full p-2">
          <svg className="h-5 w-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v3m0 0v3m0-3h3m-3 0H7" />
          </svg>
        </div>
      </div>
    </div>
  );
}
