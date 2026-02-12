'use client';

import { useState, useCallback, useRef } from 'react';

export interface SelectedFile {
  file: File;
  id: string;
}

interface MultiFileUploadProps {
  /** Called when files are added (appended to existing selection) */
  onFilesSelected: (files: File[]) => void;
  /** Maximum number of files allowed */
  maxFiles?: number;
  /** Accepted MIME types */
  accept?: string;
  /** Max file size in bytes */
  maxFileSize?: number;
  /** Whether uploading/processing is in progress */
  disabled?: boolean;
  /** Currently selected files to display */
  selectedFiles: SelectedFile[];
  /** Called when a file is removed from the selection */
  onRemoveFile: (id: string) => void;
}

export default function MultiFileUpload({
  onFilesSelected,
  maxFiles = 20,
  accept = '.pdf,.png,.jpg,.jpeg',
  maxFileSize = 32 * 1024 * 1024,
  disabled = false,
  selectedFiles,
  onRemoveFile,
}: MultiFileUploadProps) {
  const [dragOver, setDragOver] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const validateAndAdd = useCallback(
    (fileList: FileList | File[]) => {
      setValidationError(null);
      const files = Array.from(fileList);

      if (selectedFiles.length + files.length > maxFiles) {
        setValidationError(
          `Maximum ${maxFiles} files allowed. You have ${selectedFiles.length} selected.`
        );
        return;
      }

      const allowedTypes = ['application/pdf', 'image/png', 'image/jpeg', 'image/jpg'];
      const validFiles: File[] = [];

      for (const file of files) {
        if (!allowedTypes.includes(file.type)) {
          setValidationError(`"${file.name}" is not a supported file type. Use PDF, PNG, or JPG.`);
          return;
        }
        if (file.size > maxFileSize) {
          setValidationError(
            `"${file.name}" exceeds the maximum file size of ${Math.round(maxFileSize / (1024 * 1024))}MB.`
          );
          return;
        }
        // Check for duplicate file names
        const isDuplicate = selectedFiles.some((sf) => sf.file.name === file.name);
        if (isDuplicate) {
          setValidationError(`"${file.name}" has already been added.`);
          return;
        }
        validFiles.push(file);
      }

      if (validFiles.length > 0) {
        onFilesSelected(validFiles);
      }
    },
    [selectedFiles, maxFiles, maxFileSize, onFilesSelected]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (disabled) return;
      validateAndAdd(e.dataTransfer.files);
    },
    [disabled, validateAndAdd]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        validateAndAdd(e.target.files);
      }
      // Reset the input so the same file can be selected again if removed
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [validateAndAdd]
  );

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors ${
          disabled
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed'
            : dragOver
              ? 'border-blue-400 bg-blue-50'
              : 'border-gray-300 hover:border-gray-400 cursor-pointer'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => {
          if (!disabled) fileInputRef.current?.click();
        }}
      >
        <svg
          className="mx-auto h-10 w-10 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="mt-2 text-sm text-gray-600">
          Drag and drop Finishes Register PDFs here, or{' '}
          <span className="text-blue-600 font-medium">browse files</span>
        </p>
        <p className="mt-1 text-xs text-gray-400">
          PDF, PNG, or JPG up to 32MB &mdash; select multiple files
        </p>
        <input
          ref={fileInputRef}
          type="file"
          accept={accept}
          multiple
          className="hidden"
          onChange={handleFileInput}
          disabled={disabled}
        />
      </div>

      {/* Validation error */}
      {validationError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {validationError}
        </div>
      )}

      {/* File list */}
      {selectedFiles.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {selectedFiles.length} file{selectedFiles.length !== 1 ? 's' : ''} selected
          </p>
          {selectedFiles.map((sf) => (
            <div
              key={sf.id}
              className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <svg
                  className="h-4 w-4 text-gray-400 flex-shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                <span className="text-sm text-gray-700 truncate">{sf.file.name}</span>
                <span className="text-xs text-gray-400 flex-shrink-0">
                  {formatFileSize(sf.file.size)}
                </span>
              </div>
              {!disabled && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveFile(sf.id);
                  }}
                  className="text-gray-400 hover:text-red-600 ml-2 flex-shrink-0"
                  title="Remove file"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
