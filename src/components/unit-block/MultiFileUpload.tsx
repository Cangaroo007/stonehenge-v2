'use client';

import React, { useState, useRef, useCallback } from 'react';

export interface ProcessedFile {
  fileName: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: unknown;
  error?: string;
}

export interface MultiFileUploadProps {
  accept?: string;
  maxFiles?: number;
  onFilesSelected: (files: File[]) => void;
  onFileRemoved?: (index: number) => void;
  isProcessing?: boolean;
  processedFiles?: ProcessedFile[];
  label?: string;
  description?: string;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function fileMatchesAccept(file: File, accept: string): boolean {
  const acceptedTypes = accept.split(',').map((t) => t.trim().toLowerCase());
  const fileName = file.name.toLowerCase();
  const fileType = file.type.toLowerCase();

  return acceptedTypes.some((accepted) => {
    if (accepted.startsWith('.')) {
      return fileName.endsWith(accepted);
    }
    if (accepted.endsWith('/*')) {
      const baseType = accepted.replace('/*', '');
      return fileType.startsWith(baseType + '/');
    }
    return fileType === accepted;
  });
}

export default function MultiFileUpload({
  accept = '.pdf',
  maxFiles = 10,
  onFilesSelected,
  onFileRemoved,
  isProcessing = false,
  processedFiles = [],
  label,
  description,
}: MultiFileUploadProps) {
  const [dragActive, setDragActive] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFiles = useCallback(
    (incoming: File[]) => {
      const valid = incoming.filter((f) => fileMatchesAccept(f, accept));

      if (valid.length < incoming.length) {
        const rejected = incoming.length - valid.length;
        alert(
          `${rejected} file(s) rejected — only ${accept} files are accepted.`
        );
      }

      const currentCount = selectedFiles.length;
      const available = maxFiles - currentCount;

      if (available <= 0) {
        alert(`Maximum of ${maxFiles} file(s) already selected.`);
        return;
      }

      if (valid.length > available) {
        alert(
          `Only ${available} more file(s) can be added (limit: ${maxFiles}). Extra files have been excluded.`
        );
      }

      const toAdd = valid.slice(0, available);
      if (toAdd.length === 0) return;

      const updated = [...selectedFiles, ...toAdd];
      setSelectedFiles(updated);
      onFilesSelected(updated);
    },
    [accept, maxFiles, selectedFiles, onFilesSelected]
  );

  const handleDragEnter = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing) setDragActive(true);
    },
    [isProcessing]
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      if (!isProcessing) setDragActive(true);
    },
    [isProcessing]
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
    },
    []
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setDragActive(false);
      if (isProcessing) return;

      const files = Array.from(e.dataTransfer.files);
      handleFiles(files);
    },
    [isProcessing, handleFiles]
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        const files = Array.from(e.target.files);
        handleFiles(files);
      }
      // Reset input so the same file can be selected again
      if (inputRef.current) {
        inputRef.current.value = '';
      }
    },
    [handleFiles]
  );

  const handleZoneClick = useCallback(() => {
    if (!isProcessing && inputRef.current) {
      inputRef.current.click();
    }
  }, [isProcessing]);

  const handleRemove = useCallback(
    (index: number) => {
      const updated = selectedFiles.filter((_, i) => i !== index);
      setSelectedFiles(updated);
      onFileRemoved?.(index);
    },
    [selectedFiles, onFileRemoved]
  );

  const fileCount = selectedFiles.length;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-zinc-900 mb-1">
          {label}
        </label>
      )}
      {description && (
        <p className="text-sm text-gray-500 mb-3">{description}</p>
      )}

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={isProcessing ? -1 : 0}
        onClick={handleZoneClick}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleZoneClick();
          }
        }}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`
          border-2 border-dashed rounded-lg p-8
          flex flex-col items-center justify-center
          transition-colors
          ${
            isProcessing
              ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-60'
              : dragActive
                ? 'border-amber-500 bg-amber-50 cursor-pointer'
                : 'border-gray-300 bg-white hover:border-gray-400 cursor-pointer'
          }
          focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-zinc-900 focus-visible:ring-offset-2
        `}
      >
        {/* Upload icon */}
        <svg
          className={`w-10 h-10 mb-3 ${isProcessing ? 'text-gray-300' : 'text-gray-400'}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className={`text-sm ${isProcessing ? 'text-gray-400' : 'text-gray-600'}`}>
          Drop files here or click to browse
        </p>
        <p className="text-xs text-gray-400 mt-1">
          Accepted: {accept} &middot; Max {maxFiles} file(s)
        </p>
      </div>

      {/* Hidden file input */}
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        onChange={handleInputChange}
        className="hidden"
      />

      {/* File list */}
      {fileCount > 0 && (
        <ul className="mt-4 space-y-2">
          {selectedFiles.map((file, index) => {
            const processed = processedFiles[index];
            const status = processed?.status ?? 'pending';
            const errorMsg = processed?.error;

            return (
              <li
                key={`${file.name}-${index}`}
                className="flex items-start gap-3 rounded-md border border-zinc-200 bg-white px-3 py-2"
              >
                {/* Status icon */}
                <span className="mt-0.5 flex-shrink-0">
                  {status === 'pending' && (
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <circle cx="12" cy="12" r="10" strokeWidth={1.5} />
                      <path
                        strokeLinecap="round"
                        strokeWidth={1.5}
                        d="M12 6v6l4 2"
                      />
                    </svg>
                  )}
                  {status === 'processing' && (
                    <svg
                      className="w-5 h-5 text-amber-500 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth={4}
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                      />
                    </svg>
                  )}
                  {status === 'success' && (
                    <svg
                      className="w-5 h-5 text-green-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  )}
                  {status === 'error' && (
                    <svg
                      className="w-5 h-5 text-red-500"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  )}
                </span>

                {/* File details */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-zinc-900 truncate">{file.name}</p>
                  <p className="text-xs text-gray-400">
                    {formatFileSize(file.size)}
                  </p>
                  {status === 'error' && errorMsg && (
                    <p className="text-xs text-red-500 mt-0.5">{errorMsg}</p>
                  )}
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(index);
                  }}
                  disabled={status !== 'pending'}
                  className={`
                    flex-shrink-0 mt-0.5 rounded p-0.5 text-lg leading-none
                    ${
                      status === 'pending'
                        ? 'text-gray-400 hover:text-red-500 hover:bg-red-50 cursor-pointer'
                        : 'text-gray-200 cursor-not-allowed'
                    }
                  `}
                  title={status === 'pending' ? 'Remove file' : undefined}
                >
                  &times;
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Counter */}
      {fileCount > 0 && (
        <p className="mt-2 text-sm text-gray-500">
          {fileCount} file{fileCount !== 1 ? 's' : ''} selected
        </p>
      )}
    </div>
  );
}
