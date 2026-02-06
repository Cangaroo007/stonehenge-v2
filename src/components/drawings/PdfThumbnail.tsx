'use client';

import { useState, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';

// Configure PDF.js worker
if (typeof window !== 'undefined') {
  pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

interface PdfThumbnailProps {
  url: string;
  filename: string;
  onClick?: () => void;
  className?: string;
}

export function PdfThumbnail({ url, filename, onClick, className = '' }: PdfThumbnailProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [error, setError] = useState(false);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setError(false);
  }

  function onDocumentLoadError(error: Error) {
    console.error('PDF load error:', error);
    setError(true);
  }

  if (error) {
    // Fallback to PDF icon if rendering fails
    return (
      <div
        className={`relative rounded-lg overflow-hidden cursor-pointer group bg-gradient-to-br from-red-50 to-red-100 border border-red-200 ${className}`}
        onClick={onClick}
      >
        <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-red-600">
          <svg className="h-12 w-12 mb-2" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            <path d="M14 2v6h6M9 13h6M9 17h3" stroke="white" strokeWidth="1.5" fill="none"/>
          </svg>
          <div className="text-xs font-semibold uppercase tracking-wider">PDF</div>
          <div className="text-[10px] mt-1 text-center line-clamp-2 opacity-75">
            {filename}
          </div>
        </div>
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

  return (
    <div
      className={`relative rounded-lg overflow-hidden cursor-pointer group bg-gray-100 ${className}`}
      onClick={onClick}
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <Document
          file={url}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={
            <div className="flex flex-col items-center justify-center text-gray-400">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400 mb-2"></div>
              <span className="text-xs">Loading PDF...</span>
            </div>
          }
        >
          <Page
            pageNumber={1}
            width={200}
            renderTextLayer={false}
            renderAnnotationLayer={false}
            className="pdf-page"
          />
        </Document>
      </div>

      {/* PDF badge */}
      <div className="absolute top-2 right-2 bg-red-500 text-white text-[10px] font-bold px-2 py-1 rounded">
        PDF
      </div>

      {/* Page count badge */}
      {numPages > 1 && (
        <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-1 rounded">
          {numPages} pages
        </div>
      )}

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
